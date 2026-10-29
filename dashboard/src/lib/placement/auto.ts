/**
 * Agent-first placement from a client email. The classifier calls this when a client thread asks
 * for quotes; the agent opens the placement, its lines, picks one contact per insurer per line
 * and drafts one request per line. The broker sees it labelled "Proposed by the agent", edits the
 * drafts and sends. Nothing here sends.
 *
 * Kept out of workflow.ts so the loop there stays about rounds and replies.
 */
import { sbTry } from '@/lib/crm/db'
import * as store from './store'
import { suggestInsurers } from '@/lib/insurer-products'
import { createPlacement, proposeFromThread, type NewLine } from './workflow'
import { approvedInsurerNames, tierOf } from './eb'

/** Below this the classifier is guessing, and a guess should not open a placement. */
export const AUTO_PLACE_CONFIDENCE = 0.7
/** A proposed line the agent is less sure of than this is dropped rather than asked. */
export const AUTO_LINE_CONFIDENCE = 0.6
/**
 * Employment benefits: the rate engine prices the Tier A and B insurers from the census, so only
 * Tier C insurers (no rate table on file) are asked by email on round 1.
 */
export const EB_PRODUCT_LINE = 'employee_benefits'
export const AGENT_ACTOR = 'agent'

// ── Pure rules ──────────────────────────────────────────────────────────────────────────────

export type AutoPlaceFacts = {
  category: string | null | undefined
  confidence: number | null | undefined
  /** companies.kind of the thread's company; null when the thread has no company. */
  companyKind: string | null | undefined
  /** An open (status ≠ closed) placement already has this thread as its client thread. */
  hasOpenPlacement: boolean
}

/** The classify hook's condition: an rfq the classifier is sure of, from a client, not yet placed. */
export function shouldAutoPlace(f: AutoPlaceFacts): boolean {
  if (f.category !== 'rfq') return false
  if (typeof f.confidence !== 'number' || !Number.isFinite(f.confidence) || f.confidence < AUTO_PLACE_CONFIDENCE) return false
  if (f.companyKind !== 'client') return false
  if (f.hasOpenPlacement) return false
  return true
}

/**
 * One contact per insurer from the routes of ONE product line: the first by name (named before
 * unnamed, then by email), so the pick is stable across runs. Rows for other product lines are
 * ignored. The rule lives here alone so it can improve (e.g. most recent activity) in one place.
 */
export function pickDefaultContacts(routes: store.InsurerRoute[], productLine?: string): string[] {
  const pool = productLine ? routes.filter(r => r.product_line === productLine) : routes
  const byInsurer = new Map<string, store.InsurerRoute>()
  const rank = (r: store.InsurerRoute) => `${r.name ? '0' : '1'}|${(r.name ?? '').toLowerCase()}|${r.email.toLowerCase()}`
  for (const r of pool) {
    const key = r.insurer_name.trim().toLowerCase()
    const cur = byInsurer.get(key)
    if (!cur || rank(r) < rank(cur)) byInsurer.set(key, r)
  }
  return [...byInsurer.values()].sort((a, b) => a.insurer_name.localeCompare(b.insurer_name)).map(r => r.contact_id)
}

/**
 * The contacts a line emails. For employment benefits the rate engine prices every insurer with a
 * rate table, so those are left out and only Tier C insurers are asked; other lines keep them all.
 */
export function ebEmailContacts(productLine: string, picks: { contact_id: string; insurer: string }[], approvedInsurers: readonly string[]): string[] {
  const keep = productLine === EB_PRODUCT_LINE ? picks.filter(p => tierOf(p.insurer, approvedInsurers) === 'C') : picks
  return [...new Set(keep.map(p => p.contact_id))]
}

// ── The write ───────────────────────────────────────────────────────────────────────────────

export type AutoPlaceResult =
  | { status: 'created'; placement_id: string; lines: string[]; dispatched: number }
  | { status: 'exists'; placement_id: string }
  | { status: 'not_found' | 'no_company' | 'not_client' | 'no_lines' }

async function companyKind(companyId: string): Promise<string | null> {
  const rows = await sbTry<{ kind: string | null }[]>(`companies?id=eq.${companyId}&select=kind&limit=1`, [])
  return rows[0]?.kind ?? null
}

/**
 * Opens the placement the client's thread asks for. Idempotent per thread: a second call while an
 * open placement has this client_thread_id returns `exists` and writes nothing.
 */
export async function autoPlaceFromThread(threadId: string): Promise<AutoPlaceResult> {
  const thread = await store.thread(threadId)
  if (!thread) return { status: 'not_found' }
  const existing = await store.placementForClientThread(threadId)
  if (existing) return { status: 'exists', placement_id: existing.id }
  if (!thread.company_id) return { status: 'no_company' }
  if ((await companyKind(thread.company_id)) !== 'client') return { status: 'not_client' }

  const proposal = await proposeFromThread(threadId)
  const proposed = (proposal?.lines ?? []).filter(l => l.confidence >= AUTO_LINE_CONFIDENCE)
  if (proposed.length === 0) return { status: 'no_lines' }

  const askedLines = [...new Set(proposed.map(l => l.product_line))]
  // The Insurers page ranks and ticks up to five per line; a line with no products there falls
  // back to one contact per insurer from the old list.
  const [suggested, routes] = askedLines.length > 0
    ? await Promise.all([suggestInsurers(askedLines, thread.company_id), store.insurerRoutes(askedLines)])
    : [{} as Awaited<ReturnType<typeof suggestInsurers>>, [] as store.InsurerRoute[]]
  const approved = proposed.some(l => l.product_line === EB_PRODUCT_LINE) ? await approvedInsurerNames() : []
  const lines: NewLine[] = proposed.map(l => ({
    product_line: l.product_line, label: l.label, spec: l.spec,
    contact_ids: ebEmailContacts(l.product_line, suggested[l.product_line]
      ? suggested[l.product_line].filter(s => s.picked && s.contact).map(s => ({ contact_id: s.contact!.contact_id, insurer: s.product.insurer_name }))
      : routes.filter(r => pickDefaultContacts(routes, l.product_line).includes(r.contact_id)).map(r => ({ contact_id: r.contact_id, insurer: r.insurer_name })), approved),
  }))

  // The agent's read takes a while; another call may have placed this thread meanwhile.
  const raced = await store.placementForClientThread(threadId)
  if (raced) return { status: 'exists', placement_id: raced.id }

  const r = await createPlacement({
    company_id: thread.company_id, title: proposal!.title, client_thread_id: threadId, inception_date: proposal!.inception_date,
    lines, actor: AGENT_ACTOR, dispatch: true,
  })

  const labels = r.lines.map(l => l.label ?? l.product_line)
  const ebLabels = r.lines.filter(l => l.product_line === EB_PRODUCT_LINE).map(l => l.label ?? l.product_line)
  const subject = (thread.subject ?? '').trim() || 'the client email'
  await store.log({
    company_id: r.placement.company_id, placement_id: r.placement.id, kind: 'opened', actor: AGENT_ACTOR, thread_id: threadId,
    text: `Proposed by the agent from ${subject}: ${labels.join(', ')}` + (ebLabels.length > 0 ? ` — ${ebLabels.join(', ')}: rate engine prices Tier A and B, Tier C insurers asked by email` : ''),
    // Rows come back in insert order, so line i was asked with lines[i].contact_ids.
    detail: { auto: true, lines: r.lines.map((l, i) => ({ id: l.id, product_line: l.product_line, contact_ids: lines[i]?.contact_ids ?? [] })) },
  })
  return { status: 'created', placement_id: r.placement.id, lines: labels, dispatched: r.dispatched }
}
