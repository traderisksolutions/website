/**
 * The case worker: one client at a time, read whole.
 *
 * It gathers the client's recent threads, including the insurer-side threads that name the client
 * (a claim chased with QBE is filed under QBE), the policies on file and the work items already
 * open. The model groups the threads into cases and says, for each, where it stands and what TRS
 * does next; clean.ts decides what of that may be stored. Open items are updated in place, a new
 * case opens an item, and a ready reply goes into ai_drafts for a person to approve. Nothing sends.
 */
import { callGemini } from '@/lib/ai-call'
import { GEMINI_DEEP } from '@/lib/gemini-models'
import { sb, sbTry, enc, inChunks, isInternal } from '@/lib/crm/db'
import { latestText } from '@/lib/nexus/reader'
import { randomUUID } from 'node:crypto'
import { companyCore, getCompanyIndex, matchByName } from '@/lib/crm/resolve'
import { contactIdFor } from '@/lib/admin/b/contact-id'
import { twinOf } from './clean'
import { caseModeFor, type CaseMode } from '@/lib/admin/b/kinds'
import { cleanCase, parseAnswer, type CaseContext, type CaseDraft, type CleanCase } from './clean'

const ACTOR = 'case_worker'
const WINDOW_DAYS = 90
const MAX_THREADS = 30

type Row = Record<string, any>

export const CASE_SYSTEM = `You are the case worker for Trade Risk Solutions (TRS), a Singapore general-insurance broker. You read every open thread for one client and keep its work in order so that staff only approve.

Group the threads into CASES. A case is one piece of work for one client: a claim (one claimant or incident), a renewal, a new quotation, an endorsement or member-movement batch, a premium or debit-note matter, a request for policy documents, an enquiry. The client-side thread and the insurer-side threads of one matter are one case. When a case matches an OPEN ITEM you are shown, return that item's id as item_id.

For each case decide:
- status: done (nothing left for anyone), waiting_client, waiting_insurer, trs_to_act (TRS owes the next move), stalled (a TRS ask unanswered for more than 7 days, or a deadline passed).
- next_action: one imperative line of what TRS does next. Waiting more than 5 working days means the next action is a chase.
- draft, only when TRS must send something now: reply on one of the case threads, to and cc only from addresses on the thread, short, courteous, plain English in the tone of TRS's own messages, signed "{owner_name}". Attach only files that appear on the case, by exact file name. Say who it goes to in party: "insurer" or "client".
- pair_draft, when the matter has two parties and both should hear from TRS now: the other party's email, same rules, the opposite party. Typical pairs: chase the insurer and tell the client it was chased; send the client's claim to the insurer and acknowledge it to the client. They are approved and sent together.
- deadline: a real date from the mail or the policy (inception, expiry, a date someone stated), with its basis.
- suggested_owner: the TRS colleague active on this case or client. Never someone who has left.
- needs_human: any decision you must not make (coverage dispute, claim decline, payee or bank details, premium acceptance, cancelling cover). Say exactly what must be decided.
- evidence: verbatim quotes, under 160 characters, from the message that sets the status.

Messages marked REBUILT were read out of a forward or quoted history: TRS never received them. Use them for the history of the case; reply only on a real thread; a file they name is not held unless it is listed as an attachment elsewhere — ask for it.

Never invent an amount, date, policy number, name or attachment. If it is not in the mail, say it is missing.

Answer JSON only: {"cases":[{"item_id":null,"client":"","case_type":"claim|renewal|new_quote|endorsement|member_movement|premium_billing|documents|enquiry|other","title":"","threads":[""],"insurer":null,"policy_number":null,"status":"","waiting_since":null,"last_activity":"YYYY-MM-DD","summary":"","next_action":null,"deadline":null,"deadline_basis":null,"draft":null,"suggested_owner":null,"owner_basis":"","needs_human":null,"evidence":[{"thread":"","quote":""}],"confidence":"high|medium|low"}]}
draft and pair_draft, when present: {"reply_in_thread":"","to":[""],"cc":[""],"subject":"","body":"","attach":[""],"party":"insurer|client"}`

/** Added to the prompt when the record read is a partner broker, not a client. */
export const PARTNER_NOTE = `This record is a PARTNER BROKER that places work with TRS for its own clients; it is not TRS's client. For each case put the END CLIENT's company name (the policyholder named in the mail) in "client". Only TRS's own dealings with the partner (co-broking fees, agreements) use the partner's name as client, with case_type other. If the end client is not named, say so in needs_human.`

export type CaseInput = { companyId: string | null; mode: CaseMode; companyName: string | null; prompt: string; ctx: CaseContext; files: Map<string, Row>; threadSide: Map<string, 'client' | 'insurer' | 'internal' | 'other'> }

/** Everything the case worker reads for one client, and what its answer will be checked against. */
export async function loadCase(companyId: string, today = new Date().toISOString().slice(0, 10), opts: { focusThreadIds?: string[] } = {}): Promise<CaseInput | null> {
  const [company] = await sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=id,company_name,kind,domains,parent_id&limit=1`, [])
  if (!company) return null
  const mode = caseModeFor(company.kind)
  if (mode === 'none') return null
  const since = new Date(Date.parse(today) - WINDOW_DAYS * 86_400_000).toISOString()
  const aliases = await sbTry<Row[]>(`company_aliases?company_id=eq.${enc(companyId)}&select=alias`, [])
  const items = await sbTry<Row[]>(`work_items?company_id=eq.${enc(companyId)}&closed_at=is.null&select=id,title,case_type,status,next_action,owner_email,work_item_threads(thread_id)`, [])

  // The client's own threads, the threads of its open items, and insurer-side threads that name it.
  // A focused read (the case builder resuming from its ledger cursor) takes only the threads that
  // moved, plus the open items' threads, so the whole client is not re-read for every email.
  const focus = opts.focusThreadIds ? opts.focusThreadIds.filter(Boolean) : null
  const own = focus
    ? (focus.length ? await sbTry<Row[]>(`email_threads?id=in.(${focus.slice(0, MAX_THREADS).join(',')})&deleted_at=is.null&select=id,subject,company_id,last_message_at`, []) : [])
    : await sbTry<Row[]>(`email_threads?company_id=eq.${enc(companyId)}&deleted_at=is.null&last_message_at=gte.${enc(since)}&select=id,subject,company_id,last_message_at&order=last_message_at.desc&limit=${MAX_THREADS}`, [])
  // Open items already on these threads, whoever they are filed under (a partner's mail opens
  // cases under the end client), so the reader updates them instead of opening duplicates.
  if (own.length) {
    const onThreads = await sbTry<Row[]>(`work_item_threads?thread_id=in.(${own.map(t => t.id).join(',')})&select=work_items(id,title,case_type,status,next_action,owner_email,closed_at,work_item_threads(thread_id))`, [])
    for (const l of onThreads) {
      const w = l.work_items
      if (w && !w.closed_at && !items.some(i => i.id === w.id)) items.push(w)
    }
  }
  const linked = items.flatMap(i => (i.work_item_threads ?? []).map((t: Row) => t.thread_id as string))
  const names = focus ? [] : Array.from(new Set([company.company_name, ...aliases.map(a => a.alias)].map(n => companyCore(String(n ?? ''))).filter(n => n.length >= 5)))
  const named: Row[] = []
  for (const n of names.slice(0, 6)) {
    const words = n.split(' ').slice(0, 3).join('*')
    named.push(...await sbTry<Row[]>(`email_threads?subject=ilike.*${enc(words)}*&deleted_at=is.null&last_message_at=gte.${enc(since)}&select=id,subject,company_id,last_message_at&limit=20`, []))
  }
  const byId = new Map<string, Row>()
  for (const t of [...own, ...named]) byId.set(t.id, t)
  const missing = linked.filter(id => !byId.has(id))
  if (missing.length) for (const t of await sbTry<Row[]>(`email_threads?id=in.(${missing.join(',')})&select=id,subject,company_id,last_message_at`, [])) byId.set(t.id, t)
  const threads = Array.from(byId.values()).sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at))).slice(0, MAX_THREADS)
  if (threads.length === 0) return null
  const ids = threads.map(t => t.id as string)

  const messages = await inChunks(ids, 30, chunk => sbTry<Row[]>(`email_messages?thread_id=in.(${chunk.join(',')})&deleted_at=is.null&select=id,thread_id,direction,from_address,body_text,sent_at&order=sent_at.asc`, []))
  const attachments = await inChunks(ids, 30, chunk => sbTry<Row[]>(`email_attachments?thread_id=in.(${chunk.join(',')})&select=message_id,thread_id,filename,mime_type,storage_url`, []))
  // Recipients live here, not in the message row: without them a reply has nobody to go to.
  const people = await inChunks(ids, 30, chunk => sbTry<Row[]>(`email_participants?thread_id=in.(${chunk.join(',')})&deleted_at=is.null&select=message_id,email,role`, []))
  // Messages TRS never received, rebuilt from forwards and quoted history (src/lib/admin/a/intake.ts).
  const rebuilt = await inChunks(ids, 30, chunk => sbTry<Row[]>(`rebuilt_messages?thread_id=in.(${chunk.join(',')})&select=thread_id,origin,from_address,to_addresses,cc_addresses,sent_at,sent_at_text,subject,body_text,attachments_named,trs_copied&order=position.asc`, []))
  const peopleBy = new Map<string, Row[]>()
  for (const p of people) peopleBy.set(p.message_id, [...(peopleBy.get(p.message_id) ?? []), p])
  const policies = await sbTry<Row[]>(`policies?company_id=eq.${enc(companyId)}&select=insurer,class_of_insurance,product_line,policy_number,start_date,end_date,lifecycle&order=end_date.desc.nullslast&limit=25`, [])
  const staff = (await sbTry<Row[]>('contacts?is_employee=eq.true&select=email', [])).map(r => String(r.email).toLowerCase())
  const gone = new Set((await sbTry<Row[]>('staff_departures?select=email', [])).map(r => String(r.email).toLowerCase()))
  const insurerIds = new Set((await sbTry<Row[]>('companies?kind=eq.insurer&select=id', [])).map(r => r.id as string))

  const filesBy = new Map<string, string[]>()
  const files = new Map<string, Row>()
  for (const a of attachments) {
    if (!a.filename) continue
    filesBy.set(a.message_id, [...(filesBy.get(a.message_id) ?? []), a.filename])
    if (a.storage_url && !files.has(a.filename)) files.set(a.filename, a)
  }
  const addresses = new Set<string>()
  const threadSide = new Map<string, 'client' | 'insurer' | 'internal' | 'other'>()
  const blocks: string[] = []
  const texts: string[] = []
  for (const t of threads) {
    threadSide.set(t.id, t.company_id === companyId ? 'client' : insurerIds.has(t.company_id) ? 'insurer' : 'other')
    const lines = [`### THREAD ${t.id}\nsubject: ${t.subject ?? ''}`]
    for (const r of rebuilt.filter(r => r.thread_id === t.id)) {
      const body = String(r.body_text ?? '').slice(0, 3000)
      texts.push(body)
      if (r.from_address) addresses.add(String(r.from_address).toLowerCase())
      const to = (r.to_addresses ?? []).join(', '), cc = (r.cc_addresses ?? []).join(', ')
      lines.push(`--- REBUILT from ${r.origin} (TRS did not receive this${r.trs_copied ? '' : '; TRS was not copied'}) ${r.sent_at ?? r.sent_at_text ?? 'date unknown'} from ${r.from_address ?? 'unknown'}${to ? `\nto: ${to}` : ''}${cc ? `\ncc: ${cc}` : ''}${r.attachments_named?.length ? `\nnames files (not held by TRS): ${r.attachments_named.join(', ')}` : ''}\n${body}`)
    }
    for (const m of messages.filter(m => m.thread_id === t.id)) {
      const body = latestText(m.body_text, 4000)
      texts.push(body)
      for (const a of String(body).match(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/g) ?? []) addresses.add(a.toLowerCase())
      if (m.from_address) addresses.add(String(m.from_address).replace(/.*</, '').replace(/>.*/, '').trim().toLowerCase())
      const f = filesBy.get(m.id)
      const who = peopleBy.get(m.id) ?? []
      for (const p of who) if (p.email) addresses.add(String(p.email).toLowerCase())
      const to = who.filter(p => p.role === 'to').map(p => p.email).join(', ')
      const cc = who.filter(p => p.role === 'cc').map(p => p.email).join(', ')
      lines.push(`--- ${m.sent_at} ${isInternal(m.from_address) ? 'TRS' : m.direction} from ${m.from_address}${to ? `\nto: ${to}` : ''}${cc ? `\ncc: ${cc}` : ''}${f?.length ? `\nattachments: ${f.join(', ')}` : ''}\n${body}`)
    }
    blocks.push(lines.join('\n'))
  }

  const prompt = [
    `TODAY: ${today}`,
    `${mode === 'partner' ? 'PARTNER BROKER' : 'CLIENT'}: ${company.company_name}${aliases.length ? ` (also: ${aliases.map(a => a.alias).slice(0, 8).join('; ')})` : ''}`,
    mode === 'partner' ? PARTNER_NOTE : '',
    `TRS STAFF WHO CAN OWN WORK: ${staff.filter(s => !gone.has(s)).join(', ')}`,
    gone.size ? `LEFT TRS (reassign their work): ${Array.from(gone).join(', ')}` : '',
    policies.length ? `POLICIES ON FILE:\n${policies.map(p => `- ${p.insurer} ${p.class_of_insurance ?? p.product_line ?? ''} ${p.policy_number ?? '(no number)'} ${p.start_date ?? '?'} to ${p.end_date ?? '?'} [${p.lifecycle}]`).join('\n')}` : 'POLICIES ON FILE: none',
    items.length ? `OPEN ITEMS:\n${items.map(i => `- ${i.id} | ${i.case_type} | ${i.title} | ${i.status} | next: ${i.next_action ?? '-'}`).join('\n')}` : 'OPEN ITEMS: none',
    `THREADS:\n\n${blocks.join('\n\n')}`,
  ].filter(Boolean).join('\n\n')

  return {
    companyId, mode, companyName: company.company_name ?? null, prompt, files, threadSide,
    ctx: { departedNames: Array.from(gone).map(e => e.split('@')[0].split(/[._]/)[0]), threadIds: ids, addresses: Array.from(addresses), attachments: Array.from(new Set(attachments.map(a => a.filename).filter(Boolean))), text: texts.join('\n'), staff: staff.filter(s => !gone.has(s)), today, itemIds: items.map(i => i.id) },
  }
}

export async function readCase(input: CaseInput): Promise<{ cases: CleanCase[]; dropped: number; error?: string }> {
  const r = await callGemini({
    agent: 'housekeeping', feature: 'case_work', model: GEMINI_DEEP, system: CASE_SYSTEM,
    parts: [{ text: input.prompt }], json: true, maxOutputTokens: 32000, thinkingShare: 0.4,
    metadata: { company_id: input.companyId },
  })
  if (!r.text) return { cases: [], dropped: 0, error: r.error }
  const raw = parseAnswer(r.text)
  const cases = raw.map(c => cleanCase(c, input.ctx)).filter((c): c is CleanCase => !!c)
  return { cases, dropped: raw.length - cases.length }
}

/** Writes one case: the item, its threads, its draft, and an event saying what changed. */
/**
 * Whose case it is. A client's read files cases under the client. A partner broker's read files
 * each case under the end client the reader named, when that client is on file; otherwise the case
 * has no company and asks a person. Only the partner's own dealings stay under the partner.
 */
async function caseCompany(input: CaseInput, c: CleanCase): Promise<{ companyId: string | null; needsHuman: string | null }> {
  if (input.mode !== 'partner') return { companyId: input.companyId, needsHuman: null }
  const named = (c.client ?? '').trim()
  const partner = input.companyName ?? 'the partner'
  if (!named) return { companyId: null, needsHuman: `Which end client is this for? ${partner} is a partner broker, not the client.` }
  if (input.companyName && companyCore(named) === companyCore(input.companyName)) return { companyId: input.companyId, needsHuman: null }
  const index = await getCompanyIndex()
  // A client whose name is the named one, before any alias match: "Acme (Singapore) LLP" is the
  // client, even when a partner "Acme Law" also answers to "Acme".
  const core = companyCore(named)
  for (const co of index.byId.values()) if (caseModeFor(co.kind) === 'client' && companyCore(co.name) === core) return { companyId: co.id, needsHuman: null }
  const hit = matchByName(named, index)
  const company = hit ? index.byId.get(hit.companyId) : null
  if (company && caseModeFor(company.kind) === 'client') return { companyId: company.id, needsHuman: null }
  return { companyId: null, needsHuman: `End client "${named}" is not on file. Choose or add the client; ${partner} is a partner broker.` }
}

export async function storeCase(input: CaseInput, c: CleanCase): Promise<string> {
  const owner = await caseCompany(input, c)
  const row = {
    company_id: owner.companyId, client_name: c.client, case_type: c.case_type, title: c.title, status: c.status,
    waiting_since: c.waiting_since, last_activity_at: c.last_activity, summary: c.summary, next_action: c.next_action,
    deadline: c.deadline, deadline_basis: c.deadline_basis, insurer_name: c.insurer, policy_number: c.policy_number,
    suggested_owner: c.suggested_owner, owner_basis: c.owner_basis, needs_human: [owner.needsHuman, c.needs_human].filter(Boolean).join(' ') || null, confidence: c.confidence,
    evidence: c.evidence, model: GEMINI_DEEP, read_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    closed_at: c.status === 'done' ? new Date().toISOString() : null, closed_by: c.status === 'done' ? ACTOR : null,
  }
  let id = c.item_id
  if (!id && owner.companyId) {
    // The reader is shown the open items and names the one a case belongs to; when it misses
    // (a "3rd Reminder" of a claim already on file), the same matter must not open twice.
    const open = await sbTry<Row[]>(`work_items?company_id=eq.${enc(owner.companyId)}&case_type=eq.${enc(c.case_type)}&closed_at=is.null&select=id,title,policy_number,work_item_threads(thread_id)&limit=50`, [])
    id = twinOf(c, open.map(o => ({ id: o.id, title: o.title, policy_number: o.policy_number, threads: (o.work_item_threads ?? []).map((t: Row) => t.thread_id) })))
  }
  if (id) await sb(`work_items?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) })
  else {
    const [created] = await sb<Row[]>('work_items', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...row, owner_email: c.suggested_owner }) })
    id = created.id as string
  }
  // A thread belongs to one item: claim it here even if an earlier read put it elsewhere.
  await sb(`work_item_threads?thread_id=in.(${c.threads.join(',')})&work_item_id=neq.${enc(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  await sb('work_item_threads?on_conflict=work_item_id,thread_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(c.threads.map(t => ({ work_item_id: id, thread_id: t, side: input.threadSide.get(t) ?? 'other' }))),
  })

  if (c.draft) {
    // The previous unsent drafts for this item are replaced, never left beside the new ones.
    await sbTry(`ai_drafts?work_item_id=eq.${enc(id)}&status=in.(pending,draft)`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'rejected', rejection_note: 'replaced by a newer read' }) })
    const pairId = c.pair_draft ? randomUUID() : null
    const draftId = await insertDraft(input, id, c.draft, pairId)
    if (c.pair_draft) await insertDraft(input, id, c.pair_draft, pairId)
    await sb(`work_items?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ draft_id: draftId }) })
  }
  await sb('work_item_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: id, kind: 'read', actor: ACTOR, detail: { status: c.status, next_action: c.next_action, draft: !!c.draft, pair: !!c.pair_draft, draft_withheld: c.draft_withheld, pair_withheld: c.pair_withheld } }) })
  return id
}

async function insertDraft(input: CaseInput, workItemId: string, d: CaseDraft, pairId: string | null): Promise<string> {
  const contactId = await contactIdFor(d.to[0], input.companyId)
  const [draft] = await sb<Row[]>('ai_drafts', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      contact_id: contactId, thread_id: d.reply_in_thread, channel: 'email', email_type: 'CASE_WORK', status: 'pending',
      generated_by: 'gemini', to_email: d.to.join(', '), cc: d.cc.join(', ') || null, subject: d.subject, body: d.body,
      attachments: d.attach.map(f => input.files.get(f)).filter(Boolean).map(a => ({ filename: a!.filename, mime_type: a!.mime_type, storage_url: a!.storage_url })),
      work_item_id: workItemId, pair_id: pairId, party: d.party,
    }),
  })
  return draft.id as string
}

/** Reads one client and stores every case. Returns what happened, for logs and the dry run. */
export async function workCompany(companyId: string, opts: { write: boolean; today?: string; focusThreadIds?: string[] } = { write: false }) {
  const [co] = await sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=kind&limit=1`, [])
  if (co && caseModeFor(co.kind) === 'none') return { companyId, cases: [] as CleanCase[], stored: 0, dropped: 0, note: `not a client (${co.kind})` }
  const input = await loadCase(companyId, opts.today, { focusThreadIds: opts.focusThreadIds })
  if (!input) return { companyId, cases: [] as CleanCase[], stored: 0, dropped: 0, note: 'no recent threads' }
  const { cases, dropped, error } = await readCase(input)
  if (error) return { companyId, cases, stored: 0, dropped, note: error }
  let stored = 0
  if (opts.write) for (const c of cases) { await storeCase(input, c); stored++ }
  return { companyId, cases, stored, dropped, note: null }
}
