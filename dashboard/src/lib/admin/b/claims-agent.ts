/**
 * The claims agent: one job, keep each claim's register row true to its mail. Every class.
 *
 * Kinds it takes:
 *   case_mail     Intake joined new mail to an open claim; handled as case_update.
 *   case_update   a claim's threads moved (new mail, a forward rejoined). Re-read, update the row.
 *   open_midway   Intake found a claim TRS has no case for: a forward, or operations@ copied in
 *                 partway. Open the work item and the claim, mark how it opened, list the gaps,
 *                 and hand a request for the missing items to the drafter.
 *   sync          the daily sweep: every open claim work item gets a register row.
 *
 * Facts come only from the mail and the files (claim-read.ts). A value staff or an earlier read
 * set is kept unless the mail now gives a different one, and the change is logged on the item.
 */
import { clearReferenceCache } from '@/lib/admin/a/references'
import { isClaimLike } from '@/lib/admin/a/signals'
import { createHash } from 'node:crypto'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { enqueue, skip, type AgentTask } from '@/lib/agent-tasks/queue'
import {
  claimClass, findInsurerRef, findPolicyNumber, findClaimedAmount, findSettledAmount, findLossDate, findClaimant,
  inferStage, waitingOn, documentState, claimGaps, type ClaimStage,
} from './claim-read'
import { loadCaseData, toMailLines, itemEvent } from './data'
import { settledFromAttachments } from '@/lib/documents/money-store'
import { needsForwardToInsurer } from './drafts'
import { caseModeFor } from './kinds'

type Row = Record<string, any>
const ACTOR = 'claims'

const stripPrefix = (s: string | null | undefined) => String(s ?? '').replace(/^\s*((re|fw|fwd|aw)\s*:\s*)+/i, '').trim()
const hash = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12)

export type ClaimRow = {
  work_item_id: string; company_id: string | null; policy_id: string | null; insurer_name: string | null; class: string
  policy_number: string | null; insurer_ref: string | null; claimant: string | null; loss_date: string | null
  amount_claimed: number | null; amount_settled: number | null; stage: ClaimStage; waiting_on: string | null
  gaps: { item: string; basis: string }[]; documents: { name: string; received_at: string | null; source: string }[]
  last_mail_at: string | null; closed_at: string | null; updated_at: string
}

/** Reads one claim work item and writes its register row. Returns the row written. */
export async function refreshClaim(workItemId: string, extra: { gaps?: { item: string; basis: string }[]; opened_mode?: string } = {}): Promise<(ClaimRow & { needs_forward: boolean }) | null> {
  const d = await loadCaseData(workItemId)
  if (!d) return null
  const [prev] = await sbTry<Row[]>(`claims?work_item_id=eq.${enc(workItemId)}&select=*&limit=1`, [])
  const text = [d.item.title, ...d.threads.map(t => t.subject ?? ''), ...d.messages.map(m => m.text)].join('\n\n')
  const policyNos = d.policies.map(p => p.policy_number).filter(Boolean) as string[]
  const pol = findPolicyNumber(`${d.item.title}\n${d.threads.map(t => t.subject).join('\n')}\n${text}`, d.item.policy_number ? [d.item.policy_number, ...policyNos] : policyNos)
  const policy = d.policies.find(p => p.policy_number && p.policy_number === (pol?.value ?? d.item.policy_number)) ?? null
  const cls = prev?.class && prev.class !== 'other' ? prev.class : claimClass(policy?.class_of_insurance ?? policy?.product_line, `${d.item.title}\n${text.slice(0, 4000)}`)
  const lines = toMailLines(d)
  const { stage } = inferStage(lines, (prev?.stage ?? 'notified') as ClaimStage)
  const docs = documentState(cls, d.files.map(f => f.filename))
  const gapsBase = claimGaps(docs, d.namedButMissing, cls)
  const gaps = [...gapsBase, ...(extra.gaps ?? []).filter(g => !gapsBase.some(b => b.item === g.item))]
  const live = d.messages.filter(m => !m.rebuilt)
  const closed = ['settled', 'declined', 'withdrawn'].includes(stage)

  const pick = <T,>(found: { value: T } | null, old: T | null | undefined): T | null => found?.value ?? old ?? null
  const row: ClaimRow = {
    work_item_id: workItemId,
    company_id: d.item.company_id ?? null,
    policy_id: policy?.id ?? prev?.policy_id ?? d.item.policy_id ?? null,
    insurer_name: d.item.insurer_name ?? policy?.insurer ?? prev?.insurer_name ?? null,
    class: cls,
    policy_number: pol?.value ?? prev?.policy_number ?? d.item.policy_number ?? null,
    insurer_ref: pick(findInsurerRef(text, policyNos), prev?.insurer_ref),
    claimant: pick(findClaimant(text), prev?.claimant),
    loss_date: pick(findLossDate(text), prev?.loss_date),
    amount_claimed: pick(findClaimedAmount(text), prev?.amount_claimed),
    // The mail's words first; else the insurer's settlement letter among the attachments.
    amount_settled: pick(findSettledAmount(text), prev?.amount_settled) ?? (await settledFromAttachments(d.messages.map(m => m.id)))?.value ?? null,
    stage,
    waiting_on: waitingOn(lines, stage),
    gaps: closed ? [] : gaps,
    documents: d.files.map(f => ({ name: f.filename, received_at: f.received_at, source: 'email' })),
    last_mail_at: live.length ? live[live.length - 1].sent_at : prev?.last_mail_at ?? null,
    closed_at: closed ? (prev?.closed_at ?? new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  }
  await sb('claims?on_conflict=work_item_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ ...row, ...(extra.opened_mode && !prev ? { opened_mode: extra.opened_mode } : {}) }),
  })
  const changed = prev ? (['stage', 'insurer_ref', 'amount_claimed', 'amount_settled', 'loss_date'] as const).filter(k => String(prev[k] ?? '') !== String(row[k] ?? '')) : ['opened']
  if (changed.length) await itemEvent(workItemId, 'note', ACTOR, { claim: changed, stage: row.stage })
  // The stage moves and the client hears what comes next: the adjuster's access, then the
  // settlement documents. One draft per stage per claim.
  if (!closed && row.stage === 'adjuster' && prev?.stage !== 'adjuster') {
    await enqueue({ agent: 'drafter', kind: 'adjuster_access', work_item_id: workItemId, company_id: row.company_id, idem_key: `drafter:adjuster_access:${workItemId}`, created_by_agent: 'claims' })
  }
  if (!closed && row.stage === 'offer' && prev?.stage !== 'offer') {
    await enqueue({ agent: 'drafter', kind: 'settlement_pack', work_item_id: workItemId, company_id: row.company_id, idem_key: `drafter:settlement_pack:${workItemId}`, created_by_agent: 'claims' })
  }
  // Forward only what the client's own words show is a claim: a quote request filed as a claim is not sent on.
  const clientWords = lines.filter(l => l.side === 'client').map(l => l.text).join('\n')
  return { ...row, needs_forward: !closed && isClaimLike(d.item.title, clientWords) && needsForwardToInsurer(lines, stage) }
}

/** A client's new claim that has not reached the insurer yet: the drafter forwards it, with a note to the client. */
async function forwardIfDue(id: string, row: (ClaimRow & { needs_forward: boolean }) | null) {
  if (!row?.needs_forward || row.closed_at) return false
  await enqueue({ agent: 'drafter', kind: 'forward_to_insurer', work_item_id: id, company_id: row.company_id, idem_key: `drafter:forward_to_insurer:${id}`, created_by_agent: 'claims' })
  return true
}

/** Opens a claim TRS had no case for, from a forward or a thread operations@ joined midway. */
export async function openClaim(p: { thread_id: string; company_id?: string | null; title?: string | null; mode: 'midway' | 'from_forward' | 'normal'; joined_by?: string | null; gaps?: { item: string; basis: string }[] }): Promise<string> {
  const [linked] = await sbTry<Row[]>(`work_item_threads?thread_id=eq.${enc(p.thread_id)}&select=work_item_id,work_items(closed_at,case_type)&limit=1`, [])
  if (linked && !linked.work_items?.closed_at) return linked.work_item_id as string
  const [t] = await sb<Row[]>(`email_threads?id=eq.${enc(p.thread_id)}&select=id,subject,company_id,last_message_at&limit=1`)
  if (!t) throw new Error('thread not found')
  const [co] = t.company_id ? await sbTry<Row[]>(`companies?id=eq.${enc(t.company_id)}&select=id,kind,company_name&limit=1`, []) : []
  const isInsurer = co?.kind === 'insurer'
  // An insurer, partner broker, TPA or vendor thread does not make that company the claimant's client.
  const notClient = !!co && caseModeFor(co.kind) !== 'client'
  const companyId = p.company_id ?? (notClient ? null : t.company_id ?? null)
  const [item] = await sb<Row[]>('work_items', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      company_id: companyId, client_name: notClient ? null : co?.company_name ?? null, case_type: 'claim',
      needs_human: !companyId ? `Which client is this claim for? It came in on a thread filed under ${co?.company_name ?? 'no company'}.` : null,
      title: (p.title ?? stripPrefix(t.subject) ?? 'Claim').slice(0, 140) || 'Claim', status: 'trs_to_act',
      last_activity_at: t.last_message_at, source: ACTOR, confidence: 'low',
      summary: p.mode === 'midway' ? 'Opened midway.' : p.mode === 'from_forward' ? 'Opened from a forward.' : null,
      next_action: 'Check the claim details and the missing items',
      insurer_name: isInsurer ? co?.company_name ?? null : null,
    }),
  })
  const link = { work_item_id: item.id, thread_id: p.thread_id, side: isInsurer ? 'insurer' : 'client', joined_by: p.joined_by ?? (p.mode === 'normal' ? 'thread' : p.mode === 'midway' ? 'midway' : 'forward') }
  const ok = await sbTry('work_item_threads', null, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(link) })
  if (ok === null) await sb('work_item_threads', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: link.work_item_id, thread_id: link.thread_id, side: link.side }) })
  await itemEvent(item.id, 'note', ACTOR, { opened: p.mode, thread_id: p.thread_id })
  return item.id as string
}

export async function handleClaims(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  const p = task.payload ?? {}
  switch (task.kind) {
    case 'open_midway': {
      const thread = (p.thread_id ?? task.thread_id) as string | undefined
      if (!thread) { await skip(task.id, 'no thread'); return 'handled' }
      const mode = p.opened_mode === 'from_forward' || p.mode === 'from_forward' || (Array.isArray(p.rebuilt_message_ids) && p.joined_by === 'forward') ? 'from_forward' : 'midway'
      const gaps = Array.isArray(p.gaps) ? p.gaps.map((g: any) => typeof g === 'string' ? { item: g, basis: 'named by Intake' } : { item: String(g.item ?? ''), basis: String(g.basis ?? 'named by Intake') }).filter((g: { item: string }) => g.item) : []
      const id = task.work_item_id ?? await openClaim({ thread_id: thread, company_id: task.company_id, title: p.title ?? null, mode, joined_by: p.joined_by ?? null, gaps })
      // Intake caches claim references; a new claim must be matchable on the next message.
      clearReferenceCache()
      const row = await refreshClaim(id, { gaps, opened_mode: mode })
      // Sending the claim on comes first; the request for missing items follows once it has gone.
      if (await forwardIfDue(id, row)) return { work_item_id: id, stage: row?.stage, gaps: row?.gaps.length ?? 0, forward: true }
      if (row && row.gaps.length && !row.closed_at) await enqueue({
        agent: 'drafter', kind: 'request_missing', work_item_id: id, company_id: row.company_id, thread_id: thread,
        idem_key: `drafter:request_missing:${id}:${hash(row.gaps.map(g => g.item))}`, created_by_agent: 'claims',
      })
      return { work_item_id: id, stage: row?.stage, gaps: row?.gaps.length ?? 0 }
    }
    case 'case_mail':   // Intake: new mail joined to an open claim (ClaimMailPayload)
    case 'case_update': {
      let id = (task.work_item_id ?? p.work_item_id ?? null) as string | null
      const thread = (p.thread_id ?? task.thread_id) as string | undefined
      if (!id && thread) {
        const [l] = await sbTry<Row[]>(`work_item_threads?thread_id=eq.${enc(thread)}&select=work_item_id,work_items(case_type)&limit=1`, [])
        if (l?.work_items?.case_type === 'claim') id = l.work_item_id
      }
      if (!id) { await skip(task.id, 'thread is not on a claim'); return 'handled' }
      const row = await refreshClaim(id)
      const forward = await forwardIfDue(id, row)
      return { work_item_id: id, stage: row?.stage, forward }
    }
    case 'sync': {
      const items = await sbTry<Row[]>('work_items?case_type=eq.claim&closed_at=is.null&select=id&limit=500', [])
      const day = new Date().toISOString().slice(0, 10)
      await enqueue(items.map(i => ({ agent: 'claims' as const, kind: 'case_update', work_item_id: i.id, idem_key: `claims:case_update:${i.id}:${day}`, created_by_agent: 'claims' as const })))
      return { queued: items.length }
    }
    default:
      await skip(task.id, `unknown kind ${task.kind}`); return 'handled'
  }
}
