/**
 * GET   /api/placements/lines/[id] → the Policy page's context: the line, its client and thread, the
 *       request checklist, the insurer contacts on file with the default panel ticked, the thread's
 *       files, every quote across rounds and the line's log.
 * PATCH /api/placements/lines/[id]
 *   { client_stage?, insurer_stage?, request_type?, existing?, renewal_date?, previous_premium?, status?: 'dropped' }
 *   → { line }
 * What a person sets on a policy being worked on. status 'dropped' takes it off Policies › Working on
 * (the email thread and the log stay). Every change is written to the company log.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as store from '@/lib/placement/store'
import type { Placement, PlacementLine } from '@/lib/placement/types'
import { linePatchFrom, shownStages, shortInsurer } from '@/lib/placement/working'
import { requestItems, requestSubject } from '@/lib/placement/request'
import { derivePositions } from '@/lib/placement/position'
import { lineStage } from '@/lib/placement/grid'
import { insurerDeadline, missingAsks, pickPanel } from '@/lib/placement/lines'
import { productLineLabel } from '@/lib/product-lines'
import type { PlacementLogEntry, PlacementQuote } from '@/lib/placement/types'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import { sbTry } from '@/lib/crm/db'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Not a line id')
  const b = await readBody<Record<string, unknown>>(req)
  if (!b) return fail('Body must be a JSON object')
  const r = linePatchFrom(b)
  if ('error' in r) return fail(r.error)
  try {
    const [line] = await sbTry<PlacementLine[]>(`placement_lines?id=eq.${id}&select=*`, [])
    if (!line) return fail('Line not found', 404)
    const [placement] = await sbTry<Placement[]>(`placements?id=eq.${line.placement_id}&select=id,company_id`, [])
    const [updated] = await store.patch<PlacementLine>('placement_lines', `id=eq.${id}`, r.patch)
    const words = r.patch.status === 'dropped'
      ? `${line.label ?? line.product_line} taken off Policies › Working on`
      : `${line.label ?? line.product_line}: ${Object.entries(r.patch).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v === null ? 'cleared' : String(v)}`).join(', ')}`
    if (placement) await store.log({ company_id: placement.company_id, placement_id: placement.id, line_id: id, kind: 'note', actor, text: words, detail: { patch: r.patch } })
    return NextResponse.json({ line: updated ?? null })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Not a line id')
  try {
    const [line] = await sbTry<PlacementLine[]>(`placement_lines?id=eq.${id}&select=*`, [])
    if (!line) return fail('Line not found', 404)
    const bundle = await store.loadPlacement(line.placement_id)
    if (!bundle) return fail('Placement not found', 404)
    const placement = bundle.placements[0]
    const [company, thread, routes, quotes, log] = await Promise.all([
      store.company(placement.company_id),
      placement.client_thread_id ? store.thread(placement.client_thread_id) : Promise.resolve(null),
      store.insurerRoutes([line.product_line]),
      sbTry<PlacementQuote[]>(`placement_quotes?line_id=eq.${id}&order=created_at.asc`, []),
      sbTry<PlacementLogEntry[]>(`placement_log?placement_id=eq.${placement.id}&or=(line_id.eq.${id},line_id.is.null)&order=created_at.desc&limit=200`, []),
    ])
    const files = placement.client_thread_id
      ? await sbTry<{ filename: string; mime_type: string | null; storage_url: string | null }[]>(`email_attachments?thread_id=eq.${placement.client_thread_id}&storage_url=not.is.null&select=filename,mime_type,storage_url&order=created_at.desc&limit=40`, [])
      : []
    const pos = derivePositions(bundle).find(p => p.line.id === id) ?? null
    const stage = pos ? lineStage(pos, placement).stage : 'not_asked'
    const label = line.label ?? productLineLabel(line.product_line)
    const clientName = company?.company_name ?? 'the client'
    // The default panel: the insurers in the order the broker approaches them, one default contact each.
    const panel = new Set(pickPanel(line.product_line, line.spec ?? {}, routes.map(r => r.insurer_name)))
    const firstOf = new Map<string, string>()
    for (const r of routes) if (panel.has(r.insurer_name) && (!firstOf.has(r.insurer_name) || r.is_default)) firstOf.set(r.insurer_name, r.contact_id)
    const rounds = bundle.rounds.filter(r => r.line_id === id).sort((a, b) => a.round_no - b.round_no)
    const roundNo = new Map(rounds.map(r => [r.id, r.round_no]))
    const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
    return NextResponse.json({
      line, label, stages: shownStages(line, stage), stage,
      placement: { id: placement.id, ref: placement.ref, company_id: placement.company_id, inception_date: placement.inception_date, status: placement.status, client_thread_id: placement.client_thread_id },
      company: { id: placement.company_id, name: clientName },
      thread: thread ? { id: thread.id, subject: thread.subject } : null,
      items: requestItems(line.product_line, line.spec ?? {}, clientName),
      missing_asks: missingAsks(line.product_line, line.spec ?? {}, placement.inception_date),
      subject: requestSubject(clientName, label, line.request_type ?? null, placement.inception_date),
      deadline: insurerDeadline(line.product_line, today, placement.inception_date),
      routes: routes.map(r => ({ contact_id: r.contact_id, insurer: shortInsurer(r.insurer_name), name: r.name, email: r.email, picked: firstOf.get(r.insurer_name) === r.contact_id })),
      files: files.map(f => ({ filename: f.filename, mime_type: f.mime_type ?? undefined, storage_url: f.storage_url! })),
      rounds: rounds.map(r => ({ id: r.id, round_no: r.round_no, change_summary: r.change_summary, opened_at: r.opened_at })),
      dispatches: (pos?.dispatches ?? []).map(d => ({ id: d.dispatch.id, insurer: shortInsurer(d.dispatch.insurer_name), status: d.dispatch.status, round_no: roundNo.get(d.dispatch.round_id) ?? null, sent_at: d.dispatch.sent_at, chase_due: d.chaseDue, thread_href: d.threadHref, draft_id: d.dispatch.ai_draft_id })),
      quotes: quotes.map(q => ({ id: q.id, dispatch_id: q.dispatch_id, insurer: shortInsurer(q.insurer_name), round_no: roundNo.get(q.round_id) ?? null, status: q.status, premium_text: q.premium_text, premium_amount: q.premium_amount, excess_text: q.excess_text, limit_text: q.limit_text, valid_until: q.valid_until, tier_label: q.tier_label ?? null, created_at: q.created_at, source: q.source ?? 'insurer', extracted_by: q.extracted_by })),
      log: log.map(l => ({ id: l.id, kind: l.kind, actor: l.actor, text: l.text, round_id: l.round_id, round_no: l.round_id ? roundNo.get(l.round_id) ?? null : null, created_at: l.created_at, thread_id: l.thread_id ?? null })),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
