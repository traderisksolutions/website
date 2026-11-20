/**
 * Reads and writes of eb_quotation_insurers (20261121_w_eb_quotation_insurers.sql), and the
 * placement module's Employment Benefits quotes for the same client. Server only. No model.
 */
import { db, one, rows } from '@/lib/db/client'
import type { Database } from '@/lib/db/database.gen'
import { loadQuotation } from './eb-proposal-store'
import { trackedInsurers, trackPatch, type TrackChange, type TrackedInsurer, type TrackRow } from './insurer-track'

export type PlacementQuote = { id: string; insurer: string; plan: string | null; premium: string | null; amount: number | null; status: string; valid_until: string | null; received: string }

const EB_LINES = ['employee_benefits', 'group_health', 'group_personal_accident', 'group_travel', 'foreign_worker_medical']

export async function placementQuotesFor(companyId: string | null): Promise<PlacementQuote[]> {
  if (!companyId) return []
  const placements = await rows('Placements', db().from('placements').select('id').eq('company_id', companyId).limit(200))
  if (!placements.length) return []
  const lines = await rows('Placement lines', db().from('placement_lines').select('id').in('placement_id', placements.map(p => p.id)).in('product_line', EB_LINES).limit(500))
  if (!lines.length) return []
  const q = await rows('Placement quotes', db().from('placement_quotes')
    .select('id,insurer_name,plan_label,premium_text,premium_amount,status,valid_until,created_at')
    .in('line_id', lines.map(l => l.id)).order('created_at', { ascending: false }).limit(50))
  return q.map(x => ({ id: x.id, insurer: x.insurer_name, plan: x.plan_label, premium: x.premium_text, amount: x.premium_amount == null ? null : Number(x.premium_amount), status: x.status, valid_until: x.valid_until, received: x.created_at }))
}

export async function insurersOf(quotationId: string): Promise<{ insurers: TrackedInsurer[]; placementQuotes: PlacementQuote[] } | null> {
  const q = await loadQuotation(quotationId)
  if (!q) return null
  const kept = await rows('Quotation insurers', db().from('eb_quotation_insurers').select('*').eq('quotation_id', quotationId)) as TrackRow[]
  return { insurers: trackedInsurers(q.snapshot, kept), placementQuotes: await placementQuotesFor(q.company_id) }
}

export class TrackError extends Error { constructor(message: string, readonly status = 400) { super(message) } }

export async function changeInsurer(quotationId: string, insurer: string, change: TrackChange, by: string): Promise<TrackedInsurer> {
  const q = await loadQuotation(quotationId)
  if (!q) throw new TrackError('Quotation not found', 404)
  const now = new Date().toISOString()
  const current = trackedInsurers(q.snapshot, []).find(i => i.insurer === insurer)
  if (!current) throw new TrackError('That insurer is not on this quotation.', 404)
  const p = trackPatch(change, current.computed, now)
  if ('error' in p) throw new TrackError(p.error)
  const row = { quotation_id: quotationId, insurer, route: current.computed, ...p.patch, updated_by: by, updated_at: now } as Database['public']['Tables']['eb_quotation_insurers']['Insert']
  // A route not changed here keeps what was kept: only send route columns when asked.
  if (change.route === undefined) { delete (row as Record<string, unknown>).route }
  await one('Quotation insurer', db().from('eb_quotation_insurers').upsert(row, { onConflict: 'quotation_id,insurer' }).select('id').single())
  const kept = await rows('Quotation insurers', db().from('eb_quotation_insurers').select('*').eq('quotation_id', quotationId)) as TrackRow[]
  return trackedInsurers(q.snapshot, kept).find(i => i.insurer === insurer)!
}
