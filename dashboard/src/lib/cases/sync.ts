/**
 * Keeps a quote case's stage in step with its records, and ties a placement to its case.
 *
 *   syncStage(workItemId)        recomputes the stage from the placement, documents and debit note
 *   touchPlacement(placementId)  the same, for the case a placement belongs to (called on every line change)
 *   caseForPlacement(...)        the case a new placement belongs to: the one on its client thread, an
 *                                open renewal of the same client, or a new item (start point new_request
 *                                or midway). One case per piece of work, so the case worker and the
 *                                placement agent never open two items for one request.
 *   syncAllStages()              the hourly sweep's pass over every open quote case
 *
 * Writes are best-effort (sbTry): until the 20261103_case_stage migration is applied the columns
 * do not exist and nothing here throws.
 */
import { sbTry, enc } from '@/lib/crm/db'
import { STAGED_TYPES, isStage, stageFromRecords, type LineFacts, type Stage, type StartPoint } from './stage'

type Row = Record<string, any>
const SENT = new Set(['sent', 'acknowledged', 'info_requested', 'quoted', 'declined', 'expired'])

async function linesOf(placementId: string): Promise<LineFacts[]> {
  const [lines, dispatches, quotes] = await Promise.all([
    sbTry<Row[]>(`placement_lines?placement_id=eq.${enc(placementId)}&select=id,status`, []),
    sbTry<Row[]>(`placement_dispatches?placement_id=eq.${enc(placementId)}&select=line_id,status`, []),
    sbTry<Row[]>(`placement_quotes?placement_id=eq.${enc(placementId)}&status=neq.superseded&select=line_id`, []),
  ])
  return lines.map(l => ({
    status: String(l.status),
    dispatchesSent: dispatches.filter(d => d.line_id === l.id && SENT.has(d.status)).length,
    dispatchesDrafted: dispatches.filter(d => d.line_id === l.id && d.status === 'drafted').length,
    quotes: quotes.filter(q => q.line_id === l.id).length,
  }))
}

/** Recomputes and stores one case's stage. Returns the stage, or null for a case that has none. */
export async function syncStage(workItemId: string): Promise<Stage | null> {
  const [w] = await sbTry<Row[]>(`work_items?id=eq.${enc(workItemId)}&select=id,case_type,status,stage,placement_id,policy_id,closed_at`, [])
  if (!w || !STAGED_TYPES.has(w.case_type)) return null
  const [lines, docs, dns] = await Promise.all([
    w.placement_id ? linesOf(w.placement_id) : Promise.resolve([] as LineFacts[]),
    sbTry<Row[]>(`work_item_documents?work_item_id=eq.${enc(w.id)}&select=status`, []),
    w.policy_id ? sbTry<Row[]>(`debit_notes?policy_id=eq.${enc(w.policy_id)}&reverses_debit_note_id=is.null&select=status,gross_amount,paid_amount,paid_direct_amount&order=issue_date.desc&limit=1`, []) : Promise.resolve([] as Row[]),
  ])
  const dn = dns[0]
  const paid = !!dn && (dn.status === 'paid' || (Number(dn.gross_amount ?? 0) > 0 && Number(dn.paid_amount ?? 0) + Number(dn.paid_direct_amount ?? 0) >= Number(dn.gross_amount)))
  const stage = stageFromRecords({
    lines, documentsComplete: docs.every(d => d.status === 'received' || d.status === 'waived'),
    debitNote: !!dn, paid, status: w.status ?? null, stored: isStage(w.stage) ? w.stage : null,
  })
  if (stage !== w.stage) {
    await sbTry(`work_items?id=eq.${enc(w.id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ stage, stage_at: new Date().toISOString() }) })
    await sbTry('work_item_events', null, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: w.id, kind: 'stage', actor: 'stage', detail: { from: w.stage ?? null, to: stage } }) })
  }
  return stage
}

/** After any change to a placement's lines: the linked case catches up. Never throws. */
export async function touchPlacement(placementId: string | null | undefined): Promise<void> {
  if (!placementId) return
  try {
    for (const w of await sbTry<Row[]>(`work_items?placement_id=eq.${enc(placementId)}&closed_at=is.null&select=id`, [])) await syncStage(w.id)
  } catch (e) { console.error('[cases] touchPlacement', e instanceof Error ? e.message : e) }
}

/**
 * The case a new placement belongs to. Order: the case already on its client thread; an open
 * renewal of the same client whose policy line matches; otherwise a new item. The placement is
 * linked either way, and the case's policy set from the first line when it has none.
 */
export async function caseForPlacement(p: {
  placementId: string; companyId: string; clientName: string | null; threadId: string | null; title: string
  productLines: string[]; policyId: string | null; startPoint: StartPoint; inceptionDate: string | null; actor: string
}): Promise<string | null> {
  try {
    let id: string | null = null
    let threadTaken = false
    if (p.threadId) {
      const [l] = await sbTry<Row[]>(`work_item_threads?thread_id=eq.${enc(p.threadId)}&select=work_item_id,work_items(id,closed_at,case_type)`, [])
      // Only a quote case adopts the placement; a claim or billing case on the same thread keeps the thread.
      if (l?.work_items && !l.work_items.closed_at) {
        if (STAGED_TYPES.has(l.work_items.case_type)) id = l.work_item_id
        else threadTaken = true
      }
    }
    if (!id) {
      const renewals = await sbTry<Row[]>(`work_items?company_id=eq.${enc(p.companyId)}&case_type=eq.renewal&closed_at=is.null&placement_id=is.null&select=id,policies(product_line)`, [])
      const hit = renewals.find(r => r.policies?.product_line && p.productLines.includes(r.policies.product_line))
      if (hit) id = hit.id
    }
    if (!id) {
      const [made] = await sbTry<Row[]>('work_items', [], {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          company_id: p.companyId, client_name: p.clientName, case_type: 'new_quote', title: p.title.slice(0, 140),
          status: 'trs_to_act', deadline: p.inceptionDate, deadline_basis: p.inceptionDate ? 'inception date' : null,
          policy_id: p.policyId, source: 'placement', confidence: 'high', start_point: p.startPoint, stage: 'request',
          next_action: 'Check the data, then send the requests to the insurers',
        }),
      })
      id = made?.id ?? null
      if (id && p.threadId && !threadTaken) await sbTry('work_item_threads?on_conflict=work_item_id,thread_id', null, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ work_item_id: id, thread_id: p.threadId, side: 'client', joined_by: 'placement', joined_evidence: 'client thread of the placement' }) })
    }
    if (!id) return null
    await sbTry(`work_items?id=eq.${enc(id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ placement_id: p.placementId }) })
    await sbTry(`work_items?id=eq.${enc(id)}&policy_id=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ policy_id: p.policyId }) })
    await sbTry(`work_items?id=eq.${enc(id)}&start_point=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ start_point: p.startPoint }) })
    await sbTry('work_item_events', null, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: id, kind: 'note', actor: p.actor, detail: { placement_linked: p.placementId, start_point: p.startPoint } }) })
    await syncStage(id)
    return id
  } catch (e) { console.error('[cases] caseForPlacement', e instanceof Error ? e.message : e); return null }
}

/** The sweep's pass: every open quote case recomputed, so a missed hook heals within the hour. */
export async function syncAllStages(): Promise<number> {
  let changed = 0
  for (const w of await sbTry<Row[]>('work_items?closed_at=is.null&case_type=in.(new_quote,renewal)&select=id,stage&limit=2000', [])) {
    const s = await syncStage(w.id)
    if (s && s !== w.stage) changed++
  }
  return changed
}
