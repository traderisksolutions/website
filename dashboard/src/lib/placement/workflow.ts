/**
 * The placement loop, step by step. Each function does one thing the broker or the ingest asks
 * for, writes its rows, and leaves a line in the company memory. Drafts land in ai_drafts as
 * `pending`; a person approves and sends them from the review screen. Nothing here sends.
 */
import { productLineLabel } from '@/lib/product-lines'
import { createQuotingPolicy } from '@/lib/policies/spine'
import { handlePolicyInbound } from '@/lib/policies/inbound'
import { describeChanges, normaliseSpec, parseMoney, specDiff } from './spec'
import { derivePositions, nextChaseAt } from './position'
import * as store from './store'
import { isBrokerBlock } from '@/lib/letters/appointment'
import * as agent from './agent'
import { cloneRows, pairClones, type FanoutClone, type FanoutText } from './fanout'
import { comparisonBody, emailLines, optionLabel, resolvePick } from './compare'
import { choosePolicyQuote } from '@/lib/policies/spine'
import { findTier, isInternal, lineFinished, matchDispatches, parseRefs, placementFinished, readForward, withRef } from './match'
import type { Placement, PlacementBundle, PlacementDispatch, PlacementLine, PlacementQuote, PlacementRound, PlacementShare, PlacementTier, RoundReason, Spec } from './types'

const now = () => new Date().toISOString()
const DRAFT_TYPE = { dispatch: 'PLACEMENT_REQUEST', chase: 'PLACEMENT_CHASE', client: 'PLACEMENT_CLIENT', tier: 'PLACEMENT_TIER', confirm: 'PLACEMENT_CONFIRM' } as const
const tierAsks = (tiers: PlacementTier[]): agent.TierAsk[] => tiers.map(t => ({ label: t.label, spec: t.spec ?? {}, target_premium: t.target_premium }))
const liveTiers = (b: PlacementBundle | null, lineId: string): PlacementTier[] => (b?.tiers ?? []).filter(t => t.line_id === lineId && t.status !== 'dropped')
const MAX_CHASES = 3

// ── Create ──────────────────────────────────────────────────────────────────────────────────

export type NewLine = {
  product_line: string; label?: string | null; spec?: Spec
  /** The insurer contacts to ask on round 1. Absent = everyone on file; [] = nobody yet. */
  contact_ids?: string[] | null
}

export async function createPlacement(input: {
  company_id: string; title?: string | null; client_thread_id?: string | null; inception_date?: string | null
  lines: NewLine[]; actor: string; dispatch?: boolean
}): Promise<{ placement: Placement; lines: PlacementLine[]; dispatched: number }> {
  const company = await store.company(input.company_id)
  if (!company) throw new Error('Company not found')
  const thread = input.client_thread_id ? await store.thread(input.client_thread_id) : null
  const [placement] = await store.insert<Placement>('placements', {
    company_id: input.company_id, title: (input.title ?? '').trim() || `Quotes for ${company.company_name}`,
    client_thread_id: thread?.id ?? null, client_contact_id: thread?.contact_id ?? null,
    inception_date: input.inception_date ?? null, created_by: input.actor,
  })
  const inserted = await store.insert<PlacementLine>('placement_lines', input.lines.map((l, i) => ({
    placement_id: placement.id, product_line: l.product_line, label: (l.label ?? '').trim() || productLineLabel(l.product_line),
    spec: normaliseSpec(l.spec), sort: i,
  })))
  // The broker's pick of contacts per line, keyed by the new line id (rows come back in insert order).
  const contactIdsByLine = new Map<string, string[]>()
  inserted.forEach((l, i) => { const ids = input.lines[i]?.contact_ids; if (Array.isArray(ids)) contactIdsByLine.set(l.id, ids) })
  // Every line quotes one policy on the company spine; the line carries its id from the start.
  const lines: PlacementLine[] = []
  for (const l of inserted) {
    const { id: policyId } = await createQuotingPolicy({ company_id: placement.company_id, product_line: l.product_line, label: l.label ?? productLineLabel(l.product_line), placement_line_id: l.id })
    await store.patch('placement_lines', `id=eq.${l.id}`, { policy_id: policyId })
    lines.push({ ...l, policy_id: policyId })
  }
  await store.log({ company_id: placement.company_id, placement_id: placement.id, kind: 'opened', actor: input.actor,
    text: `Placement opened: ${placement.title} — ${lines.map(l => l.label).join(', ')}`, thread_id: thread?.id ?? null,
    detail: { policy_ids: lines.map(l => l.policy_id) } })
  await store.markQuoting(placement.company_id)
  let dispatched = 0
  if (input.dispatch !== false) {
    const r = await openRounds(placement, lines.map(l => ({ line: l, spec: l.spec, reason: 'initial' as RoundReason, change_summary: null, contact_ids: contactIdsByLine.get(l.id) ?? null })), input.actor)
    dispatched = r.dispatches.length
  }
  return { placement, lines, dispatched }
}

/** The client's thread read into lines by the agent. Nothing is written. */
export async function proposeFromThread(threadId: string): Promise<agent.IntakeResult | null> {
  const t = await store.thread(threadId)
  if (!t) return null
  const msgs = await store.threadMessages(threadId, 60)
  const atts = (await Promise.all(msgs.filter(m => m.has_attachments).map(m => store.attachmentsFor(m.id, true, 20_000)))).flat()
  const c = t.company_id ? await store.company(t.company_id) : null
  return agent.readRequest(msgs, atts, c?.company_name ?? null)
}

// ── Rounds ──────────────────────────────────────────────────────────────────────────────────

export type RoundAsk = {
  line: PlacementLine; spec: Spec; reason: RoundReason; change_summary: string | null; source_message_id?: string | null
  /** The contacts chosen for this line alone. Absent/null = no per-line pick; [] = nobody chosen. */
  contact_ids?: string[] | null
}

/**
 * Opens a round on each line given and asks the insurer contacts on file for that product line:
 * every one of them unless the broker picked (opts.contactIds across all lines, ask.contact_ids per line).
 * One draft per line per round, shared by every dispatch of that line: the text names no insurer,
 * and the review screen fans it out into one draft per recipient at send time (fanoutDraft).
 */
export async function openRounds(placement: Placement, asks: RoundAsk[], actor: string, opts: {
  /** Keep only these insurer routes (employment benefits: the Tier C insurers with no rate table). */
  filterRoute?: (r: store.InsurerRoute) => boolean
  /** Keep only the routes whose contact is in this set — the broker's pick. [] = nobody. */
  contactIds?: string[]
  /** Plain text appended under the draft body, e.g. the census for the insurer to price. */
  extraBody?: string
  /** Use the line's current round when nobody has been asked on it yet (it holds only engine
   *  prices), so the first email to an insurer is round 1, not a "revised" round 2. */
  reuseEmptyRound?: boolean
} = {}): Promise<{ rounds: PlacementRound[]; dispatches: PlacementDispatch[]; drafts: number; unrouted: string[] }> {
  const bundle = await store.loadPlacement(placement.id)
  const company = await store.company(placement.company_id)
  const memory = agent.memoryLines(bundle?.log ?? [])
  const rounds: PlacementRound[] = []
  const dispatches: PlacementDispatch[] = []
  const unrouted: string[] = []

  // 1. Close the previous round's unanswered dispatches, open the new round, update the line.
  const roundOf = new Map<string, PlacementRound>()
  for (const a of asks) {
    const prev = (bundle?.rounds ?? []).filter(r => r.line_id === a.line.id).sort((x, y) => y.round_no - x.round_no)[0] ?? null
    if (prev && opts.reuseEmptyRound && !(bundle?.dispatches ?? []).some(d => d.round_id === prev.id)) {
      await store.patchNoTs('placement_rounds', `id=eq.${prev.id}`, { spec: normaliseSpec(a.spec) })
      const reused = { ...prev, spec: normaliseSpec(a.spec) }
      rounds.push(reused); roundOf.set(a.line.id, reused)
      await store.patch('placement_lines', `id=eq.${a.line.id}`, { spec: normaliseSpec(a.spec), status: 'quoting', current_round_id: prev.id, next_step: 'Send the requests to the insurers' })
      continue
    }
    if (prev) {
      await store.patchNoTs('placement_rounds', `id=eq.${prev.id}`, { closed_at: now() })
      await store.patch('placement_dispatches', `round_id=eq.${prev.id}&status=in.(drafted,sent,acknowledged,info_requested)`, { status: 'withdrawn' })
    }
    const [round] = await store.insert<PlacementRound>('placement_rounds', {
      placement_id: placement.id, line_id: a.line.id, round_no: (prev?.round_no ?? 0) + 1, spec: normaliseSpec(a.spec),
      change_summary: a.change_summary, reason: a.reason, source_message_id: a.source_message_id ?? null, opened_by: actor,
    })
    rounds.push(round); roundOf.set(a.line.id, round)
    await store.patch('placement_lines', `id=eq.${a.line.id}`, { spec: normaliseSpec(a.spec), status: 'quoting', current_round_id: round.id, next_step: 'Send the requests to the insurers' })
    await store.log({ company_id: placement.company_id, placement_id: placement.id, line_id: a.line.id, round_id: round.id, kind: a.reason === 'initial' ? 'opened' : 'change', actor,
      text: a.reason === 'initial' ? `Round 1 opened for ${a.line.label}` : `Round ${round.round_no} opened for ${a.line.label}: ${(a.change_summary ?? describeChanges(specDiff(prev?.spec ?? {}, a.spec))) || 'spec revised'}`,
      detail: { acted: true, spec: normaliseSpec(a.spec) } })
  }

  // 2. Route: the contacts on file for each line, narrowed to the broker's pick.
  const allRoutes = await store.insurerRoutes([...new Set(asks.map(a => a.line.product_line))])
  const routes = opts.filterRoute ? allRoutes.filter(opts.filterRoute) : allRoutes
  const chosen = opts.contactIds ? new Set(opts.contactIds) : null
  const routed: { ask: RoundAsk; recipients: store.InsurerRoute[] }[] = []
  for (const a of asks) {
    const onFile = routes.filter(r => r.product_line === a.line.product_line)
    if (onFile.length === 0) { unrouted.push(a.line.label ?? a.line.product_line); continue }
    const forAsk = a.contact_ids ? new Set(a.contact_ids) : null
    const forLine = onFile.filter(r => (!chosen || chosen.has(r.contact_id)) && (!forAsk || forAsk.has(r.contact_id)))
    if (forLine.length === 0) {
      const label = a.line.label ?? a.line.product_line
      await store.patch('placement_lines', `id=eq.${a.line.id}`, { next_step: 'No insurer chosen — open a round to ask them' })
      await store.log({ company_id: placement.company_id, placement_id: placement.id, line_id: a.line.id, round_id: roundOf.get(a.line.id)?.id ?? null, kind: 'info', actor, text: `No insurer chosen for ${label}` })
      continue
    }
    // One dispatch per contact email: a person listed twice for the line is asked once.
    const seen = new Set<string>()
    routed.push({ ask: a, recipients: forLine.filter(r => !seen.has(r.email) && seen.add(r.email)) })
  }

  // 3. One draft per line, one dispatch per (line, contact), all pointing at that draft.
  let drafts = 0
  for (const { ask: a, recipients } of routed) {
    const round = roundOf.get(a.line.id)!
    const tiers = liveTiers(bundle, a.line.id)
    const text = await agent.draftToInsurer({
      insurerName: null, contactName: null, clientName: company?.company_name ?? 'the client',
      lines: [{ label: a.line.label ?? productLineLabel(a.line.product_line), productLine: a.line.product_line, spec: a.spec, tiers: tierAsks(tiers) }],
      roundNo: round.round_no, changeSummary: a.change_summary, previousPremium: null, inceptionDate: placement.inception_date, memory,
    })
    let draftId: string | null = null
    if (text) {
      const body = opts.extraBody?.trim() ? `${text.body}\n\n${opts.extraBody.trim()}` : text.body
      // The shared draft is addressed to the first recipient; fanoutDraft re-addresses a clone per dispatch.
      const draft = await store.createDraft({ contact_id: recipients[0].contact_id, to_email: recipients[0].email, subject: withRef(text.subject, placement.ref), body, email_type: DRAFT_TYPE.dispatch })
      if (tiers.some(t => t.status === 'proposed')) await store.patchNoTs('placement_tiers', `line_id=eq.${a.line.id}&status=eq.proposed`, { status: 'asked', asked_at: now() })
      draftId = draft?.id ?? null
      if (draftId) drafts++
    }
    const rows = await store.insert<PlacementDispatch>('placement_dispatches', recipients.map(r => ({
      placement_id: placement.id, line_id: a.line.id, round_id: round.id, company_id: placement.company_id,
      insurer_company_id: r.insurer_company_id, insurer_name: r.insurer_name, insurer_contact_id: r.contact_id, to_email: r.email,
      insurer_product_id: r.product_id ?? null, ai_draft_id: draftId, status: 'drafted',
    })))
    dispatches.push(...rows)
  }
  if (unrouted.length) {
    await store.log({ company_id: placement.company_id, placement_id: placement.id, kind: 'info', actor: 'system',
      text: `No insurer contact on file for: ${unrouted.join(', ')}. Add one under Settings → Insurers, then open the round again.` })
  }
  return { rounds, dispatches, drafts, unrouted }
}

// ── Sent ────────────────────────────────────────────────────────────────────────────────────

export type SentFacts = {
  gmailThreadId: string | null; gmailMessageId: string | null
  /** The Message-ID header as sent: the same in every mailbox, so the reply matches wherever it lands. */
  rfc822MessageId?: string | null
  /** The mailbox it went out from. A personal mailbox's Gmail thread is not the one operations@ sees. */
  fromEmail?: string | null
  subject?: string | null
  actor: string
}

/** After a person sends a dispatch draft: record who sent it and from where, start the chase clock, log it. */
export async function markSent(draftId: string, sent: SentFacts): Promise<PlacementDispatch[]> {
  const ds = await store.dispatchesForDraft(draftId)
  if (ds.length === 0) return []
  // Only a send from operations@ has a Gmail thread the ingest knows. A personal send's thread is
  // linked when the operations@ copy (it is always CC'd) comes through the ingest.
  const t = sent.gmailThreadId ? await store.threadByGmailId(sent.gmailThreadId) : null
  const placement = (await store.loadPlacement(ds[0].placement_id))?.placements[0]
  // The thread the send route made carries no company; file it under the CLIENT so it shows on their Threads tab.
  if (t && !t.company_id && placement) await store.patchNoTs('email_threads', `id=eq.${t.id}`, { company_id: placement.company_id })
  const at = now()
  const from = sent.fromEmail?.trim().toLowerCase() || null
  const updated = await store.patch<PlacementDispatch>('placement_dispatches', `ai_draft_id=eq.${draftId}`, {
    status: 'sent', sent_at: at, last_outbound_at: at, next_chase_at: nextChaseAt(new Date(), 0).toISOString(),
    gmail_thread_id: sent.gmailThreadId, thread_id: t?.id ?? null,
    rfc822_message_id: sent.rfc822MessageId?.trim() || null, sent_from: from, sent_by: sent.actor, sent_subject: sent.subject?.trim() || null,
  })
  for (const d of updated) {
    await store.patch('placement_lines', `id=eq.${d.line_id}`, { next_step: 'Waiting for the insurers to quote' })
    await store.log({ company_id: d.company_id, placement_id: d.placement_id, line_id: d.line_id, round_id: d.round_id, dispatch_id: d.id, kind: 'sent', actor: sent.actor,
      text: `Request sent to ${d.insurer_name} (${d.to_email})${from ? ` from ${from}` : ''}`, thread_id: t?.id ?? null })
  }
  return updated
}

// ── Fan-out ─────────────────────────────────────────────────────────────────────────────────

/**
 * Splits a shared request draft into one clone per dispatch carrying the reviewed text, repoints
 * each dispatch at its clone and retires the original. Each clone is then approved, sent and
 * marked sent on its own, so every insurer gets its own Gmail thread.
 */
export async function fanoutDraft(draftId: string, text: FanoutText, actor: string): Promise<{ clones: FanoutClone[] }> {
  const draft = await store.draftById(draftId)
  if (!draft) throw new Error('Draft not found')
  if (draft.email_type !== DRAFT_TYPE.dispatch) throw new Error('Only a placement request draft can be fanned out')
  if (draft.status !== 'pending') throw new Error(`Draft is ${draft.status}, not pending`)
  const targets = (await store.dispatchesForDraft(draftId)).filter(d => d.status === 'drafted')
  if (targets.length === 0) throw new Error('No dispatch is waiting on that draft')
  const inserted = await store.insert<{ id: string }>('ai_drafts', cloneRows(draft, targets, text))
  const clones = pairClones(targets, inserted)
  for (const c of clones) await store.patch('placement_dispatches', `id=eq.${c.dispatch_id}`, { ai_draft_id: c.draft_id })
  await store.patchNoTs('ai_drafts', `id=eq.${draftId}`, { status: 'superseded' })
  const d = targets[0]
  await store.log({ company_id: d.company_id, placement_id: d.placement_id, line_id: d.line_id, round_id: d.round_id, kind: 'info', actor,
    text: `Request approved for ${clones.length} insurer${clones.length === 1 ? '' : 's'}: ${clones.map(c => c.insurer_name).join(', ')}`, detail: { ai_draft_id: draftId, clone_ids: clones.map(c => c.draft_id) } })
  return { clones }
}

// ── Inbound ─────────────────────────────────────────────────────────────────────────────────

export type InboundResult = { handled: 'insurer' | 'client' | 'none'; detail?: string }

/** Called by ingest for every newly stored message. Cheap when the thread is not ours. */
export async function handleInbound(input: { message_id: string; thread_id: string; gmail_thread_id: string | null; direction: 'inbound' | 'outbound' }): Promise<InboundResult> {
  const msg = await store.message(input.message_id)

  // 1. Our own request again: the operations@ copy of one a broker sent from their own mailbox.
  if (input.direction === 'outbound' && msg?.rfc822_message_id) {
    const own = await store.dispatchesByRfc822(msg.rfc822_message_id)
    if (own.length) {
      for (const d of own) if (!d.thread_id) await store.patch('placement_dispatches', `id=eq.${d.id}`, { thread_id: input.thread_id })
      return { handled: 'insurer', detail: 'request copy linked' }
    }
  }

  // 2. The thread a request went out on.
  const dispatch = await store.dispatchForThread(input.thread_id, input.gmail_thread_id)
  if (dispatch) {
    if (!dispatch.thread_id) await store.patch('placement_dispatches', `id=eq.${dispatch.id}`, { thread_id: input.thread_id })
    if (input.direction === 'outbound' && !(msg && isInternal(msg.from_address) && readForward(msg.subject, msg.body_text)?.from)) {
      await store.patch('placement_dispatches', `id=eq.${dispatch.id}`, { last_outbound_at: now() })
      return { handled: 'insurer', detail: 'outbound noted' }
    }
    // The same insurer asked about other lines of this placement may be answered in the same email.
    const siblings = (await store.openDispatchesFor(dispatch.to_email)).filter(o => o.placement_id === dispatch.placement_id && o.line_id !== dispatch.line_id && o.current !== false)
    return handleInsurerReply([dispatch, ...await store.dispatchesByIds(siblings.map(o => o.id))], input.message_id, input.thread_id)
  }

  // 3. The client's thread of an open placement.
  const placement = await store.placementForClientThread(input.thread_id)
  if (placement && input.direction === 'inbound') return handleClientReply(placement, input.message_id, input.thread_id)

  // 4. Anywhere else: an insurer starting a fresh thread, a reply to a personal mailbox's send, a broker's forward.
  if (msg) {
    const placed = await placeElsewhere(msg, input.thread_id, input.direction)
    if (placed) return placed
  }
  return handlePolicyInbound(input)
}

/**
 * A message off the request threads: match it by Message-ID, reference or subject; queue it for
 * a broker when only the insurer is known; hand a client's forwarded or referenced email to the
 * client handler. Null = not placement mail, let the policy handler look.
 */
async function placeElsewhere(msg: store.MailMessage, threadId: string, direction: 'inbound' | 'outbound'): Promise<InboundResult | null> {
  const fwd = isInternal(msg.from_address) ? readForward(msg.subject, msg.body_text) : null
  if (direction === 'outbound' && !fwd?.from) return null
  const party = (fwd?.from?.email ?? msg.from_address ?? '').toLowerCase()
  if (!party || isInternal(party)) return null
  const forwardedBy = fwd ? (msg.from_address ?? '').toLowerCase() : null

  const open = await store.openDispatchesFor(party)
  const m = matchDispatches({ party, subject: fwd?.subject ?? msg.subject, body: `${msg.subject ?? ''}\n${msg.body_text ?? ''}`, inReplyTo: fwd ? null : msg.in_reply_to ?? null }, open)
  if (m.kind === 'matched') {
    const ds = await store.dispatchesByIds(m.ids)
    // The dispatch the match came from first: it gets the info-request and acknowledgement handling.
    ds.sort((x, y) => m.ids.indexOf(x.id) - m.ids.indexOf(y.id))
    return handleInsurerReply(ds, msg.id, threadId, forwardedBy)
  }
  if (m.kind === 'ambiguous') {
    const companyId = open.find(o => m.ids.includes(o.id))?.company_id ?? null
    await store.queueUnmatched({ message_id: msg.id, thread_id: threadId, from_address: party, forwarded_by: forwardedBy, subject: fwd?.subject ?? msg.subject, reason: m.reason, candidate_dispatch_ids: m.ids, company_id: companyId })
    // A subject that names a request is quote mail: say so on the company and stop. A domain alone
    // may be anything the insurer sends (a renewal notice, a debit note), so it waits in the queue
    // quietly and the policy handler still reads it.
    if (m.strength === 'domain') return null
    if (companyId) await store.log({ company_id: companyId, kind: 'info', actor: 'system', thread_id: threadId, message_id: msg.id,
      text: `Email from ${party}${forwardedBy ? ` (forwarded by ${forwardedBy})` : ''} answers a quote request but more than one fits — choose which under Unmatched replies`, detail: { candidate_dispatch_ids: m.ids } })
    return { handled: 'insurer', detail: 'queued for a broker' }
  }

  // Not an insurer's answer. A client's email that names its placement, or that a broker forwarded.
  const companyId = await store.companyForEmail(party)
  if (!companyId) return null
  const refs = parseRefs(msg.subject, msg.body_text)
  let target = (await store.placementsByRefs(companyId, refs))[0] ?? null
  if (!target && fwd) {
    const openForCompany = (await store.loadBundle(companyId)).placements.filter(p => p.status !== 'closed')
    if (openForCompany.length === 1) target = openForCompany[0]
  }
  return target ? handleClientReply(target, msg.id, threadId, forwardedBy) : null
}

/** "500k: S$36,800 (S$800/head); 1M: S$46,920" — what came in, for the log. */
const quoteSummary = (qs: agent.ReadQuote[]): string => qs.map(q => {
  const price = [q.premium, q.per_head ? `${q.per_head} per head` : null].filter(Boolean).join(', ') || 'premium not stated'
  return `${q.tier ? `${q.tier}: ` : ''}${price}${q.limit && !q.tier ? ` for ${q.limit}` : ''}`
}).join('; ')

/**
 * Files an insurer's email against the requests it answers: one or more lines of one placement,
 * every price as its own quote row. A revised price for the same tier supersedes the old row
 * (kept, never deleted). The first dispatch is the one the email was matched through.
 */
async function handleInsurerReply(ds: PlacementDispatch[], messageId: string, threadId: string | null, forwardedBy: string | null = null): Promise<InboundResult> {
  const msg = await store.message(messageId)
  if (!msg || ds.length === 0) return { handled: 'insurer', detail: 'message missing' }
  const atts = await store.attachmentsFor(messageId, !!msg.has_attachments)
  const kinds: string[] = []
  // A match never spans placements in practice, but each placement is read with its own lines.
  for (const placementId of [...new Set(ds.map(d => d.placement_id))]) {
    kinds.push(await fileReply(ds.filter(d => d.placement_id === placementId), msg, atts, threadId, forwardedBy))
  }
  return { handled: 'insurer', detail: kinds.join(',') }
}

async function fileReply(group: PlacementDispatch[], msg: store.MailMessage, atts: store.MailAttachment[], threadId: string | null, forwardedBy: string | null): Promise<string> {
  const bundle = await store.loadPlacement(group[0].placement_id)
  const items = group.map((d, i) => {
    const line = bundle?.lines.find(l => l.id === d.line_id) ?? null
    const round = bundle?.rounds.find(r => r.id === d.round_id) ?? null
    return { d, key: `L${i + 1}`, line, round, tiers: (bundle?.tiers ?? []).filter(t => t.line_id === d.line_id) }
  })
  const insurer = group[0].insurer_name
  const read = await agent.readInsurerReply(msg, atts, {
    insurerName: insurer, roundNo: Math.max(...items.map(x => x.round?.round_no ?? 1)),
    lines: items.map(x => ({ key: x.key, label: x.line?.label ?? insurer, spec: x.round?.spec ?? x.line?.spec ?? {}, tiers: x.tiers.filter(t => t.status !== 'dropped').map(t => t.label) })),
  })
  const at = now()
  const via = forwardedBy ? ` (forwarded by ${forwardedBy})` : ''
  const baseOf = (d: PlacementDispatch) => ({ company_id: d.company_id, placement_id: d.placement_id, line_id: d.line_id, round_id: d.round_id, dispatch_id: d.id, thread_id: threadId, message_id: msg.id })
  if (!read) {
    for (const { d } of items) await store.patch('placement_dispatches', `id=eq.${d.id}`, { last_inbound_at: at })
    await store.log({ ...baseOf(group[0]), kind: 'reply', actor: 'system', text: `${insurer} replied${via}; the agent could not read it. Open the thread.` })
    return 'unread'
  }

  for (const [i, { d, key, line, tiers }] of items.entries()) {
    const base = baseOf(d)
    const label = line?.label ?? insurer
    // The insurer confirming the option we confirmed to them: the line moves to the debit note.
    // Checked first, so figures restated in a confirmation are not filed as a new quote.
    const picked = line?.picked_quote_id ? bundle?.quotes.find(q => q.id === line.picked_quote_id) : null
    if (line && line.confirm_sent_at && !line.insurer_confirmed_at && picked?.dispatch_id === d.id && (read.kind === 'confirmation' || (read.kind !== 'decline' && read.kind !== 'info_request' && !!read.policy_number))) {
      await confirmFromInsurer(line, d, read.policy_number, read.summary, base, via)
      continue
    }
    const qs = read.quotes.filter(q => q.line_key === key)
    if (qs.length) {
      for (const q of qs) {
        let tier = q.tier ? findTier(q.tier, tiers) : null
        if (q.tier && !tier) {
          // A price for an option nobody asked for is kept as a tier of its own.
          const [made] = await store.insert<PlacementTier>('placement_tiers', { placement_id: d.placement_id, line_id: d.line_id, label: q.tier.slice(0, 80), status: 'offered', source: 'insurer', source_message_id: msg.id, sort: tiers.length })
            .catch(() => [] as PlacementTier[])
          if (made) { tier = made; tiers.push(made) }
        }
        await store.patchNoTs('placement_quotes', `dispatch_id=eq.${d.id}&status=eq.received&tier_id=${tier ? `eq.${tier.id}` : 'is.null'}`, { status: 'superseded' })
        const row = {
          placement_id: d.placement_id, line_id: d.line_id, round_id: d.round_id, dispatch_id: d.id, insurer_name: d.insurer_name,
          tier_id: tier?.id ?? null, tier_label: q.tier, premium_text: q.premium, premium_per_head_text: q.per_head,
          limit_text: q.limit, excess_text: q.excess, validity_text: q.validity, valid_until: q.valid_until,
          key_terms: q.key_terms, exclusions: q.exclusions, subjectivities: q.subjectivities, summary: read.summary, evidence: q.evidence,
          source_message_id: msg.id, thread_id: threadId, extracted_by: 'placement', ...agent.quoteFields(q),
        }
        // The line's sum insured as asked is the rate's base when the insurer does not state one.
        const specBase = /sum insured|contract value|wages/i.test(line?.spec?.limit ?? '') ? parseMoney(line?.spec?.limit)?.amount ?? null : null
        const rates = agent.rateFields(q, specBase)
        if (rates.rate_check === 'mismatch') row.needs_review = true
        // Rate columns arrive with migration 20261030_quote_rates; until then the quote is kept without them.
        await store.insert('placement_quotes', { ...row, ...rates }).catch(() => store.insert('placement_quotes', row))
      }
      const review = qs.some(q => agent.quoteFields(q).needs_review)
      await store.patch('placement_dispatches', `id=eq.${d.id}`, { status: 'quoted', last_inbound_at: at, next_chase_at: null })
      await store.log({ ...base, kind: 'quote', text: `${insurer} quoted ${label}${via}: ${quoteSummary(qs)}${review ? ' — check the figures against the source' : ''}` })
    } else if ((read.kind === 'decline' && read.declined_lines.length === 0) || read.declined_lines.includes(key)) {
      await store.patch('placement_dispatches', `id=eq.${d.id}`, { status: 'declined', last_inbound_at: at, next_chase_at: null })
      // "Already quoted through another broker": the market is blocked until the client signs the
      // appointment letter. The line says so, and the broker gets the letter from the placement.
      if (isBrokerBlock(`${read.summary} ${msg.body_text ?? ''}`.slice(0, 4000))) {
        await store.patch('placement_lines', `id=eq.${d.line_id}`, { next_step: `Blocked: ${insurer} already quoted through another broker. Get the signed appointment letter.` })
        await store.log({ ...base, kind: 'declined', text: `${insurer} is blocked on ${label}${via}: already quoted through another broker. The signed appointment letter releases it.`, detail: { blocked: 'broker_of_record' } })
      } else {
        await store.log({ ...base, kind: 'declined', text: `${insurer} declined ${label}${via}: ${read.summary}` })
      }
    } else if (i === 0) {
      // Not a price for this line: the email is about the request it was matched through.
      if (read.kind === 'info_request') {
        await store.patch('placement_dispatches', `id=eq.${d.id}`, { status: 'info_requested', last_inbound_at: at, next_chase_at: null })
        await store.patch('placement_lines', `id=eq.${d.line_id}`, { next_step: `${insurer} needs: ${read.questions.join('; ') || read.summary}` })
        await store.log({ ...base, kind: 'ask', text: `${insurer} asked${via}: ${read.questions.join('; ') || read.summary}`, detail: { questions: read.questions } })
      } else if (read.kind !== 'quote') {
        const st = read.kind === 'acknowledgement' ? 'acknowledged' : d.status
        await store.patch('placement_dispatches', `id=eq.${d.id}`, { status: st, last_inbound_at: at, next_chase_at: nextChaseAt(new Date(), d.chase_count).toISOString() })
        await store.log({ ...base, kind: 'reply', text: `${insurer}${via}: ${read.summary}` })
      } else if (read.quotes.length === 0) {
        await store.patch('placement_dispatches', `id=eq.${d.id}`, { last_inbound_at: at })
        await store.log({ ...base, kind: 'reply', actor: 'system', text: `${insurer} sent a quote${via}, but the agent could not read the figures. Open the thread.` })
      }
    }
  }

  // Every insurer on a line answered → the line is quoted and the next step is the client.
  const fresh = await store.loadPlacement(group[0].placement_id)
  if (fresh) {
    for (const pos of derivePositions(fresh).filter(p => items.some(x => x.d.line_id === p.line.id))) {
      if (pos.allAnswered && !lineFinished(pos.line.status) && pos.line.status !== 'bound') {
        await store.patch('placement_lines', `id=eq.${pos.line.id}`, { status: 'quoted', next_step: 'All insurers have answered — send the comparison to the client' })
      }
    }
  }
  return read.kind
}

async function handleClientReply(p: Placement, messageId: string, threadId: string, forwardedBy: string | null = null): Promise<InboundResult> {
  const msg = await store.message(messageId)
  const bundle = await store.loadPlacement(p.id)
  if (!msg || !bundle) return { handled: 'client', detail: 'missing' }
  const atts = await store.attachmentsFor(messageId, !!msg.has_attachments)
  const positions = derivePositions(bundle)
  const read = await agent.readClientReply(msg, atts, {
    lines: positions.map(x => ({
      label: x.line.label ?? x.line.product_line, spec: x.round?.spec ?? x.line.spec, bestPremium: x.best?.premium_text ?? null,
      quoted: x.dispatches.flatMap(d => d.quotes.map(q => `${d.dispatch.insurer_name}${d.dispatch.insurer_product_name ? ` · ${d.dispatch.insurer_product_name}` : ''} [${optionLabel(x, q)}] ${q.premium_text ?? ''}`.trim())),
    })),
    memory: agent.memoryLines(bundle.log),
  })
  const via = forwardedBy ? ` (forwarded by ${forwardedBy})` : ''
  const base = { company_id: p.company_id, placement_id: p.id, thread_id: threadId, message_id: messageId }
  if (!read) { await store.log({ ...base, kind: 'reply', actor: 'system', text: `Client replied${via}; the agent could not read it. Open the thread.` }); return { handled: 'client', detail: 'unread' } }
  const lineFor = (label: string) => positions.find(x => (x.line.label ?? x.line.product_line).toLowerCase() === label.toLowerCase()) ?? (positions.length === 1 ? positions[0] : null)

  // More options to compare: proposed tiers on each line, for a broker to ask the insurers.
  if (read.tiers.length) {
    for (const pos of positions) {
      const asked = read.tiers.filter(t => lineFor(t.line_label)?.line.id === pos.line.id)
      if (asked.length === 0) continue
      const existing = bundle.tiers.filter(t => t.line_id === pos.line.id)
      const added: PlacementTier[] = []
      for (const t of asked) {
        const known = findTier(t.label, existing)
        if (known) {
          if (known.status === 'dropped') await store.patchNoTs('placement_tiers', `id=eq.${known.id}`, { status: 'proposed' })
          continue
        }
        const [row] = await store.insert<PlacementTier>('placement_tiers', {
          placement_id: p.id, line_id: pos.line.id, label: t.label, spec: t.spec, target_premium: t.target_premium,
          status: 'proposed', source: 'client', source_message_id: messageId, created_by: 'agent', sort: existing.length + added.length,
        }).catch(() => [] as PlacementTier[])
        if (row) { added.push(row); existing.push(row) }
      }
      const labels = asked.map(t => t.label).join(', ')
      await store.patch('placement_lines', `id=eq.${pos.line.id}`, { next_step: `Client wants to compare ${labels} — ask the insurers` })
      await store.log({ ...base, line_id: pos.line.id, kind: 'ask', text: `Client wants to compare ${labels} on ${pos.line.label}${via}`, detail: { acted: false, tier_ids: added.map(t => t.id), summary: read.summary } })
    }
  }
  if (read.changes.length) {
    for (const c of read.changes) {
      const pos = positions.find(x => (x.line.label ?? x.line.product_line).toLowerCase() === c.line_label.toLowerCase())
      const prev = pos?.round?.spec ?? pos?.line.spec ?? {}
      const summary = pos ? describeChanges(specDiff(prev, c.spec)) : `New line asked for: ${c.line_label}`
      await store.log({ ...base, line_id: pos?.line.id ?? null, kind: 'change', text: `Client asks for a change${pos ? ` on ${pos.line.label}` : ''}${via}: ${summary || read.summary}`,
        detail: { acted: false, spec: c.spec, line_label: c.line_label, summary: read.summary } })
      if (pos) await store.patch('placement_lines', `id=eq.${pos.line.id}`, { next_step: `Client change to confirm: ${summary || read.summary}` })
    }
  } else if (read.kind === 'acceptance') {
    // Each clear pick drafts the confirmation to that insurer; anything unclear waits for a broker.
    const placed: string[] = []
    for (const pick of read.picks) {
      const hit = resolvePick(positions, pick)
      if (!hit) continue
      await recordPick(hit.quote.id, 'agent', { messageId, threadId })
      placed.push(hit.pos.line.id)
    }
    const open = positions.filter(x => !placed.includes(x.line.id) && !lineFinished(x.line.status) && x.line.status !== 'bound')
    if (placed.length === 0 || (read.picks.length > placed.length)) {
      await store.log({ ...base, kind: 'decision', text: `Client wants to proceed${via}: ${read.summary}${placed.length ? '' : ' — choose the quote on the grid to draft the confirmation'}`, detail: { acted: false, picks: read.picks } })
      for (const x of open) await store.patch('placement_lines', `id=eq.${x.line.id}`, { next_step: `Client wants to proceed: ${read.summary} — pick the quote they chose` })
    }
  } else if (read.kind !== 'tiers' && read.kind !== 'change') {
    await store.log({ ...base, kind: read.kind === 'question' ? 'ask' : 'reply', text: `Client${via}: ${read.summary}` })
  }
  return { handled: 'client', detail: read.kind }
}

// ── Tiers ───────────────────────────────────────────────────────────────────────────────────

/** Adds options to compare on a line. Labels already on the line are skipped (a dropped one comes back). */
export async function addTiers(lineId: string, tiers: { label: string; spec?: Spec; target_premium?: string | null }[], actor: string): Promise<PlacementTier[]> {
  const [line] = await sbLine(lineId)
  if (!line) throw new Error('Placement line not found')
  const bundle = await store.loadPlacement(line.placement_id)
  const existing = (bundle?.tiers ?? []).filter(t => t.line_id === lineId)
  const out: PlacementTier[] = []
  for (const t of tiers) {
    const label = t.label.trim().slice(0, 80)
    if (!label) continue
    const known = findTier(label, existing)
    if (known) {
      if (known.status === 'dropped') { await store.patchNoTs('placement_tiers', `id=eq.${known.id}`, { status: 'proposed' }); out.push({ ...known, status: 'proposed' }) }
      continue
    }
    const [row] = await store.insert<PlacementTier>('placement_tiers', {
      placement_id: line.placement_id, line_id: lineId, label, spec: normaliseSpec(t.spec), target_premium: t.target_premium?.trim() || null,
      status: 'proposed', source: 'broker', created_by: actor, sort: existing.length + out.length,
    })
    if (row) { out.push(row); existing.push(row) }
  }
  const company = bundle?.placements[0]?.company_id
  if (company && out.length) await store.log({ company_id: company, placement_id: line.placement_id, line_id: lineId, kind: 'note', actor, text: `Options to compare on ${line.label}: ${out.map(t => t.label).join(', ')}` })
  return out
}

const sbLine = (id: string) => store.rows<PlacementLine>(`placement_lines?id=eq.${id}&limit=1`)

/**
 * Asks every insurer still on the line's current round to price the proposed tiers: one draft
 * per insurer, as a reply on that insurer's thread, all with the same text. Nothing is sent.
 */
export async function askTiers(lineId: string, actor: string, tierIds?: string[]): Promise<{ drafts: number; tiers: PlacementTier[] }> {
  const [line] = await sbLine(lineId)
  if (!line) throw new Error('Placement line not found')
  const bundle = await store.loadPlacement(line.placement_id)
  const p = bundle?.placements[0]
  if (!bundle || !p) throw new Error('Placement not found')
  const tiers = liveTiers(bundle, lineId).filter(t => tierIds ? tierIds.includes(t.id) : t.status === 'proposed')
  if (tiers.length === 0) throw new Error('No option is waiting to be asked on this line')
  const round = bundle.rounds.find(r => r.id === line.current_round_id) ?? null
  const live = bundle.dispatches.filter(d => d.round_id === line.current_round_id && ['sent', 'acknowledged', 'info_requested', 'quoted'].includes(d.status))
  if (live.length === 0) throw new Error('No insurer has been sent this line yet — send the requests first, or open a round')
  const company = await store.company(p.company_id)
  const text = await agent.draftTierAsk({ clientName: company?.company_name ?? 'our client', lineLabel: line.label ?? productLineLabel(line.product_line), spec: round?.spec ?? line.spec, tiers: tierAsks(tiers), inceptionDate: p.inception_date })
  if (!text) throw new Error('The agent could not draft the request — try again')
  const ids: string[] = []
  for (const d of live) {
    if (!d.insurer_contact_id) continue
    const draft = await store.createDraft({ contact_id: d.insurer_contact_id, to_email: d.to_email, subject: withRef(text.subject, p.ref), body: text.body, thread_id: d.thread_id, email_type: DRAFT_TYPE.tier })
    if (draft) ids.push(draft.id)
  }
  await store.patchNoTs('placement_tiers', `id=in.(${tiers.map(t => t.id).join(',')})`, { status: 'asked', asked_at: now() })
  await store.patch('placement_lines', `id=eq.${lineId}`, { next_step: `Ask ${live.length} insurer${live.length === 1 ? '' : 's'} to price ${tiers.map(t => t.label).join(', ')} — approve the drafts` })
  await store.log({ company_id: p.company_id, placement_id: p.id, line_id: lineId, round_id: round?.id ?? null, kind: 'ask', actor,
    text: `Drafted to ${live.length} insurer${live.length === 1 ? '' : 's'}: price ${tiers.map(t => t.label).join(', ')} on ${line.label} — awaiting approval`, detail: { acted: true, ai_draft_ids: ids, tier_ids: tiers.map(t => t.id) } })
  // The client's request that proposed them is now acted on.
  for (const e of bundle.log.filter(e => e.kind === 'ask' && e.line_id === lineId && e.detail?.acted === false)) {
    await store.patchNoTs('placement_log', `id=eq.${e.id}`, { detail: { ...e.detail, acted: true } })
  }
  return { drafts: ids.length, tiers }
}

/** Takes options off a line. Their quotes stay on record. */
export async function dropTiers(lineId: string, tierIds: string[], actor: string): Promise<number> {
  if (tierIds.length === 0) return 0
  const dropped = await store.patchNoTs<PlacementTier>('placement_tiers', `line_id=eq.${lineId}&id=in.(${tierIds.join(',')})&status=neq.dropped`, { status: 'dropped' })
  const t = dropped[0]
  const [p] = t ? await store.rows<Placement>(`placements?id=eq.${t.placement_id}&limit=1`) : []
  if (p) await store.log({ company_id: p.company_id, placement_id: p.id, line_id: lineId, kind: 'note', actor, text: `Options dropped: ${dropped.map(x => x.label).join(', ')}` })
  return dropped.length
}

// ── Unmatched replies ───────────────────────────────────────────────────────────────────────

/** A broker says which requests a queued reply answers (it is then read and filed), or that it answers none. */
export async function resolveUnmatched(id: string, dispatchIds: string[] | null, actor: string): Promise<InboundResult> {
  const [row] = await store.rows<store.UnmatchedRow>(`placement_unmatched?id=eq.${id}&limit=1`)
  if (!row) throw new Error('Unmatched reply not found')
  if (row.status !== 'open') throw new Error(`Already ${row.status}`)
  const at = now()
  if (!dispatchIds) {
    await store.patchNoTs('placement_unmatched', `id=eq.${id}`, { status: 'ignored', resolved_by: actor, resolved_at: at })
    return { handled: 'none', detail: 'ignored' }
  }
  const ds = await store.dispatchesByIds(dispatchIds)
  if (ds.length === 0) throw new Error('None of those requests exist')
  await store.patchNoTs('placement_unmatched', `id=eq.${id}`, { status: 'assigned', assigned_dispatch_ids: ds.map(d => d.id), resolved_by: actor, resolved_at: at })
  for (const d of ds) if (!d.thread_id && row.thread_id) await store.patch('placement_dispatches', `id=eq.${d.id}`, { thread_id: row.thread_id })
  return handleInsurerReply(ds, row.message_id, row.thread_id ?? ds[0].thread_id ?? null, row.forwarded_by)
}

// ── Done ────────────────────────────────────────────────────────────────────────────────────

/**
 * A debit note filed in Drive finishes the line that quoted its policy. Called after the note is
 * archived; a note with no Drive folder leaves the line open with the step to file it.
 */
export async function closeLineForDebitNote(debitNoteId: string, actor: string): Promise<{ closed: boolean; detail: string }> {
  type DN = { id: string; debit_note_no: string; policy_id: string; drive_folder_url: string | null }
  const [dn] = await store.rows<DN>(`debit_notes?id=eq.${debitNoteId}&select=id,debit_note_no,policy_id,drive_folder_url&limit=1`)
  if (!dn) return { closed: false, detail: 'debit note not found' }
  const lines = await store.rows<PlacementLine>(`placement_lines?policy_id=eq.${dn.policy_id}&order=created_at.desc`)
  const line = lines.find(l => !lineFinished(l.status)) ?? null
  if (!line) return { closed: false, detail: 'no open line quotes this policy' }
  const bundle = await store.loadPlacement(line.placement_id)
  const p = bundle?.placements[0]
  if (!p) return { closed: false, detail: 'placement not found' }
  const base = { company_id: p.company_id, placement_id: p.id, line_id: line.id }
  if (!dn.drive_folder_url) {
    await store.patch('placement_lines', `id=eq.${line.id}`, { next_step: `${dn.debit_note_no} issued — file it in Drive to close the line` })
    await store.log({ ...base, kind: 'info', actor, text: `${dn.debit_note_no} issued for ${line.label}; not yet filed in Drive, so the line stays open`, detail: { debit_note_id: dn.id } })
    return { closed: false, detail: 'not filed in Drive' }
  }
  const at = now()
  await store.patch('placement_lines', `id=eq.${line.id}`, { status: 'done', done_at: at, debit_note_id: dn.id, next_step: null })
  await store.log({ ...base, kind: 'done', actor, text: `${line.label} done: ${dn.debit_note_no} issued and filed in Drive`, detail: { debit_note_id: dn.id, drive_folder_url: dn.drive_folder_url, policy_id: dn.policy_id } })
  const statuses = (bundle?.lines ?? []).map(l => l.id === line.id ? 'done' : l.status)
  if (placementFinished(statuses)) {
    await store.patchNoTs('placements', `id=eq.${p.id}`, { status: 'closed', updated_at: at })
    await store.log({ company_id: p.company_id, placement_id: p.id, kind: 'closed', actor, text: `${p.ref} closed: every line is done or finished` })
  }
  return { closed: true, detail: 'done' }
}

// ── Chase ───────────────────────────────────────────────────────────────────────────────────

/** Every dispatch whose chase date has passed gets a draft in the review queue. Up to three chases. */
export async function runChases(nowDate = new Date()): Promise<{ drafted: number; skipped: number }> {
  const due = await store.sbDue(nowDate)
  let drafted = 0, skipped = 0
  for (const d of due) {
    if (d.chase_count >= MAX_CHASES) { await store.patch('placement_dispatches', `id=eq.${d.id}`, { next_chase_at: null }); skipped++; continue }
    const bundle = await store.loadPlacement(d.placement_id)
    const line = bundle?.lines.find(l => l.id === d.line_id)
    const company = await store.company(d.company_id)
    const body = await agent.draftChase({ insurerName: d.insurer_name, contactName: null, clientName: company?.company_name ?? 'our client', lineLabel: line?.label ?? d.insurer_name,
      sentOn: (d.sent_at ?? d.created_at).slice(0, 10), chaseNo: d.chase_count + 1, inceptionDate: bundle?.placements[0]?.inception_date ?? null })
    if (!body || !d.insurer_contact_id) { skipped++; continue }
    const draft = await store.createDraft({ contact_id: d.insurer_contact_id, to_email: d.to_email, subject: withRef(`Follow-up: quotation request — ${company?.company_name ?? ''}`.trim(), bundle?.placements[0]?.ref), body, thread_id: d.thread_id, email_type: DRAFT_TYPE.chase })
    if (!draft) { skipped++; continue }
    await store.patch('placement_dispatches', `id=eq.${d.id}`, { chase_count: d.chase_count + 1, next_chase_at: nextChaseAt(nowDate, d.chase_count + 1).toISOString() })
    await store.log({ company_id: d.company_id, placement_id: d.placement_id, line_id: d.line_id, round_id: d.round_id, dispatch_id: d.id, kind: 'chase',
      text: `Chase ${d.chase_count + 1} drafted for ${d.insurer_name} — awaiting approval`, detail: { ai_draft_id: draft.id }, thread_id: d.thread_id })
    drafted++
  }
  return { drafted, skipped }
}

// ── Client summary ──────────────────────────────────────────────────────────────────────────

/**
 * Drafts the comparison to the client: a table per line built from the stored figures, with the
 * model's words around it. `quoteIds` limits it to the quotes the broker ticked; partial is fine,
 * and the email names who is still pricing. Saved as a share so what went out is kept.
 */
export async function draftClientSummary(placementId: string, actor: string, quoteIds?: string[] | null): Promise<{ draftId: string } | null> {
  const bundle = await store.loadPlacement(placementId)
  const p = bundle?.placements[0]
  if (!bundle || !p) return null
  const company = await store.company(p.company_id)
  const positions = derivePositions(bundle).filter(x => !lineFinished(x.line.status))
  const lines = emailLines(positions, quoteIds?.length ? new Set(quoteIds) : null)
  const included = lines.flatMap(l => l.quotes.map(q => q.quote.id))
  if (included.length === 0) throw new Error('None of the ticked quotes can be sent (expired or not chosen).')
  const contact = p.client_contact_id ? (await store.sbTryContact(p.client_contact_id)) : null
  if (!contact?.email || !p.client_contact_id) {
    await store.log({ company_id: p.company_id, placement_id: p.id, kind: 'info', actor: 'system', text: 'No client contact on the placement — set the client thread, then draft again.' })
    return null
  }
  const words = await agent.draftClientSummary({
    clientName: company?.company_name ?? 'the client', contactName: contact.name ?? null, placementTitle: p.title, inceptionDate: p.inception_date,
    lines: positions.map((x, i) => ({
      label: lines[i].label, spec: x.round?.spec ?? x.line.spec, roundNo: x.roundNo,
      quotes: lines[i].quotes.map(e => ({ insurer: e.insurer, product: e.product, option: e.option, premium: e.quote.premium_text, perHead: e.quote.premium_per_head_text ?? null, limit: e.quote.limit_text, keyTerms: e.quote.key_terms, subjectivities: e.quote.subjectivities, exclusions: e.quote.exclusions })),
      pending: lines[i].pending, declined: lines[i].declined,
    })),
    memory: agent.memoryLines(bundle.log),
  })
  if (!words) return null
  const body = comparisonBody(words, lines)
  const subject = withRef(words.subject, p.ref)
  const draft = await store.createDraft({ contact_id: p.client_contact_id, to_email: contact.email, subject, body, thread_id: p.client_thread_id, email_type: DRAFT_TYPE.client })
  if (!draft) return null
  await store.insert<PlacementShare>('placement_shares', { placement_id: p.id, company_id: p.company_id, ai_draft_id: draft.id, quote_ids: included, subject, body, status: 'drafted', created_by: actor })
    .catch(e => console.error('[placement] share not saved (apply 20261029_placement_bind.sql)', e))
  for (const x of positions) await store.patch('placement_lines', `id=eq.${x.line.id}`, { next_step: 'Comparison drafted — check and send it to the client' })
  const partial = lines.some(l => l.pending.length > 0)
  await store.log({ company_id: p.company_id, placement_id: p.id, kind: 'decision', actor, text: `Comparison to the client drafted (${included.length} price${included.length === 1 ? '' : 's'}${partial ? ', more to come' : ''}) — awaiting approval`, detail: { ai_draft_id: draft.id, quote_ids: included } })
  return { draftId: draft.id }
}

/** After the comparison is sent: the share is kept as sent and the request waits on the client. */
export async function markShareSent(draftId: string, sent: SentFacts): Promise<PlacementShare | null> {
  const at = now()
  const [share] = await store.patchNoTs<PlacementShare>('placement_shares', `ai_draft_id=eq.${draftId}`, {
    status: 'sent', sent_at: at, sent_by: sent.actor, sent_from: sent.fromEmail?.trim().toLowerCase() || null, rfc822_message_id: sent.rfc822MessageId?.trim() || null,
    ...(sent.subject ? { subject: sent.subject } : {}),
  }).catch(() => [] as PlacementShare[])
  // Without the share table the placement is still found through the log entry that names the draft.
  const placementId = share?.placement_id ?? (await store.rows<{ placement_id: string }>(`placement_log?detail->>ai_draft_id=eq.${draftId}&select=placement_id&limit=1`))[0]?.placement_id
  if (!placementId) return null
  const bundle = await store.loadPlacement(placementId)
  const p = bundle?.placements[0]
  if (!bundle || !p) return share ?? null
  if (p.status === 'open') await store.patchNoTs('placements', `id=eq.${p.id}`, { status: 'presented', updated_at: at })
  const quoteLines = new Set(bundle.quotes.filter(q => share?.quote_ids.includes(q.id)).map(q => q.line_id))
  for (const l of bundle.lines) {
    if (lineFinished(l.status) || l.status === 'bound' || (share && !quoteLines.has(l.id))) continue
    await store.patch('placement_lines', `id=eq.${l.id}`, { status: 'presented', next_step: 'Comparison sent — waiting for the client to choose' })
  }
  await store.log({ company_id: p.company_id, placement_id: p.id, kind: 'sent', actor: sent.actor, text: `Comparison sent to the client${sent.fromEmail ? ` from ${sent.fromEmail}` : ''}${share ? ` (${share.quote_ids.length} price${share.quote_ids.length === 1 ? '' : 's'})` : ''}`, detail: { ai_draft_id: draftId, share_id: share?.id ?? null } })
  return share ?? null
}

// ── Bind ────────────────────────────────────────────────────────────────────────────────────

/**
 * The client chose a quote (read from their email, or a broker pressed Client chose). Drafts
 * the confirmation to that insurer for a person to send; sending it binds the policy. A
 * rate-table price has nobody to confirm with, so it is bound at once.
 */
export async function recordPick(quoteId: string, actor: string, opts: { messageId?: string | null; threadId?: string | null } = {}): Promise<{ draftId: string | null; bound: boolean }> {
  const [q] = await store.rows<PlacementQuote>(`placement_quotes?id=eq.${quoteId}&limit=1`)
  if (!q) throw new Error('Quote not found')
  const bundle = await store.loadPlacement(q.placement_id)
  const p = bundle?.placements[0]
  const pos = bundle ? derivePositions(bundle).find(x => x.line.id === q.line_id) : null
  if (!bundle || !p || !pos) throw new Error('Placement not found')
  const line = pos.line
  const base = { company_id: p.company_id, placement_id: p.id, line_id: line.id, round_id: q.round_id, dispatch_id: q.dispatch_id, thread_id: opts.threadId ?? null, message_id: opts.messageId ?? null }
  const at = now()
  const option = optionLabel(pos, q)
  const by = actor === 'agent' ? 'Client chose (read from their email)' : 'Client chose'

  if (!q.dispatch_id && actor === 'agent') {
    // A rate-table price has no insurer email to send; binding it is left to a person.
    await store.patch('placement_lines', `id=eq.${line.id}`, { picked_quote_id: q.id, client_confirmed_at: at, next_step: `Client chose ${q.insurer_name} (${option}) — press Client chose on the grid to bind it` })
    await store.log({ ...base, kind: 'decision', actor, text: `${by} ${q.insurer_name} (${option}) on ${line.label ?? line.product_line}; rate-table price, waiting for a broker to bind`, detail: { quote_id: q.id, acted: false } })
    return { draftId: null, bound: false }
  }
  if (!q.dispatch_id) {
    await bindQuote(line, q, actor)
    await store.patch('placement_lines', `id=eq.${line.id}`, { picked_quote_id: q.id, client_confirmed_at: at, next_step: `Bound with ${q.insurer_name} — issue the debit note` })
    await store.log({ ...base, kind: 'decision', actor, text: `${by} ${q.insurer_name} (${option}) on ${line.label ?? line.product_line}; rate-table price, bound`, detail: { quote_id: q.id } })
    return { draftId: null, bound: true }
  }
  const d = bundle.dispatches.find(x => x.id === q.dispatch_id)
  if (!d) throw new Error('The request behind this quote is missing')
  const company = await store.company(p.company_id)
  const contact = d.insurer_contact_id ? await store.sbTryContact(d.insurer_contact_id) : null
  const text = await agent.draftInsurerConfirmation({
    insurerName: d.insurer_name, product: d.insurer_product_name ?? null, contactName: contact?.name ?? null, clientName: company?.company_name ?? 'our client',
    lineLabel: line.label ?? line.product_line, option, premium: q.premium_text, perHead: q.premium_per_head_text ?? null, limit: q.limit_text, excess: q.excess_text,
    validity: q.validity_text, subjectivities: q.subjectivities, spec: pos.round?.spec ?? line.spec, inceptionDate: p.inception_date,
  })
  const draft = text && d.insurer_contact_id
    ? await store.createDraft({ contact_id: d.insurer_contact_id, to_email: d.to_email, subject: withRef(text.subject, p.ref), body: text.body, thread_id: d.thread_id, email_type: DRAFT_TYPE.confirm })
    : null
  await store.patch('placement_lines', `id=eq.${line.id}`, {
    picked_quote_id: q.id, client_confirmed_at: at, confirm_draft_id: draft?.id ?? null, confirm_sent_at: null, insurer_confirmed_at: null,
    next_step: draft ? `Client chose ${d.insurer_name} (${option}) — check and send the confirmation` : `Client chose ${d.insurer_name} (${option}) — confirm it with the insurer`,
  })
  await store.log({ ...base, kind: 'decision', actor, text: `${by} ${d.insurer_name} (${option}) on ${line.label ?? line.product_line}${draft ? '; confirmation to the insurer drafted — awaiting approval' : '; the agent could not draft the confirmation'}`,
    detail: { quote_id: q.id, ai_draft_id: draft?.id ?? null } })
  return { draftId: draft?.id ?? null, bound: false }
}

/** The policy is bound to the quote; without a policy row the quote and line are marked directly. */
async function bindQuote(line: PlacementLine, q: PlacementQuote, actor: string): Promise<void> {
  if (line.policy_id) { await choosePolicyQuote(line.policy_id, q.id, actor); return }
  await store.patchNoTs('placement_quotes', `id=eq.${q.id}`, { status: 'selected' })
  await store.patchNoTs('placement_quotes', `line_id=eq.${q.line_id}&id=neq.${q.id}&status=neq.superseded`, { status: 'not_chosen' })
  await store.patch('placement_lines', `id=eq.${line.id}`, { status: 'bound' })
}

/** After the confirmation to the insurer is sent: the policy is bound and the line waits on the insurer. */
export async function markConfirmSent(draftId: string, sent: SentFacts): Promise<PlacementLine | null> {
  const [line] = await store.rows<PlacementLine>(`placement_lines?confirm_draft_id=eq.${draftId}&limit=1`)
  if (!line?.picked_quote_id) return null
  const [q] = await store.rows<PlacementQuote>(`placement_quotes?id=eq.${line.picked_quote_id}&limit=1`)
  if (!q) return null
  const [p] = await store.rows<Placement>(`placements?id=eq.${line.placement_id}&limit=1`)
  await bindQuote(line, q, sent.actor)
  const at = now()
  const [updated] = await store.patch<PlacementLine>('placement_lines', `id=eq.${line.id}`, { confirm_sent_at: at, next_step: `Confirmation sent to ${q.insurer_name} — waiting for them to confirm cover` })
  if (q.dispatch_id) await store.patch('placement_dispatches', `id=eq.${q.dispatch_id}`, { last_outbound_at: at, ...(sent.gmailThreadId ? { gmail_thread_id: sent.gmailThreadId } : {}) })
  if (p) await store.log({ company_id: p.company_id, placement_id: p.id, line_id: line.id, dispatch_id: q.dispatch_id, kind: 'sent', actor: sent.actor,
    text: `Confirmation sent to ${q.insurer_name}${sent.fromEmail ? ` from ${sent.fromEmail}` : ''}; ${line.label ?? line.product_line} bound`, detail: { ai_draft_id: draftId, quote_id: q.id } })
  return updated ?? null
}

/** The insurer confirmed cover: record it, take the policy number if given, and point at the debit note. */
type LogBase = { company_id: string; placement_id: string; line_id: string; round_id: string; dispatch_id: string; thread_id: string | null; message_id: string }
async function confirmFromInsurer(line: PlacementLine, d: PlacementDispatch, policyNumber: string | null, summary: string, base: LogBase, via: string): Promise<void> {
  const at = now()
  await store.patch('placement_lines', `id=eq.${line.id}`, { insurer_confirmed_at: at, next_step: `${d.insurer_name} confirmed cover — issue the debit note` })
  await store.patch('placement_dispatches', `id=eq.${d.id}`, { last_inbound_at: at, next_chase_at: null })
  if (policyNumber && line.policy_id) await store.patchNoTs('policies', `id=eq.${line.policy_id}&policy_number=is.null`, { policy_number: policyNumber, updated_at: at })
  await store.log({ ...base, kind: 'decision', text: `${d.insurer_name} confirmed cover on ${line.label ?? line.product_line}${via}${policyNumber ? ` (policy ${policyNumber})` : ''}: ${summary}`, detail: { policy_number: policyNumber } })
}

/** The drafts waiting on a person for this placement: requests, chases and the client email. */
export async function reviewQueue(placementId: string): Promise<{ draft: store.DraftRow; dispatches: PlacementDispatch[]; kind: 'request' | 'chase' | 'tier' | 'client' | 'confirm' | 'letter' }[]> {
  const bundle = await store.loadPlacement(placementId)
  if (!bundle) return []
  const dispatchDraftIds = [...new Set(bundle.dispatches.filter(d => d.ai_draft_id && d.status === 'drafted').map(d => d.ai_draft_id!))]
  const logDraftIds = bundle.log.flatMap(e => {
    if ((e.kind === 'chase' || e.kind === 'decision') && typeof e.detail?.ai_draft_id === 'string') return [e.detail.ai_draft_id as string]
    if (e.kind === 'ask' && Array.isArray(e.detail?.ai_draft_ids)) return (e.detail.ai_draft_ids as unknown[]).filter((x): x is string => typeof x === 'string')
    return []
  })
  const drafts = (await store.pendingDrafts([...new Set([...dispatchDraftIds, ...logDraftIds])])).filter(d => d.status === 'pending')
  return drafts.map(draft => ({
    draft,
    dispatches: bundle.dispatches.filter(d => d.ai_draft_id === draft.id),
    kind: draft.email_type === DRAFT_TYPE.client ? 'client' : draft.email_type === DRAFT_TYPE.confirm ? 'confirm' : draft.email_type === DRAFT_TYPE.chase ? 'chase' : draft.email_type === DRAFT_TYPE.tier ? 'tier' : draft.email_type === 'APPOINTMENT_LETTER' ? 'letter' : 'request',
  }))
}

export { DRAFT_TYPE }
