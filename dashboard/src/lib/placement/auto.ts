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
import { approvedInsurerNames } from './eb'
import { clientThreadFor, placementForJob, priorInsurerThreads, recordMidway } from './adopt'

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

/**
 * The classify hook's condition: an rfq the classifier is sure of, not yet placed — from a client
 * (opened, or picked up mid-way), or an insurer's reply on a request TRS started by hand (picked up).
 */
export function shouldAutoPlace(f: AutoPlaceFacts): boolean {
  if (f.category !== 'rfq') return false
  if (typeof f.confidence !== 'number' || !Number.isFinite(f.confidence) || f.confidence < AUTO_PLACE_CONFIDENCE) return false
  if (f.companyKind !== 'client' && f.companyKind !== 'insurer') return false
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
 * The contacts a line emails when the agent opens it. Employment benefits is Tier A by default:
 * the rate engine prices the five local schemes and nobody is emailed. Tier B and Tier C insurers
 * are asked only when a broker selects them on the line (openTierC). Other lines keep every pick.
 */
export function ebEmailContacts(productLine: string, picks: { contact_id: string; insurer: string }[], _approvedInsurers: readonly string[] = []): string[] {
  if (productLine === EB_PRODUCT_LINE) return []
  return [...new Set(picks.map(p => p.contact_id))]
}

// ── The write ───────────────────────────────────────────────────────────────────────────────

export type AutoPlaceResult =
  | { status: 'created'; placement_id: string; lines: string[]; dispatched: number }
  | { status: 'adopted'; placement_id: string; lines: string[]; insurers: number; replies_read: number }
  | { status: 'exists'; placement_id: string }
  | { status: 'not_found' | 'no_company' | 'not_client' | 'no_lines' | 'no_request' }

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
  const kind = thread.company_id ? await companyKind(thread.company_id) : null
  // An insurer's thread: hand over to the client request it belongs to, which records it.
  if (kind !== 'client') {
    if (await store.dispatchForThread(threadId, thread.gmail_thread_id)) return { status: 'not_client' }
    const client = await clientThreadFor(threadId)
    if (!client) return { status: thread.company_id ? 'no_request' : 'no_company' }
    const open = await store.placementForClientThread(client.id)
    if (open) return { status: 'exists', placement_id: open.id }
    return autoPlaceFromThread(client.id)
  }

  const proposal = await proposeFromThread(threadId)
  const proposed = (proposal?.lines ?? []).filter(l => l.confidence >= AUTO_LINE_CONFIDENCE)
  if (proposed.length === 0) return { status: 'no_lines' }

  // Already under way: record it from the mailbox rather than ask the insurers again.
  const [full] = await sbTry<{ id: string; subject: string | null; gmail_thread_id: string | null; company_id: string | null; created_at: string }[]>(
    `email_threads?id=eq.${threadId}&select=id,subject,gmail_thread_id,company_id,created_at&limit=1`, [])
  // Another client thread on a job already recorded (the LOA, a confirmation) joins it.
  const sameJob = full ? await placementForJob(thread.company_id!, full.subject ?? '', proposal!.project, full.created_at) : null
  if (sameJob) return { status: 'exists', placement_id: sameJob.id }
  const clientName = (await store.company(thread.company_id!))?.company_name ?? ''
  const prior = full ? await priorInsurerThreads({ thread: full, clientName, project: proposal!.project }) : []
  if (full && (proposal!.stage === 'midway' || prior.length > 0)) {
    if (await store.placementForClientThread(threadId)) return { status: 'exists', placement_id: (await store.placementForClientThread(threadId))!.id }
    const r = await recordMidway({ thread: full, companyId: thread.company_id!, proposal: proposal!, lines: proposed, prior, actor: AGENT_ACTOR })
    return { status: 'adopted', ...r }
  }

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
    company_id: thread.company_id!, title: proposal!.title, client_thread_id: threadId, inception_date: proposal!.inception_date,
    lines, actor: AGENT_ACTOR, dispatch: true,
  })

  const labels = r.lines.map(l => l.label ?? l.product_line)
  const ebLabels = r.lines.filter(l => l.product_line === EB_PRODUCT_LINE).map(l => l.label ?? l.product_line)
  const subject = (thread.subject ?? '').trim() || 'the client email'
  await store.log({
    company_id: r.placement.company_id, placement_id: r.placement.id, kind: 'opened', actor: AGENT_ACTOR, thread_id: threadId,
    text: `Proposed by the agent from ${subject}: ${labels.join(', ')}` + (ebLabels.length > 0 ? ` — ${ebLabels.join(', ')}: priced at the Tier A insurers; Tier B and C only when a broker selects them` : ''),
    // Rows come back in insert order, so line i was asked with lines[i].contact_ids.
    detail: { auto: true, lines: r.lines.map((l, i) => ({ id: l.id, product_line: l.product_line, contact_ids: lines[i]?.contact_ids ?? [] })) },
  })
  return { status: 'created', placement_id: r.placement.id, lines: labels, dispatched: r.dispatched }
}

/**
 * A TRS email just went out on a thread no placement holds. To an insurer: file the thread under
 * that insurer and pick up the client request it belongs to. On a client's request thread: let
 * the agent read the whole thread and open or pick up the request. Anything else: nothing.
 * Database checks first; the model is called only when a request is found.
 */
export async function placeOnSend(threadId: string, recipients: string[]): Promise<AutoPlaceResult | { status: 'skipped'; reason: string }> {
  const t = await store.thread(threadId)
  if (!t) return { status: 'not_found' }
  if (await store.dispatchForThread(threadId, t.gmail_thread_id)) return { status: 'skipped', reason: 'already a request thread' }
  if (await store.placementForClientThread(threadId)) return { status: 'skipped', reason: 'already placed' }
  const domains = [...new Set(recipients.map(r => r.toLowerCase().split('@')[1]).filter((d): d is string => !!d && d !== 'trade-risksol.com'))]
  if (domains.length === 0) return { status: 'skipped', reason: 'internal only' }
  const insurers = await sbTry<{ id: string; domains: string[] | null }[]>('companies?kind=eq.insurer&select=id,domains&limit=2000', [])
  const hit = insurers.filter(i => (i.domains ?? []).some(d => domains.includes(d.toLowerCase())))
  if (hit.length) {
    await sbTry('thread_insurers?on_conflict=thread_id,insurer_company_id', null, {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(hit.map(i => ({ thread_id: threadId, insurer_company_id: i.id, via: 'sender_domain' }))),
    })
    return autoPlaceFromThread(threadId)
  }
  const [row] = await sbTry<{ category: string | null; companies: { kind: string | null } | null }[]>(`email_threads?id=eq.${threadId}&select=category,companies(kind)&limit=1`, [])
  if (row?.companies?.kind === 'client' && (row.category === 'rfq' || row.category === 'renewal')) return autoPlaceFromThread(threadId)
  return { status: 'skipped', reason: 'not a request' }
}
