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
import { companyCore } from '@/lib/crm/resolve'
import { cleanCase, parseAnswer, type CaseContext, type CleanCase } from './clean'

const ACTOR = 'case_worker'
const WINDOW_DAYS = 90
const MAX_THREADS = 30

type Row = Record<string, any>

export const CASE_SYSTEM = `You are the case worker for Trade Risk Solutions (TRS), a Singapore general-insurance broker. You read every open thread for one client and keep its work in order so that staff only approve.

Group the threads into CASES. A case is one piece of work for one client: a claim (one claimant or incident), a renewal, a new quotation, an endorsement or member-movement batch, a premium or debit-note matter, a request for policy documents, an enquiry. The client-side thread and the insurer-side threads of one matter are one case. When a case matches an OPEN ITEM you are shown, return that item's id as item_id.

For each case decide:
- status: done (nothing left for anyone), waiting_client, waiting_insurer, trs_to_act (TRS owes the next move), stalled (a TRS ask unanswered for more than 7 days, or a deadline passed).
- next_action: one imperative line of what TRS does next. Waiting more than 5 working days means the next action is a chase.
- draft, only when TRS must send something now: reply on one of the case threads, to and cc only from addresses on the thread, short, courteous, plain English in the tone of TRS's own messages, signed "{owner_name}". Attach only files that appear on the case, by exact file name.
- deadline: a real date from the mail or the policy (inception, expiry, a date someone stated), with its basis.
- suggested_owner: the TRS colleague active on this case or client. Never someone who has left.
- needs_human: any decision you must not make (coverage dispute, claim decline, payee or bank details, premium acceptance, cancelling cover). Say exactly what must be decided.
- evidence: verbatim quotes, under 160 characters, from the message that sets the status.

Never invent an amount, date, policy number, name or attachment. If it is not in the mail, say it is missing.

Answer JSON only: {"cases":[{"item_id":null,"client":"","case_type":"claim|renewal|new_quote|endorsement|member_movement|premium_billing|documents|enquiry|other","title":"","threads":[""],"insurer":null,"policy_number":null,"status":"","waiting_since":null,"last_activity":"YYYY-MM-DD","summary":"","next_action":null,"deadline":null,"deadline_basis":null,"draft":null,"suggested_owner":null,"owner_basis":"","needs_human":null,"evidence":[{"thread":"","quote":""}],"confidence":"high|medium|low"}]}
draft, when present: {"reply_in_thread":"","to":[""],"cc":[""],"subject":"","body":"","attach":[""]}`

export type CaseInput = { companyId: string | null; prompt: string; ctx: CaseContext; files: Map<string, Row>; threadSide: Map<string, 'client' | 'insurer' | 'internal' | 'other'> }

/** Everything the case worker reads for one client, and what its answer will be checked against. */
export async function loadCase(companyId: string, today = new Date().toISOString().slice(0, 10)): Promise<CaseInput | null> {
  const [company] = await sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=id,company_name,kind,domains,parent_id&limit=1`, [])
  if (!company) return null
  const since = new Date(Date.parse(today) - WINDOW_DAYS * 86_400_000).toISOString()
  const aliases = await sbTry<Row[]>(`company_aliases?company_id=eq.${enc(companyId)}&select=alias`, [])
  const items = await sbTry<Row[]>(`work_items?company_id=eq.${enc(companyId)}&closed_at=is.null&select=id,title,case_type,status,next_action,owner_email,work_item_threads(thread_id)`, [])

  // The client's own threads, the threads of its open items, and insurer-side threads that name it.
  const own = await sbTry<Row[]>(`email_threads?company_id=eq.${enc(companyId)}&deleted_at=is.null&last_message_at=gte.${enc(since)}&select=id,subject,company_id,last_message_at&order=last_message_at.desc&limit=${MAX_THREADS}`, [])
  const linked = items.flatMap(i => (i.work_item_threads ?? []).map((t: Row) => t.thread_id as string))
  const names = Array.from(new Set([company.company_name, ...aliases.map(a => a.alias)].map(n => companyCore(String(n ?? ''))).filter(n => n.length >= 5)))
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
    `CLIENT: ${company.company_name}${aliases.length ? ` (also: ${aliases.map(a => a.alias).slice(0, 8).join('; ')})` : ''}`,
    `TRS STAFF WHO CAN OWN WORK: ${staff.filter(s => !gone.has(s)).join(', ')}`,
    gone.size ? `LEFT TRS (reassign their work): ${Array.from(gone).join(', ')}` : '',
    policies.length ? `POLICIES ON FILE:\n${policies.map(p => `- ${p.insurer} ${p.class_of_insurance ?? p.product_line ?? ''} ${p.policy_number ?? '(no number)'} ${p.start_date ?? '?'} to ${p.end_date ?? '?'} [${p.lifecycle}]`).join('\n')}` : 'POLICIES ON FILE: none',
    items.length ? `OPEN ITEMS:\n${items.map(i => `- ${i.id} | ${i.case_type} | ${i.title} | ${i.status} | next: ${i.next_action ?? '-'}`).join('\n')}` : 'OPEN ITEMS: none',
    `THREADS:\n\n${blocks.join('\n\n')}`,
  ].filter(Boolean).join('\n\n')

  return {
    companyId, prompt, files, threadSide,
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
export async function storeCase(input: CaseInput, c: CleanCase): Promise<string> {
  const row = {
    company_id: input.companyId, client_name: c.client, case_type: c.case_type, title: c.title, status: c.status,
    waiting_since: c.waiting_since, last_activity_at: c.last_activity, summary: c.summary, next_action: c.next_action,
    deadline: c.deadline, deadline_basis: c.deadline_basis, insurer_name: c.insurer, policy_number: c.policy_number,
    suggested_owner: c.suggested_owner, owner_basis: c.owner_basis, needs_human: c.needs_human, confidence: c.confidence,
    evidence: c.evidence, model: GEMINI_DEEP, read_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    closed_at: c.status === 'done' ? new Date().toISOString() : null, closed_by: c.status === 'done' ? ACTOR : null,
  }
  let id = c.item_id
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
    const [contact] = await sbTry<Row[]>(`contacts?email=ilike.${enc(c.draft.to[0])}&select=id&limit=1`, [])
    // The previous unsent draft for this item is replaced, never left beside the new one.
    await sbTry(`ai_drafts?work_item_id=eq.${enc(id)}&status=in.(pending,draft)`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'rejected', rejection_note: 'replaced by a newer read' }) })
    const [draft] = await sb<Row[]>('ai_drafts', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        contact_id: contact?.id ?? null, thread_id: c.draft.reply_in_thread, channel: 'email', email_type: 'CASE_WORK', status: 'pending',
        generated_by: 'gemini', to_email: c.draft.to.join(', '), cc: c.draft.cc.join(', ') || null, subject: c.draft.subject, body: c.draft.body,
        attachments: c.draft.attach.map(f => input.files.get(f)).filter(Boolean).map(a => ({ filename: a!.filename, mime_type: a!.mime_type, storage_url: a!.storage_url })),
        work_item_id: id,
      }),
    })
    await sb(`work_items?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ draft_id: draft.id }) })
  }
  await sb('work_item_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: id, kind: 'read', actor: ACTOR, detail: { status: c.status, next_action: c.next_action, draft: !!c.draft, draft_withheld: c.draft_withheld } }) })
  return id
}

/** Reads one client and stores every case. Returns what happened, for logs and the dry run. */
export async function workCompany(companyId: string, opts: { write: boolean; today?: string } = { write: false }) {
  const input = await loadCase(companyId, opts.today)
  if (!input) return { companyId, cases: [] as CleanCase[], stored: 0, dropped: 0, note: 'no recent threads' }
  const { cases, dropped, error } = await readCase(input)
  if (error) return { companyId, cases, stored: 0, dropped, note: error }
  let stored = 0
  if (opts.write) for (const c of cases) { await storeCase(input, c); stored++ }
  return { companyId, cases, stored, dropped, note: null }
}
