/**
 * Every open request line with where it stands with the client and the insurers, for Policies ›
 * Working on. Moved unchanged from GET /api/placements/working.
 */
import { sbTry } from '@/lib/crm/db'
import { productLineLabel } from '@/lib/product-lines'
import { loadOpenBundle } from '@/lib/placement/store'
import { derivePositions } from '@/lib/placement/position'
import { lineStage } from '@/lib/placement/grid'
import { shortInsurer, shownStages } from '@/lib/placement/working'

export async function workingRows() {
  const { bundle, companyNames } = await loadOpenBundle()
  const byId = new Map(bundle.placements.map(p => [p.id, p]))
  const threadIds = [...new Set(bundle.placements.map(p => p.client_thread_id).filter((x): x is string => !!x))]
  const threads = threadIds.length ? await sbTry<{ id: string; subject: string | null; display_subject: string | null }[]>(`email_threads?id=in.(${threadIds.join(',')})&select=id,subject,display_subject`, []) : []
  const subject = new Map(threads.map(t => [t.id, t.display_subject || t.subject]))
  const rows = derivePositions(bundle).flatMap(pos => {
    const p = byId.get(pos.line.placement_id)
    if (!p || ['done', 'dropped', 'lost', 'closed'].includes(pos.line.status)) return []
    const { stage } = lineStage(pos, p)
    const s = shownStages(pos.line, stage)
    const live = pos.dispatches.filter(d => d.dispatch.status !== 'withdrawn')
    return [{
      line_id: pos.line.id, placement_id: p.id, policy_id: pos.line.policy_id ?? null,
      company_id: p.company_id, company_name: companyNames.get(p.company_id) ?? 'Unknown company',
      label: pos.line.label ?? productLineLabel(pos.line.product_line), product_line: pos.line.product_line,
      request_type: pos.line.request_type ?? null, existing: pos.line.existing ?? null,
      renewal_date: pos.line.renewal_date ?? null, previous_premium: pos.line.previous_premium ?? null,
      client_stage: s.client, insurer_stage: s.insurer, client_set: s.clientSet, insurer_set: s.insurerSet,
      quoted: live.filter(d => d.quotes.length > 0).map(d => shortInsurer(d.dispatch.insurer_name)),
      waiting: live.filter(d => d.quotes.length === 0 && !['declined', 'drafted'].includes(d.dispatch.status)).map(d => shortInsurer(d.dispatch.insurer_name)),
      declined: live.filter(d => d.dispatch.status === 'declined').map(d => shortInsurer(d.dispatch.insurer_name)),
      thread_id: p.client_thread_id, thread_subject: p.client_thread_id ? subject.get(p.client_thread_id) ?? null : null,
      received: p.created_at,
    }]
  })
  return ({ rows })
}
