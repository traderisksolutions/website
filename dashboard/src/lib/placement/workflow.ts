/**
 * The placement loop, step by step. Each function does one thing the broker or the ingest asks
 * for, writes its rows, and leaves a line in the company memory. Drafts land in ai_drafts as
 * `pending`; a person approves and sends them from the review screen. Nothing here sends.
 */
import { productLineLabel } from '@/lib/product-lines'
import { createQuotingPolicy } from '@/lib/policies/spine'
import { handlePolicyInbound } from '@/lib/policies/inbound'
import { describeChanges, normaliseSpec, specDiff } from './spec'
import { derivePositions, nextChaseAt } from './position'
import * as store from './store'
import * as agent from './agent'
import { cloneRows, pairClones, type FanoutClone, type FanoutText } from './fanout'
import type { Placement, PlacementDispatch, PlacementLine, PlacementRound, RoundReason, Spec } from './types'

const now = () => new Date().toISOString()
const DRAFT_TYPE = { dispatch: 'PLACEMENT_REQUEST', chase: 'PLACEMENT_CHASE', client: 'PLACEMENT_CLIENT' } as const
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
  const msgs = await store.threadMessages(threadId)
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
    const text = await agent.draftToInsurer({
      insurerName: null, contactName: null, clientName: company?.company_name ?? 'the client',
      lines: [{ label: a.line.label ?? productLineLabel(a.line.product_line), productLine: a.line.product_line, spec: a.spec }],
      roundNo: round.round_no, changeSummary: a.change_summary, previousPremium: null, inceptionDate: placement.inception_date, memory,
    })
    let draftId: string | null = null
    if (text) {
      const body = opts.extraBody?.trim() ? `${text.body}\n\n${opts.extraBody.trim()}` : text.body
      // The shared draft is addressed to the first recipient; fanoutDraft re-addresses a clone per dispatch.
      const draft = await store.createDraft({ contact_id: recipients[0].contact_id, to_email: recipients[0].email, subject: text.subject, body, email_type: DRAFT_TYPE.dispatch })
      draftId = draft?.id ?? null
      if (draftId) drafts++
    }
    const rows = await store.insert<PlacementDispatch>('placement_dispatches', recipients.map(r => ({
      placement_id: placement.id, line_id: a.line.id, round_id: round.id, company_id: placement.company_id,
      insurer_company_id: r.insurer_company_id, insurer_name: r.insurer_name, insurer_contact_id: r.contact_id, to_email: r.email,
      ai_draft_id: draftId, status: 'drafted',
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

/** After a person sends a dispatch draft: link the Gmail thread, start the chase clock, log it. */
export async function markSent(draftId: string, sent: { gmailThreadId: string | null; gmailMessageId: string | null; actor: string }): Promise<PlacementDispatch[]> {
  const ds = await store.dispatchesForDraft(draftId)
  if (ds.length === 0) return []
  const t = sent.gmailThreadId ? await store.threadByGmailId(sent.gmailThreadId) : null
  const placement = (await store.loadPlacement(ds[0].placement_id))?.placements[0]
  // The thread the send route made carries no company; file it under the CLIENT so it shows on their Threads tab.
  if (t && !t.company_id && placement) await store.patchNoTs('email_threads', `id=eq.${t.id}`, { company_id: placement.company_id })
  const at = now()
  const updated = await store.patch<PlacementDispatch>('placement_dispatches', `ai_draft_id=eq.${draftId}`, {
    status: 'sent', sent_at: at, last_outbound_at: at, next_chase_at: nextChaseAt(new Date(), 0).toISOString(),
    gmail_thread_id: sent.gmailThreadId, thread_id: t?.id ?? null,
  })
  for (const d of updated) {
    await store.patch('placement_lines', `id=eq.${d.line_id}`, { next_step: 'Waiting for the insurers to quote' })
    await store.log({ company_id: d.company_id, placement_id: d.placement_id, line_id: d.line_id, round_id: d.round_id, dispatch_id: d.id, kind: 'sent', actor: sent.actor,
      text: `Request sent to ${d.insurer_name} (${d.to_email})`, thread_id: t?.id ?? null })
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
  const dispatch = await store.dispatchForThread(input.thread_id, input.gmail_thread_id)
  if (dispatch) {
    if (!dispatch.thread_id) await store.patch('placement_dispatches', `id=eq.${dispatch.id}`, { thread_id: input.thread_id })
    if (input.direction === 'outbound') {
      await store.patch('placement_dispatches', `id=eq.${dispatch.id}`, { last_outbound_at: now() })
      return { handled: 'insurer', detail: 'outbound noted' }
    }
    return handleInsurerReply(dispatch, input.message_id, input.thread_id)
  }
  const placement = await store.placementForClientThread(input.thread_id)
  if (placement && input.direction === 'inbound') return handleClientReply(placement, input.message_id, input.thread_id)
  return handlePolicyInbound(input)
}

async function handleInsurerReply(d: PlacementDispatch, messageId: string, threadId: string): Promise<InboundResult> {
  const msg = await store.message(messageId)
  if (!msg) return { handled: 'insurer', detail: 'message missing' }
  const bundle = await store.loadPlacement(d.placement_id)
  const line = bundle?.lines.find(l => l.id === d.line_id)
  const round = bundle?.rounds.find(r => r.id === d.round_id)
  const atts = await store.attachmentsFor(messageId, !!msg.has_attachments)
  const read = await agent.readInsurerReply(msg, atts, { insurerName: d.insurer_name, lineLabel: line?.label ?? d.insurer_name, spec: round?.spec ?? {}, roundNo: round?.round_no ?? 1 })
  const at = now()
  const base = { company_id: d.company_id, placement_id: d.placement_id, line_id: d.line_id, round_id: d.round_id, dispatch_id: d.id, thread_id: threadId, message_id: messageId }
  if (!read) {
    await store.patch('placement_dispatches', `id=eq.${d.id}`, { last_inbound_at: at })
    await store.log({ ...base, kind: 'reply', actor: 'system', text: `${d.insurer_name} replied; the agent could not read it. Open the thread.` })
    return { handled: 'insurer', detail: 'unread' }
  }
  if (read.kind === 'quote' && read.quote) {
    await store.patchNoTs('placement_quotes', `dispatch_id=eq.${d.id}&status=eq.received`, { status: 'superseded' })
    const q = read.quote
    const norm = agent.quoteFields(q)
    await store.insert('placement_quotes', {
      placement_id: d.placement_id, line_id: d.line_id, round_id: d.round_id, dispatch_id: d.id, insurer_name: d.insurer_name,
      premium_text: q.premium, limit_text: q.limit, excess_text: q.excess, validity_text: q.validity, valid_until: q.valid_until,
      key_terms: q.key_terms, exclusions: q.exclusions, subjectivities: q.subjectivities, summary: read.summary, evidence: q.evidence,
      source_message_id: messageId, thread_id: threadId, extracted_by: 'placement', ...norm,
    })
    await store.patch('placement_dispatches', `id=eq.${d.id}`, { status: 'quoted', last_inbound_at: at, next_chase_at: null })
    await store.log({ ...base, kind: 'quote', text: `${d.insurer_name} quoted ${q.premium ?? 'a premium not stated'}${q.limit ? ` for ${q.limit}` : ''}${q.validity ? `, valid ${q.validity}` : ''}${norm.needs_review ? ' — check the figure against the source' : ''}` })
  } else if (read.kind === 'decline') {
    await store.patch('placement_dispatches', `id=eq.${d.id}`, { status: 'declined', last_inbound_at: at, next_chase_at: null })
    await store.log({ ...base, kind: 'declined', text: `${d.insurer_name} declined: ${read.summary}` })
  } else if (read.kind === 'info_request') {
    await store.patch('placement_dispatches', `id=eq.${d.id}`, { status: 'info_requested', last_inbound_at: at, next_chase_at: null })
    await store.patch('placement_lines', `id=eq.${d.line_id}`, { next_step: `${d.insurer_name} needs: ${read.questions.join('; ') || read.summary}` })
    await store.log({ ...base, kind: 'ask', text: `${d.insurer_name} asked: ${read.questions.join('; ') || read.summary}`, detail: { questions: read.questions } })
  } else {
    const st = read.kind === 'acknowledgement' ? 'acknowledged' : d.status
    await store.patch('placement_dispatches', `id=eq.${d.id}`, { status: st, last_inbound_at: at, next_chase_at: nextChaseAt(new Date(), d.chase_count).toISOString() })
    await store.log({ ...base, kind: 'reply', text: `${d.insurer_name}: ${read.summary}` })
  }
  // Every line answered → the line is quoted and the next step is the client.
  const fresh = await store.loadPlacement(d.placement_id)
  if (fresh) {
    const pos = derivePositions(fresh).find(p => p.line.id === d.line_id)
    if (pos?.allAnswered) await store.patch('placement_lines', `id=eq.${d.line_id}`, { status: 'quoted', next_step: 'All insurers have answered — send the comparison to the client' })
  }
  return { handled: 'insurer', detail: read.kind }
}

async function handleClientReply(p: Placement, messageId: string, threadId: string): Promise<InboundResult> {
  const msg = await store.message(messageId)
  const bundle = await store.loadPlacement(p.id)
  if (!msg || !bundle) return { handled: 'client', detail: 'missing' }
  const atts = await store.attachmentsFor(messageId, !!msg.has_attachments)
  const positions = derivePositions(bundle)
  const read = await agent.readClientReply(msg, atts, {
    lines: positions.map(x => ({ label: x.line.label ?? x.line.product_line, spec: x.round?.spec ?? x.line.spec, bestPremium: x.best?.premium_text ?? null })),
    memory: agent.memoryLines(bundle.log),
  })
  const base = { company_id: p.company_id, placement_id: p.id, thread_id: threadId, message_id: messageId }
  if (!read) { await store.log({ ...base, kind: 'reply', actor: 'system', text: 'Client replied; the agent could not read it. Open the thread.' }); return { handled: 'client', detail: 'unread' } }
  if (read.kind === 'change' && read.changes.length) {
    for (const c of read.changes) {
      const pos = positions.find(x => (x.line.label ?? x.line.product_line).toLowerCase() === c.line_label.toLowerCase())
      const prev = pos?.round?.spec ?? pos?.line.spec ?? {}
      const summary = pos ? describeChanges(specDiff(prev, c.spec)) : `New line asked for: ${c.line_label}`
      await store.log({ ...base, line_id: pos?.line.id ?? null, kind: 'change', text: `Client asks for a change${pos ? ` on ${pos.line.label}` : ''}: ${summary || read.summary}`,
        detail: { acted: false, spec: c.spec, line_label: c.line_label, summary: read.summary } })
      if (pos) await store.patch('placement_lines', `id=eq.${pos.line.id}`, { next_step: `Client change to confirm: ${summary || read.summary}` })
    }
  } else if (read.kind === 'acceptance') {
    await store.log({ ...base, kind: 'decision', text: `Client wants to proceed: ${read.summary}` })
  } else {
    await store.log({ ...base, kind: read.kind === 'question' ? 'ask' : 'reply', text: `Client: ${read.summary}` })
  }
  return { handled: 'client', detail: read.kind }
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
    const draft = await store.createDraft({ contact_id: d.insurer_contact_id, to_email: d.to_email, subject: `Follow-up: quotation request — ${company?.company_name ?? ''}`.trim(), body, thread_id: d.thread_id, email_type: DRAFT_TYPE.chase })
    if (!draft) { skipped++; continue }
    await store.patch('placement_dispatches', `id=eq.${d.id}`, { chase_count: d.chase_count + 1, next_chase_at: nextChaseAt(nowDate, d.chase_count + 1).toISOString() })
    await store.log({ company_id: d.company_id, placement_id: d.placement_id, line_id: d.line_id, round_id: d.round_id, dispatch_id: d.id, kind: 'chase',
      text: `Chase ${d.chase_count + 1} drafted for ${d.insurer_name} — awaiting approval`, detail: { ai_draft_id: draft.id }, thread_id: d.thread_id })
    drafted++
  }
  return { drafted, skipped }
}

// ── Client summary ──────────────────────────────────────────────────────────────────────────

export async function draftClientSummary(placementId: string, actor: string): Promise<{ draftId: string } | null> {
  const bundle = await store.loadPlacement(placementId)
  const p = bundle?.placements[0]
  if (!bundle || !p) return null
  const company = await store.company(p.company_id)
  const positions = derivePositions(bundle)
  const contact = p.client_contact_id ? (await store.sbTryContact(p.client_contact_id)) : null
  const text = await agent.draftClientSummary({
    clientName: company?.company_name ?? 'the client', contactName: contact?.name ?? null, placementTitle: p.title,
    lines: positions.map(x => ({
      label: x.line.label ?? x.line.product_line, spec: x.round?.spec ?? x.line.spec, roundNo: x.roundNo,
      quotes: x.dispatches.filter(d => d.quote && !d.expired).map(d => ({ insurer: d.dispatch.insurer_name, premium: d.quote!.premium_text, limit: d.quote!.limit_text, excess: d.quote!.excess_text, validity: d.quote!.validity_text, subjectivities: d.quote!.subjectivities, exclusions: d.quote!.exclusions })),
      declined: x.dispatches.filter(d => d.dispatch.status === 'declined').map(d => d.dispatch.insurer_name),
      awaiting: x.dispatches.filter(d => !d.quote && d.dispatch.status !== 'declined' && d.dispatch.status !== 'withdrawn').map(d => d.dispatch.insurer_name),
    })),
    memory: agent.memoryLines(bundle.log),
  })
  if (!text) return null
  const to = contact?.email ?? null
  if (!to || !p.client_contact_id) {
    await store.log({ company_id: p.company_id, placement_id: p.id, kind: 'info', actor: 'system', text: 'No client contact on the placement — set the client thread, then draft again.' })
    return null
  }
  const draft = await store.createDraft({ contact_id: p.client_contact_id, to_email: to, subject: text.subject, body: text.body, thread_id: p.client_thread_id, email_type: DRAFT_TYPE.client })
  if (!draft) return null
  await store.patchNoTs('placements', `id=eq.${p.id}`, { status: 'presented', updated_at: now() })
  for (const x of positions) await store.patch('placement_lines', `id=eq.${x.line.id}`, { status: 'presented', next_step: 'Comparison drafted — approve and send to the client' })
  await store.log({ company_id: p.company_id, placement_id: p.id, kind: 'decision', actor, text: `Comparison to the client drafted (${positions.reduce((n, x) => n + x.quotedCount, 0)} quotes) — awaiting approval`, detail: { ai_draft_id: draft.id } })
  return { draftId: draft.id }
}

/** The drafts waiting on a person for this placement: requests, chases and the client email. */
export async function reviewQueue(placementId: string): Promise<{ draft: store.DraftRow; dispatches: PlacementDispatch[]; kind: 'request' | 'chase' | 'client' }[]> {
  const bundle = await store.loadPlacement(placementId)
  if (!bundle) return []
  const dispatchDraftIds = [...new Set(bundle.dispatches.filter(d => d.ai_draft_id && d.status === 'drafted').map(d => d.ai_draft_id!))]
  const logDraftIds = bundle.log.filter(e => (e.kind === 'chase' || e.kind === 'decision') && typeof e.detail?.ai_draft_id === 'string').map(e => e.detail.ai_draft_id as string)
  const drafts = (await store.pendingDrafts([...new Set([...dispatchDraftIds, ...logDraftIds])])).filter(d => d.status === 'pending')
  return drafts.map(draft => ({
    draft,
    dispatches: bundle.dispatches.filter(d => d.ai_draft_id === draft.id),
    kind: draft.email_type === DRAFT_TYPE.client ? 'client' : draft.email_type === DRAFT_TYPE.chase ? 'chase' : 'request',
  }))
}

export { DRAFT_TYPE }
