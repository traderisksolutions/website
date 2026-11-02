/**
 * The relay agent: one job, decide the onward email for an inbound message on a case, and put it
 * on the case as a draft for a person to approve. Client ↔ TRS ↔ insurer, every case type.
 *
 *   relay · message   {message_id, work_item_id?, thread_id}   enqueued by intake once a message
 *                     sits on a case (or by the case reader once it has put the thread on one)
 *
 * Intent comes from relay/intent.ts (rules on the message's own words and files). Only when no
 * rule fires is a model asked, and it may say nothing. The drafts are composed by relay/compose.ts
 * and stored by the drafter's storeDraft, so they show in Today like every other draft; a matter
 * with two parties gets both emails under one pair_id. Endorsements and billing notes are handed
 * on; claims forwards stay with the claims agent. Nothing here sends.
 */
import { randomUUID } from 'node:crypto'
import { sb, sbTry, enc, bareEmail, emailDomain, isInternal, isAutomated } from '@/lib/crm/db'
import { latestText } from '@/lib/nexus/reader'
import { callGemini } from '@/lib/ai-call'
import { GEMINI_LITE } from '@/lib/gemini-models'
import { listProducts } from '@/lib/insurer-products'
import { displayName } from '@/lib/insurers'
import { PRODUCT_LINES } from '@/lib/product-lines'
import { enqueue, skip, askHuman, type AgentTask } from '@/lib/agent-tasks/queue'
import { getGroupFacts } from '@/lib/admin/a/knowledge'
import { depositEvent } from '@/lib/admin/k/deposit'
import { loadCaseData, toCaseMail, scopedContacts, insurerLastHandler, insurerClaimsDesk, type CaseData, type CaseMessage } from '../data'
import { routeRecipients, OPERATIONS, type Route } from '../router'
import { greetingFor } from '../contact-id'
import { isSignatureImage, leadInsurer } from './compose'
import { storeDraft } from '../drafter'
import { buildDraft } from '../drafts'
import { caseModeFor } from '../kinds'
import { detectIntent, detectLine, listedAsks, ownWords, type IntentResult, type RelayIntent, type RelaySide } from './intent'
import { extractQuoteTerms, missingForQuote } from './terms'
import { composeRelay, relayPairFor, CLASS_OF, PARTY_OF, type RelayKind, type RelayFacts } from './compose'
import { syncRegister, markRequested } from '../documents/store'
import { missingLines } from '../documents/gate'
import { isBrokerBlock } from '@/lib/letters/appointment'
import { explain } from '@/lib/admin/a/explanations'
import { dispatchForThread, placementForClientThread } from '@/lib/placement/store'
import { prepareUndertaking } from '@/lib/letters/undertaking-server'
import { renderAppointmentPdf, buildAppointmentDocx } from '@/lib/letters/appointment-server'
import { letterFileName, letterProblems } from '@/lib/letters/appointment'
import { fileDocument } from '@/lib/documents/ingest'
import * as docs from '@/lib/documents/store'

type Row = Record<string, any>
const ACTOR = 'relay'
const INTENTS: RelayIntent[] = ['quote_request', 'claim_notify', 'change_request', 'cover_question', 'document_request', 'docs_provided', 'instruction', 'client_chase', 'thanks', 'quote_received', 'decline', 'documents_received', 'insurer_note', 'claim_decision', 'market_question', 'market_ack', 'market_chase', 'none']
const lineLabel = (slug: string | null) => PRODUCT_LINES.find(l => l.slug === slug)?.label ?? null

type Attachment = { filename: string; mime_type: string | null; storage_url: string | null; message_id: string }

/** A relay-logged event on the case, also deposited into the company ledger. */
export async function relayEvent(workItemId: string, detail: Row): Promise<string | null> {
  const [row] = await sbTry<Row[]>('work_item_events', [], { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ work_item_id: workItemId, kind: 'relay', actor: ACTOR, detail }) })
  if (row?.id) await depositEvent('work_item_events', row.id).catch(() => 0)
  return row?.id ?? null
}

/** Partner brokers and TPAs write from the market side; everyone else outside TRS is the client. */
export async function senderSide(from: string, insurerDomains: Set<string>): Promise<RelaySide | 'trs' | 'automated'> {
  if (isInternal(from)) return 'trs'
  if (isAutomated(from)) return 'automated'
  const d = emailDomain(from)
  if (insurerDomains.has(d)) return 'market'
  const [co] = await sbTry<Row[]>(`companies?domains=cs.{${enc(d)}}&select=kind&limit=1`, [])
  return co?.kind === 'partner' || co?.kind === 'tpa' ? 'market' : 'client'
}

/** When no rule fires, the model may name the intent; any failure or an unknown answer is "none". */
async function classifyWithModel(side: RelaySide, subject: string | null, text: string, companyId: string | null): Promise<RelayIntent> {
  const allowed = INTENTS.filter(i => side === 'client' ? !/^(quote_received|decline|documents_received|insurer_note|claim_decision|market_)/.test(i) : /^(quote_received|decline|documents_received|insurer_note|claim_decision|market_|none)/.test(i))
  const r = await callGemini({
    agent: 'admin', feature: 'admin_relay', model: GEMINI_LITE, json: true, maxOutputTokens: 300, thinkingShare: 0, temperature: 0,
    system: `You classify one email ${side === 'client' ? 'from a client to' : 'from an insurer or partner broker to'} a Singapore insurance broker. Answer JSON only: {"intent": one of ${allowed.join(', ')}}. Choose "none" unless the email clearly asks for or delivers one of these.`,
    parts: [{ text: `SUBJECT: ${subject ?? ''}\n\n${text.slice(0, 4000)}` }], metadata: { company_id: companyId },
  }).catch(() => ({ text: null }))
  try { const j = JSON.parse(r.text ?? '{}'); return allowed.includes(j.intent) ? j.intent : 'none' } catch { return 'none' }
}

/** Up to n insurer desks that write the line, one address each; the case's insurer first when it has one. */
export async function desksForLine(line: string, preferInsurer: string | null, n = 3): Promise<{ insurer: string; email: string; name: string | null }[]> {
  const products = await listProducts({ productLines: [line], activeOnly: true })
  const byInsurer = new Map<string, { insurer: string; email: string; name: string | null }>()
  for (const p of products) {
    if (byInsurer.has(p.insurer_company_id)) continue
    const c = p.contacts.find(x => x.is_default) ?? p.contacts[0]
    if (c?.email) byInsurer.set(p.insurer_company_id, { insurer: p.insurer_name, email: c.email, name: c.name })
  }
  const all = Array.from(byInsurer.values())
  const pref = preferInsurer ? preferInsurer.toLowerCase().split(/\s+/)[0] : null
  all.sort((a, b) => Number(!!pref && b.insurer.toLowerCase().includes(pref)) - Number(!!pref && a.insurer.toLowerCase().includes(pref)))
  return all.slice(0, n)
}


async function route(side: 'client' | 'insurer', d: CaseData, line: string | null, opts: { newToInsurer?: boolean } = {}): Promise<Route> {
  const company = d.item.company_id as string | null
  const insurer = d.item.insurer_name ?? null
  const scope = d.item.case_type === 'claim' ? 'claims' : line ?? 'accounts'
  let desk: string[] = []
  if (side === 'insurer' && insurer) desk = await insurerClaimsDesk(insurer, line)
  return routeRecipients({
    side, scope,
    messages: opts.newToInsurer ? toCaseMail(d).filter(m => m.side !== 'insurer') : toCaseMail(d),
    clientContacts: await scopedContacts(company), groupContacts: d.company?.parent_id ? await scopedContacts(d.company.parent_id) : [],
    insurerDesk: desk, insurerLastHandler: side === 'insurer' && !desk.length ? await insurerLastHandler(insurer, scope) : null,
    insurerDomains: d.insurerDomains, otherDomains: d.otherDomains, departed: d.departed, owner: d.item.owner_email ?? null,
  })
}

type Made = { kind: RelayKind; draftId: string; to: string[] }

/**
 * The letters the binding gate asks for, generated from the case and filed in the data room:
 * the letter of undertaking when cover is backdated, the appointment letter when another broker
 * is on risk. Returned as attachments for the ask. A letter that cannot be filled is left out.
 */
async function lettersFor(d: CaseData, missing: string[], ctx: { insurerName: string | null; line: string | null; policy: Row | null; today: string; clientName: string }): Promise<Attachment[]> {
  const out: Attachment[] = []
  const insurer = ctx.insurerName ? (await sbTry<Row[]>(`companies?kind=eq.insurer&company_name=ilike.*${enc(ctx.insurerName.split(' ')[0])}*&select=company_name,address&limit=1`, []))[0] ?? null : null
  const title = d.item.title as string
  if (missing.includes('lou_nil_claims') && ctx.policy?.start_date && ctx.insurerName && d.item.company_id) {
    const period = ctx.policy.start_date && ctx.policy.end_date ? `${fmtLong(ctx.policy.start_date)} to ${fmtLong(ctx.policy.end_date)}` : `from ${fmtLong(ctx.policy.start_date)}`
    const r = await prepareUndertaking(d.item.company_id, {
      clientName: ctx.clientName, insurerName: insurer?.company_name ?? ctx.insurerName, insurerAddress: insurer?.address ? String(insurer.address).split(/\n|, /) : null,
      classOfPolicy: lineLabel(ctx.line) ?? ctx.policy.class_of_insurance ?? ctx.policy.product_line ?? 'the policy', projectTitle: title, projectPeriod: period,
      startDate: ctx.policy.start_date, date: ctx.today,
    })
    out.push(...r.attachments.map(a => ({ filename: a.filename, mime_type: a.mime_type, storage_url: a.storage_url, message_id: a.message_id })))
  }
  if (missing.includes('broker_appointment') && d.item.company_id) {
    const letter = { clientName: ctx.clientName, projectTitle: title, programme: `${lineLabel(ctx.line) ?? 'insurance'} programme`, date: ctx.today }
    if (!letterProblems(letter).length) {
      const [pdf, docx] = await Promise.all([renderAppointmentPdf(letter), buildAppointmentDocx(letter)])
      const now = new Date().toISOString()
      for (const [format, bytes, mime] of [['pdf', pdf, 'application/pdf'], ['docx', docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']] as const) {
        const filename = letterFileName(letter, format)
        const row = await docs.insertDocument({ company_id: d.item.company_id, policy_id: null, doc_type: 'broker_appointment', title: `Appointment letter to sign · ${title}`.slice(0, 120), filename, mime_type: mime, size_bytes: bytes.length, source: 'generated', received_at: now, classified_by: 'broker', confidence: 1, needs_review: false, status: 'unfiled', uploaded_by: ACTOR })
        if (!row) continue
        const filed = await fileDocument(row, bytes)
        if (filed.drive_file_id) out.push({ filename, mime_type: mime, storage_url: `drivefile:${filed.drive_file_id}`, message_id: '' })
      }
    }
  }
  return out
}
const fmtLong = (iso: string) => { const dt = new Date(iso.slice(0, 10) + 'T00:00:00Z'); return Number.isNaN(dt.getTime()) ? iso : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) }

export async function handleRelay(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  if (task.kind !== 'message') { await skip(task.id, `unknown kind ${task.kind}`); return 'handled' }
  const messageId = String(task.payload?.message_id ?? task.message_id ?? '')
  const [msg] = await sbTry<Row[]>(`email_messages?id=eq.${enc(messageId)}&select=id,thread_id,direction,from_address,subject,body_text,sent_at&limit=1`, [])
  if (!msg) { await skip(task.id, 'message not found'); return 'handled' }
  // A thread the placement module sent a request on, or the client thread of an open placement,
  // is answered by that module: one reader, one draft.
  if (await dispatchForThread(msg.thread_id, null) || await placementForClientThread(msg.thread_id)) { await skip(task.id, 'placement module owns this thread'); return 'handled' }
  let workItemId = (task.payload?.work_item_id ?? task.work_item_id ?? null) as string | null
  if (!workItemId) {
    const [l] = await sbTry<Row[]>(`work_item_threads?thread_id=eq.${enc(msg.thread_id)}&select=work_item_id&limit=1`, [])
    workItemId = l?.work_item_id ?? null
  }
  if (!workItemId) { await skip(task.id, 'no case yet'); return 'handled' }
  const d = await loadCaseData(workItemId)
  if (!d) { await skip(task.id, 'work item gone'); return 'handled' }
  if (d.item.closed_at) { await skip(task.id, 'work item closed'); return 'handled' }
  const mode = caseModeFor(d.company?.kind ?? (await sbTry<Row[]>(`companies?id=eq.${enc(d.item.company_id ?? '')}&select=kind&limit=1`, []))[0]?.kind)
  if (mode === 'none') { await skip(task.id, 'not a client case'); return 'handled' }
  // A partner broker's own correspondence has no client and no insurer to relay between.
  if (mode === 'partner') { await skip(task.id, 'partner case: nothing to relay'); return 'handled' }

  const from = bareEmail(msg.from_address)
  const side = await senderSide(from, new Set(d.insurerDomains))
  if (side === 'trs' || side === 'automated') { await skip(task.id, `${side} sender`); return 'handled' }
  const text = ownWords(latestText(msg.body_text, 6000))
  const files = d.files.filter(f => f.message_id === msg.id && !isSignatureImage(f.filename, f.mime_type))
  let r: IntentResult = detectIntent({ side, subject: msg.subject, text, files: files.map(f => f.filename), caseType: d.item.case_type })
  let via: 'rule' | 'model' = 'rule'
  if ((r.intent === 'none' || r.confidence === 'low') && r.words >= 12) {
    const m = await classifyWithModel(side, msg.subject, text, d.item.company_id)
    if (m !== 'none') { r = { ...r, intent: m, confidence: 'medium', cues: [...r.cues, 'model'] }; via = 'model' }
  }
  const day = String(msg.sent_at ?? new Date().toISOString()).slice(0, 10)
  const intent = r.intent
  const insurerName = d.item.insurer_name ? displayName(leadInsurer(d.item.insurer_name)) : null
  const policy = d.policies.find(p => p.id === d.item.policy_id) ?? null
  const line = detectLine(`${msg.subject ?? ''}\n${text}`, policy?.product_line ?? null)
  const fromThread = d.threads.find(t => t.id === msg.thread_id)
  const attachments: Attachment[] = files.map(f => ({ filename: f.filename, mime_type: f.mime_type, storage_url: f.storage_url, message_id: f.message_id }))
  const original = { from, sent_at: msg.sent_at ?? null, subject: fromThread?.subject ?? msg.subject ?? null, text }
  const base = (): RelayFacts => ({
    greetingName: null, clientName: d.company?.company_name ?? d.item.client_name ?? null, insurerName, lineLabel: lineLabel(line),
    policyNumber: policy?.policy_number ?? d.item.policy_number ?? null, className: policy?.class_of_insurance ?? policy?.product_line ?? null,
    periodFrom: policy?.start_date ?? null, periodTo: policy?.end_date ?? null, threadSubject: fromThread?.subject ?? msg.subject ?? null, title: d.item.title,
  })
  const log = (detail: Row) => relayEvent(d.item.id, { intent, via, confidence: r.confidence, cues: r.cues, message_id: msg.id, side, ...detail })
  const setItem = async (patch: Row) => sbTry(`work_items?id=eq.${enc(d.item.id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...patch, last_activity_at: msg.sent_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }) })
  const result = (extra: Row = {}) => ({ intent, via, confidence: r.confidence, ...extra })

  // Already answered? One set of drafts per inbound message.
  const prior = await sbTry<Row[]>(`ai_drafts?work_item_id=eq.${enc(d.item.id)}&context_used->>message_id=eq.${enc(msg.id)}&status=in.(pending,draft)&select=id&limit=1`, [])
  if (prior.length) { await skip(task.id, 'drafts already made for this message'); return 'handled' }

  // Intents that change the case but send nothing.
  if (intent === 'none') { await log({}); return result() }
  if (intent === 'thanks') { await log({}); return result() }
  if (intent === 'market_ack') {
    if (['trs_to_act', 'waiting_insurer', 'stalled'].includes(d.item.status)) await setItem({ status: 'waiting_insurer', waiting_since: day, next_action: 'Wait for the insurer' })
    await log({ status: 'waiting_insurer' }); return result({ status: 'waiting_insurer' })
  }
  if (intent === 'market_chase') {
    await setItem({ status: 'trs_to_act', next_action: `Reply to ${insurerName ?? 'the insurer'} on ${d.item.title}` })
    await log({ status: 'trs_to_act' }); return result({ status: 'trs_to_act' })
  }
  if (intent === 'claim_notify') { await log({ handed: 'claims' }); return result({ handed: 'claims' }) }
  // A change request or an insurer's note is the policy intake's: the same task intake queued,
  // same key, so it runs once however many agents notice it.
  if (intent === 'change_request' || intent === 'insurer_note') {
    await enqueue({ agent: 'eb_movements', kind: 'inbound_mail', idem_key: `eb:${msg.id}`, created_by_agent: 'relay', work_item_id: d.item.id, company_id: d.item.company_id, thread_id: msg.thread_id, message_id: msg.id, payload: { message_id: msg.id } })
    await setItem({ status: 'trs_to_act', next_action: intent === 'change_request' ? 'Send the change to the insurer' : 'Check the insurer note and bill the client' })
    await log({ handed: 'eb_movements' }); return result({ handed: 'eb_movements' })
  }

  // An item that already holds an unsent draft keeps it; the relay is logged so a person sees why.
  if (d.item.draft_id) {
    const [open] = await sbTry<Row[]>(`ai_drafts?id=eq.${enc(d.item.draft_id)}&select=status&limit=1`, [])
    if (open && ['pending', 'draft'].includes(open.status)) { await setItem({ status: 'trs_to_act' }); await log({ skipped: 'item already holds an unsent draft' }); return result({ skipped: 'open draft' }) }
  }

  const made: Made[] = []
  const pairId = randomUUID()
  const store = async (kind: RelayKind, f: RelayFacts, rt: Route & { ok: true }, opts: { threadId: string | null; attachments?: Attachment[]; primary?: boolean }) => {
    const built = composeRelay(kind, { ...f, greetingName: await greetingFor(rt.to[0]) })
    // One pending email of this kind per side of a case: a newer message on the case replaces
    // the unsent draft it made, so two client emails in one morning do not become two forwards.
    await sbTry(`ai_drafts?work_item_id=eq.${enc(d.item.id)}&status=eq.pending&party=eq.${PARTY_OF[kind]}&context_used->>kind=eq.${enc(kind)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'superseded', rejection_note: `replaced by the relay of a newer message (${msg.id})` }) })
    const id = await storeDraft(d.item.id, { thread_id: opts.threadId, to: rt.to, cc: rt.cc, subject: built.subject, body: built.body, kind, party: PARTY_OF[kind], pair_id: pairId, attachments: opts.attachments ?? [] }, { primary: opts.primary ?? made.length === 0 })
    await sbTry(`ai_drafts?id=eq.${enc(id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ draft_class: CLASS_OF[kind], relay_intent: intent, context_used: { agent: ACTOR, kind, message_id: msg.id, intent, via, basis: rt.basis } }) })
    made.push({ kind, draftId: id, to: rt.to })
    return id
  }
  const clientThread = d.threads.filter(t => t.side === 'client').sort((a, b) => String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))[0]?.id ?? (side === 'client' ? msg.thread_id : null)
  const insurerThread = d.threads.filter(t => t.side === 'insurer').sort((a, b) => String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))[0]?.id ?? (side === 'market' ? msg.thread_id : null)
  /** The second email of a pair; the main one stands alone when the other side has nobody. */
  const pair = async (kind: RelayKind, f: RelayFacts, attachments: Attachment[] = []) => {
    const pk = relayPairFor(kind)
    if (!pk) return
    const pside = PARTY_OF[pk]
    const rt = await route(pside, d, line)
    if (rt.ok) await store(pk, f, rt, { threadId: pside === 'client' ? clientThread : insurerThread, attachments, primary: false })
  }
  const ask = async (question: string, extra: Row = {}) => { await askHuman(task.id, question, { work_item_id: d.item.id, intent, ...extra }); await log({ needs_human: question }); return 'handled' as const }

  switch (intent) {
    case 'quote_request': {
      const missing = missingForQuote(line, text, r.docTypes)
      if (missing.length) {
        const rt = await route('client', d, line)
        if (!rt.ok) return ask(rt.question)
        await store('request_info', { ...base(), missing }, rt, { threadId: clientThread })
        await setItem({ status: 'trs_to_act', next_action: 'Ask the client for the missing information' })
        break
      }
      if (!line) return ask('Which product line is this quote request for? The relay could not tell from the email.')
      const desks = await desksForLine(line, insurerName)
      if (!desks.length) return ask(`Which insurer desks should receive the ${lineLabel(line) ?? line} request? None is on the insurer list for that line.`, { line })
      const owner = d.item.owner_email && !d.departed.includes(String(d.item.owner_email).toLowerCase()) ? [String(d.item.owner_email).toLowerCase()] : []
      for (const desk of desks) {
        await store('forward_quote_request', { ...base(), insurerName: desk.insurer, original, files: files.map(f => f.filename) }, { ok: true, to: [desk.email], cc: [OPERATIONS, ...owner], basis: `insurer list: ${desk.insurer} ${lineLabel(line) ?? line}` }, { threadId: null, attachments })
      }
      await pair('forward_quote_request', { ...base(), insurersApproached: desks.map(x => x.insurer) })
      await setItem({ status: 'trs_to_act', next_action: `Send the request to ${desks.map(x => x.insurer).join(', ')}` })
      break
    }
    case 'docs_provided': {
      await syncRegister(d, { line, today: day, startDate: policy?.start_date ?? null, expiry: d.item.case_type === 'renewal' ? policy?.end_date ?? null : null }).catch(() => null)
      const insurerOnCase = d.messages.some(m => m.side === 'insurer') || !!insurerName
      if (insurerOnCase) {
        const rt = await route('insurer', d, line)
        if (rt.ok) { await store('forward_documents', { ...base(), original, files: files.map(f => f.filename) }, rt, { threadId: insurerThread, attachments }); await pair('forward_documents', { ...base() }) }
        else { const c = await route('client', d, line); if (c.ok) await store('ack_client', base(), c, { threadId: clientThread }) }
      } else {
        const c = await route('client', d, line)
        if (c.ok) await store('ack_client', base(), c, { threadId: clientThread })
      }
      await setItem({ status: 'trs_to_act', next_action: insurerOnCase ? `Send the client's documents to ${insurerName ?? 'the insurer'}` : 'File the documents and reply to the client' })
      break
    }
    case 'instruction': {
      // The binding gate: the instruction goes to the insurer only when the file holds what the
      // insurer will ask for. Otherwise the client is thanked and asked for the rest, numbered.
      const today = day
      const otherBrokerOnRisk = d.messages.some(m => m.side === 'insurer' && !m.rebuilt && isBrokerBlock(m.text.slice(0, 4000)))
      const gate = await syncRegister(d, { line, today, startDate: policy?.start_date ?? null, instructedOn: today, expiry: d.item.case_type === 'renewal' ? policy?.end_date ?? null : null, otherBrokerOnRisk }, { instructionMessageId: msg.id })
      if (!gate.complete) {
        const c = await route('client', d, line)
        if (!c.ok) return ask(c.question)
        // The letters the register asks for go with the ask, filled from the case, so the client
        // signs rather than drafts: the letter of undertaking of nil claims, the appointment letter.
        const letters = await lettersFor(d, gate.missing.map(m => m.kind), { insurerName, line, policy, today, clientName: d.company?.company_name ?? d.item.client_name ?? '' }).catch(e => { console.error('[relay] letters', e instanceof Error ? e.message : e); return [] as Attachment[] })
        await store('request_documents', { ...base(), documents: missingLines(gate.missing), instructed: true, files: letters.map(a => a.filename) }, c, { threadId: clientThread, attachments: letters })
        await markRequested(d.item.id, gate.missing.map(m => m.kind))
        await setItem({ status: 'waiting_client', waiting_since: today, next_action: `Collect ${gate.missing.length === 1 ? 'the document' : `${gate.missing.length} documents`} before binding with ${insurerName ?? 'the insurer'}` })
        await log({ gate: 'withheld', missing: gate.missing.map(m => m.kind) })
        break
      }
      const rt = await route('insurer', d, line)
      if (!rt.ok) return ask(rt.question)
      await store('forward_instruction', { ...base(), original, files: files.map(f => f.filename) }, rt, { threadId: insurerThread, attachments })
      await pair('forward_instruction', base())
      await setItem({ status: 'trs_to_act', next_action: `Pass the client's instruction to ${insurerName ?? 'the insurer'}` })
      await log({ gate: 'complete' })
      break
    }
    case 'cover_question': {
      const POLICY_TOPICS = new Set(['cover', 'requirement', 'claims_handling', 'billing', 'members', 'insured'])
      const facts = (await getGroupFacts(d.item.company_id ?? '').catch(() => [])).filter(f => POLICY_TOPICS.has(f.topic) && (!policy?.id || !f.policy_id || f.policy_id === policy.id))
      const qWords = new Set<string>(text.toLowerCase().match(/[a-z]{5,}/g) ?? [])
      const answers: { fact: string; source: string }[] = []
      if (policy) answers.push({ fact: `${policy.class_of_insurance ?? policy.product_line ?? 'Policy'}${policy.policy_number ? ` No. ${policy.policy_number}` : ''} with ${policy.insurer ?? insurerName ?? 'the insurer'}${policy.start_date && policy.end_date ? `, ${policy.start_date} to ${policy.end_date}` : ''}`, source: 'policy record' })
      for (const f of facts) {
        const hay = `${f.key} ${f.value}`.toLowerCase()
        if ([...qWords].some(w => hay.includes(w)) || (line && f.key.toLowerCase().includes(line))) answers.push({ fact: `${f.key.replace(/[._]/g, ' ')}: ${f.value}`, source: `${f.source_kind}${f.source_date ? ` ${f.source_date}` : ''}` })
        if (answers.length >= 7) break
      }
      const docs = policy ? await sbTry<Row[]>(`policy_documents?policy_id=eq.${enc(policy.id)}&status=eq.filed&doc_type=in.(policy_schedule,policy_wording,benefit_summary,certificate)&select=filename,mime_type,storage_url,message_id,drive_url&limit=3`, []) : []
      // A question the house answers the same way every time (headcount basis, debit note, backdating …) is answered in those words.
      const house = answers.length <= (policy ? 1 : 0) ? explain(text) : null
      if (house) answers.push({ fact: house.text, source: 'TRS practice' })
      if (answers.length > (policy ? 1 : 0) || docs.length) {
        const rt = await route('client', d, line)
        if (!rt.ok) return ask(rt.question)
        await store('answer_question', { ...base(), answers, files: docs.map(x => x.filename) }, rt, { threadId: clientThread, attachments: docs.map(x => ({ filename: x.filename, mime_type: x.mime_type, storage_url: x.storage_url ?? x.drive_url, message_id: x.message_id ?? '' })) })
        await setItem({ status: 'trs_to_act', next_action: 'Answer the client from the policy on file' })
      } else if (insurerName || d.messages.some(m => m.side === 'insurer')) {
        const rt = await route('insurer', d, line)
        if (!rt.ok) return ask(rt.question)
        await store('forward_question', { ...base(), original }, rt, { threadId: insurerThread })
        await pair('forward_question', base())
        await setItem({ status: 'trs_to_act', next_action: `Put the client's question to ${insurerName ?? 'the insurer'}` })
      } else return ask('The client asked about cover but nothing on file answers it and no insurer is on the case. Who should answer?')
      break
    }
    case 'document_request': {
      const want = /\b(cert|coi)\b/i.test(text) ? ['certificate', 'cover_note', 'policy_schedule'] : /\bwording\b/i.test(text) ? ['policy_wording', 'policy_schedule'] : ['policy_schedule', 'certificate', 'cover_note', 'policy_wording', 'endorsement']
      const pol = policy ?? d.policies.find(p => line && [p.product_line, p.class_of_insurance].some(x => String(x ?? '').toLowerCase().includes(line.split('_')[0]))) ?? null
      const docs = pol ? await sbTry<Row[]>(`policy_documents?policy_id=eq.${enc(pol.id)}&status=eq.filed&doc_type=in.(${want.join(',')})&select=filename,mime_type,storage_url,message_id,drive_url,doc_type&order=received_at.desc&limit=4`, []) : []
      const picked = want.map(t => docs.find(x => x.doc_type === t)).filter((x): x is Row => !!x).slice(0, 2)
      if (picked.length) {
        const rt = await route('client', d, line)
        if (!rt.ok) return ask(rt.question)
        await store('document_send', { ...base(), policyNumber: pol?.policy_number ?? null, className: pol?.class_of_insurance ?? pol?.product_line ?? null, periodFrom: pol?.start_date ?? null, periodTo: pol?.end_date ?? null, files: picked.map(x => x.filename) }, rt, { threadId: clientThread, attachments: picked.map(x => ({ filename: x.filename, mime_type: x.mime_type, storage_url: x.storage_url ?? x.drive_url, message_id: x.message_id ?? '' })) })
        await setItem({ status: 'trs_to_act', next_action: 'Send the client the documents from the data room' })
      } else if (insurerName || pol?.insurer) {
        const rt = await route('insurer', d, line)
        if (!rt.ok) return ask(rt.question)
        await store('forward_question', { ...base(), insurerName: insurerName ?? displayName(pol?.insurer ?? ''), original }, rt, { threadId: insurerThread })
        await pair('forward_question', { ...base(), insurerName: insurerName ?? displayName(pol?.insurer ?? '') })
        await setItem({ status: 'trs_to_act', next_action: `Ask ${insurerName ?? pol?.insurer ?? 'the insurer'} for the document` })
      } else return ask('The client asked for a policy document, but no policy or insurer is on file for this case. Which policy?')
      break
    }
    case 'client_chase': {
      const rt = await route('client', d, line)
      if (!rt.ok) return ask(rt.question)
      const lastTrs = [...d.messages].reverse().find(m => m.side === 'trs' && !m.rebuilt)
      await store('status_update', { ...base(), status: d.item.status, waitingOn: d.item.status === 'waiting_insurer' ? 'insurer' : d.item.status === 'waiting_client' ? 'client' : null, lastSent: lastTrs?.sent_at ?? d.item.waiting_since ?? null, nextAction: d.item.next_action ?? null, deadline: d.item.deadline ?? null }, rt, { threadId: clientThread })
      if (d.item.status === 'waiting_insurer') {
        const ins = await route('insurer', d, line)
        if (ins.ok) {
          const b = buildDraft('chase_insurer', { greetingName: await greetingFor(ins.to[0]), clientName: base().clientName, title: d.item.title, policyNumber: base().policyNumber, insurerName, insurerRef: null, claimant: null, lossDate: null, lastSent: lastTrs?.sent_at ?? d.item.waiting_since ?? null, threadSubject: d.threads.find(t => t.id === insurerThread)?.subject ?? null, round: 1, deadline: d.item.deadline ?? null })
          const id = await storeDraft(d.item.id, { thread_id: insurerThread, to: ins.to, cc: ins.cc, subject: b.subject, body: b.body, kind: 'chase_insurer', party: 'insurer', pair_id: pairId }, { primary: false })
          await sbTry(`ai_drafts?id=eq.${enc(id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ draft_class: 'status', relay_intent: intent, context_used: { agent: ACTOR, kind: 'chase_insurer', message_id: msg.id, intent, via, basis: ins.basis } }) })
          made.push({ kind: 'forward_question', draftId: id, to: ins.to })
        }
      }
      await setItem({ status: 'trs_to_act', next_action: 'Reply to the client with the status' })
      break
    }
    case 'quote_received': case 'decline': {
      const rt = await route('client', d, line)
      if (!rt.ok) return ask(rt.question)
      const quoteFiles = files.filter(f => /quot|terms|indication|proposal|renewal/i.test(f.filename) || /\.pdf$/i.test(f.filename))
      if (intent === 'decline') await store('relay_decline', { ...base(), quoted: text.slice(0, 600) }, rt, { threadId: clientThread })
      else { await store('relay_quote', { ...base(), terms: extractQuoteTerms(text), files: quoteFiles.map(f => f.filename) }, rt, { threadId: clientThread, attachments: quoteFiles.map(f => ({ filename: f.filename, mime_type: f.mime_type, storage_url: f.storage_url, message_id: f.message_id })) }); await pair('relay_quote', base()) }
      await setItem({ status: 'trs_to_act', next_action: intent === 'decline' ? `Tell the client ${insurerName ?? 'the insurer'} declined and approach other markets` : `Relay ${insurerName ?? 'the insurer'}'s terms to the client` })
      break
    }
    case 'documents_received': {
      const rt = await route('client', d, line)
      if (!rt.ok) return ask(rt.question)
      const docFiles = files.filter(f => !/\.(png|jpe?g|gif)$/i.test(f.filename))
      // The delivery pack, as Nathan sends it: the policy documents, then the TRS debit note with
      // the insurer's tax invoice, and the fixed billing line. The note is attached when it exists.
      const dn = policy ? await sbTry<Row[]>(`policy_documents?policy_id=eq.${enc(policy.id)}&status=eq.filed&doc_type=eq.trs_debit_note&select=filename,mime_type,storage_url,message_id,drive_url&order=received_at.desc&limit=1`, []) : []
      const pack = [...docFiles.map(f => ({ filename: f.filename, mime_type: f.mime_type, storage_url: f.storage_url, message_id: f.message_id })), ...dn.map(x => ({ filename: x.filename, mime_type: x.mime_type, storage_url: x.storage_url ?? x.drive_url, message_id: x.message_id ?? '' }))]
      await store('relay_documents', { ...base(), files: pack.map(f => f.filename), billing: dn.length > 0 }, rt, { threadId: clientThread, attachments: pack })
      await setItem({ status: 'trs_to_act', next_action: dn.length ? 'Send the client the policy documents and the debit note' : 'Send the client the policy documents; the debit note follows from the review queue' })
      break
    }
    case 'claim_decision': {
      const rt = await route('client', d, line)
      if (!rt.ok) return ask(rt.question)
      await store('relay_decision', { ...base(), quoted: text.slice(0, 800), files: files.map(f => f.filename) }, rt, { threadId: clientThread, attachments })
      await pair('relay_decision', base())
      await setItem({ status: 'trs_to_act', next_action: `Relay ${insurerName ?? 'the insurer'}'s decision to the client` })
      break
    }
    case 'market_question': {
      const rt = await route('client', d, line)
      if (!rt.ok) return ask(rt.question)
      const asks = listedAsks(text)
      await store('relay_question', { ...base(), asks, quoted: asks.length ? null : text.slice(0, 600) }, rt, { threadId: clientThread })
      await setItem({ status: 'trs_to_act', next_action: `Get the client's answers for ${insurerName ?? 'the insurer'}` })
      break
    }
    default:
      await log({})
      return result()
  }
  await log({ drafts: made.map(m => ({ kind: m.kind, draft_id: m.draftId, to: m.to })) })
  return result({ drafts: made.length, kinds: made.map(m => m.kind) })
}
