/**
 * Dogfood of case sources, thread labels, relevance, case memory, the brief, the document
 * checklists and the rounds against a real database:
 * every query, every write and every route, on test records that are removed at the end.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/dogfood-case-sources.mts lib
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/dogfood-case-sources.mts http http://127.0.0.1:3117
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/dogfood-case-sources.mts clean
 *
 * lib   seeds two companies, eight threads and two cases under fixed ids on `.invalid` domains,
 *       then walks the stores: rule labels, proposals, pick / conflict / move / exclude / restore,
 *       a private thread, a person's label, relevance and renewal season, Today › Mail's one read
 *       against the same answer worked out in code for every mailbox, an agent's turn with
 *       evidence, the resume point, a person's note, the brief in five parts, a document
 *       checklist on a line that has none (started, filled, confirmed, removed), a person's calls
 *       on its documents, the rounds (every email as one move, the insurer's chain, a next
 *       step drafted once from its template, a person's call on an email), the case worker's
 *       guard, Combine (a case from ticked threads, a named insurer per thread, Run) and the
 *       ingest hook.
 * http  seeds the same records and walks the ten routes with a signed-in session (the dev
 *       server must run on the same database: API_GATE_MODE=log-only npx next dev -p 3117).
 * clean removes the test records, for a run that was cut short.
 *
 * No model is called. A database that is not local is refused without --live.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { createSession } from '@/lib/auth/session'
import { directory, depositMessages } from '@/lib/admin/k/deposit'
import { storeCase, type CaseInput } from '@/lib/casework/run'
import type { CleanCase } from '@/lib/casework/clean'
import {
  CaseError, attachable, companyRelevance, excludeThread, labelThreadsByRule, loadSources, pickThread, restoreThread, setLabel, setSide,
} from '@/lib/cases/sources-store'
import { addPersonNote, loadCaseState, recordTurn, setNoteStatus } from '@/lib/cases/memory-store'
import { mailByLabel } from '@/lib/cases/mail-store'
import { addItem, addList, confirmList, editItem, listChecklists, loadBrief, setCaseLine, setCheck, type CaseBriefView } from '@/lib/cases/brief-store'
import { checklistLine } from '@/lib/cases/checklist'
import { loadRounds, setCall } from '@/lib/cases/rounds-store'
import { draftStep, runSteps } from '@/lib/cases/rounds-draft'
import { combinePreview, combineThreads } from '@/lib/cases/combine-store'
import { PRODUCT_LINES } from '@/lib/product-lines'
import { labelled, mailView, type MailRelevance, type MailRow } from '@/lib/cases/mail'
import { RELEVANCE, relevanceOf } from '@/lib/cases/relevance'
import { LABELS, type Label } from '@/lib/cases/labels'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { SB_URL, sbHeaders } from '@/lib/sb'
import { fetchAllRows, PAGE } from '@/lib/postgrest-all'

type Row = Record<string, any>

const [mode = 'lib', ...rest] = process.argv.slice(2).filter(a => a !== '--live')
const live = process.argv.includes('--live')
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://missing').host
const local = /^(127\.0\.0\.1|localhost)(:|$)/.test(host)

const u = (n: number) => `d09f00d0-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLIENT = u(1), INSURER = u(2), SECOND = u(3), POLICY = u(5)
const W1 = u(11), W2 = u(12)
const T = { renewal: u(21), insurer: u(22), movement: u(23), old: u(24), hidden: u(25), other_case: u(26), pantry: u(27), fresh: u(28), ask: u(61), first: u(62), second: u(63) }
const M = { client: u(31), trs: u(32), ask: u(33), quote: u(34), movement: u(35), old: u(36), hidden: u(37), timeline: u(38), pantry: u(39), later: u(40), fresh: u(41), terms: u(42), reask: u(43), c_ask: u(71), c_req1: u(72), c_quote1: u(73), c_req2: u(74), c_quote2: u(75) }
const COMPANIES = [CLIENT, INSURER, SECOND], THREADS = Object.values(T), CASES = [W1, W2]
const ME = 'dogfood.staff@trade-risksol.com', COLLEAGUE = 'dogfood.colleague@trade-risksol.com'
const HR = 'hr@dogfood-client.invalid', UW = 'uw@dogfood-insurer.invalid', DESK = 'desk@dogfood-market.invalid'
const SECOND_NAME = 'Dogfood Second Insurer (test)'
const CLIENT_NAME = 'Dogfood Client Pte Ltd (test)'
const NOWHERE = u(99)

const today = new Date().toISOString().slice(0, 10)
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
const quiet = { Prefer: 'return=minimal' }
const put = (table: string, rows: Row[]) => sb(table, { method: 'POST', headers: quiet, body: JSON.stringify(rows) })
const list = (ids: readonly string[]) => `in.(${ids.join(',')})`

// ── checks ────────────────────────────────────────────────────────────────────────────────────

let passed = 0
const failed: string[] = []
function ok(name: string, cond: unknown, got?: unknown) {
  if (cond) { passed++; console.log(`  ok    ${name}`); return }
  failed.push(name)
  console.log(`  FAIL  ${name}${got === undefined ? '' : `\n        got ${JSON.stringify(got)}`}`)
}
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()
/** The status a store call is refused with, or 0 when it went through. */
async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; error: CaseError | null }> {
  try { await fn(); return { status: 0, error: null } } catch (e) { return e instanceof CaseError ? { status: e.status, error: e } : { status: -1, error: null } }
}

// ── Today › Mail worked out in code ───────────────────────────────────────────────────────────

/**
 * What today_mail must answer, from the rules in code: canSeeThread (visibility.ts), relevanceOf
 * (relevance.ts) and mailView (mail.ts) over every thread. Slow by design; it is the reference.
 */
async function mailInCode(): Promise<{ mailboxes: string[]; rowsFor: (viewer: string | null) => Promise<MailRow[]> }> {
  const all = <R = Row>(path: string) => fetchAllRows<R>(`${SB_URL}/rest/v1/${path}`, sbHeaders())
  const [threads, open, dir] = await Promise.all([
    all(`email_threads?deleted_at=is.null&select=id,subject,display_subject,company_id,last_message_at,label,label_by,label_basis,label_at&order=last_message_at.desc.nullslast`),
    all(`work_items?closed_at=is.null&select=id,title,work_item_threads(thread_id)`),
    directory(true),
  ])
  const held = new Set<string>(), mailboxes = new Set<string>()
  for (let offset = 0; ; offset += PAGE) {
    const rows = await sb<Row[]>(`email_thread_aliases?select=thread_id,mailbox&order=mailbox,gmail_thread_id&limit=${PAGE}&offset=${offset}`)
    for (const r of rows) { held.add(r.thread_id); mailboxes.add(String(r.mailbox).toLowerCase()) }
    if (rows.length < PAGE) break
  }
  const onOpen = new Map<string, { id: string; title: string | null }>()
  for (const w of open) for (const l of w.work_item_threads ?? []) onOpen.set(l.thread_id, { id: w.id, title: w.title ?? null })
  const rowsFor = async (viewer: string | null) => {
    const mine = await visibleThreadIds(Array.from(held), viewer)
    return threads.filter(t => !held.has(t.id) || mine.has(t.id)).map((t): MailRow => {
      const { label, set_by } = labelled(t as { subject: string | null })
      return {
        id: t.id, subject: t.display_subject ?? t.subject ?? null, last_message_at: t.last_message_at ?? null,
        company: t.company_id ? { id: t.company_id, name: dir.byId.get(t.company_id)?.company_name ?? null } : null,
        label, set_by, relevance: relevanceOf({ lastMessageAt: t.last_message_at, label, onOpenCase: onOpen.has(t.id) }, today),
        case: onOpen.get(t.id) ?? null,
      }
    })
  }
  return { mailboxes: Array.from(mailboxes), rowsFor }
}

// ── test records ──────────────────────────────────────────────────────────────────────────────

async function caseIds(): Promise<string[]> {
  const made = await sbTry<Row[]>(`work_items?company_id=${list(COMPANIES)}&select=id`, [])
  return Array.from(new Set([...CASES, ...made.map(w => w.id as string)]))
}

async function clean(): Promise<void> {
  const cases = await caseIds()
  const del = (path: string) => sb(path, { method: 'DELETE', headers: quiet })
  await del(`company_ledger?company_id=${list(COMPANIES)}`)
  await del(`company_ledger?group_id=${list(COMPANIES)}`)
  // A step's unsent email, and the contact row made for its recipient.
  await sb(`work_items?id=${list(cases)}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ draft_id: null }) })
  await del(`ai_drafts?work_item_id=${list(cases)}`)
  await del(`contacts?company_id=${list(COMPANIES)}`)
  for (const t of ['work_item_notes', 'work_item_reads', 'work_item_thread_excluded', 'work_item_events', 'work_item_threads']) await del(`${t}?work_item_id=${list(cases)}`)
  await del(`work_item_thread_excluded?thread_id=${list(THREADS)}`)
  await del(`work_item_threads?thread_id=${list(THREADS)}`)
  await del(`work_items?id=${list(cases)}`)
  for (const t of ['thread_vectors', 'thread_insurers', 'email_thread_aliases', 'email_attachments', 'email_participants', 'email_messages']) await del(`${t}?thread_id=${list(THREADS)}`)
  await del(`email_threads?id=${list(THREADS)}`)
  await del(`policies?id=eq.${POLICY}`)
  await del(`companies?id=${list(COMPANIES)}`)
  // A checklist this run started: its documents and the calls on them go with it.
  await del(`line_checklists?updated_by=eq.${enc(ME)}`)
}

/** How many test records are left, by table. Empty after a clean. */
async function leftovers(): Promise<Record<string, number>> {
  const cases = await caseIds()
  const count = async (path: string) => (await sbTry<Row[]>(path, [])).length
  const out: Record<string, number> = {
    companies: await count(`companies?id=${list(COMPANIES)}&select=id`),
    policies: await count(`policies?id=eq.${POLICY}&select=id`),
    email_threads: await count(`email_threads?id=${list(THREADS)}&select=id`),
    email_messages: await count(`email_messages?thread_id=${list(THREADS)}&select=id`),
    email_participants: await count(`email_participants?thread_id=${list(THREADS)}&select=id`),
    email_attachments: await count(`email_attachments?thread_id=${list(THREADS)}&select=id`),
    email_thread_aliases: await count(`email_thread_aliases?thread_id=${list(THREADS)}&select=thread_id`),
    thread_insurers: await count(`thread_insurers?thread_id=${list(THREADS)}&select=id`),
    work_items: await count(`work_items?or=(id.${list(CASES)},company_id.${list(COMPANIES)})&select=id`),
    work_item_threads: await count(`work_item_threads?or=(work_item_id.${list(cases)},thread_id.${list(THREADS)})&select=thread_id`),
    work_item_thread_excluded: await count(`work_item_thread_excluded?or=(work_item_id.${list(cases)},thread_id.${list(THREADS)})&select=thread_id`),
    work_item_events: await count(`work_item_events?work_item_id=${list(cases)}&select=id`),
    work_item_notes: await count(`work_item_notes?work_item_id=${list(cases)}&select=id`),
    work_item_reads: await count(`work_item_reads?work_item_id=${list(cases)}&select=message_id`),
    ai_drafts: await count(`ai_drafts?work_item_id=${list(cases)}&select=id`),
    contacts: await count(`contacts?or=(company_id.${list(COMPANIES)},email.${list([HR, UW, DESK])})&select=id`),
    thread_vectors: await count(`thread_vectors?thread_id=${list(THREADS)}&select=thread_id`),
    company_ledger: await count(`company_ledger?or=(company_id.${list(COMPANIES)},group_id.${list(COMPANIES)})&select=id`),
    line_checklists: await count(`line_checklists?updated_by=eq.${enc(ME)}&select=line`),
    line_checklist_items: await count(`line_checklist_items?updated_by=eq.${enc(ME)}&select=id`),
  }
  return Object.fromEntries(Object.entries(out).filter(([, n]) => n > 0))
}

const thread = (id: string, company: string, subject: string, days: number): Row => ({ id, gmail_thread_id: `dogfood-${id.slice(-2)}`, company_id: company, subject, last_message_at: ago(days) })
const message = (id: string, threadId: string, direction: 'inbound' | 'outbound', from: string, subject: string, body: string, days: number): Row =>
  ({ id, thread_id: threadId, gmail_message_id: `dogfood-${id.slice(-2)}`, direction, from_address: from, subject, body_text: body, sent_at: ago(days) })
const person = (messageId: string, threadId: string, email: string, role: 'from' | 'to' | 'cc'): Row => ({ message_id: messageId, thread_id: threadId, email, role })

async function seed(): Promise<void> {
  await clean()
  await put('companies', [
    { id: CLIENT, company_name: CLIENT_NAME, kind: 'client', domain: 'dogfood-client.invalid', domains: ['dogfood-client.invalid'], owner_emails: [] },
    { id: INSURER, company_name: 'Dogfood Insurer (test)', kind: 'insurer', domain: 'dogfood-insurer.invalid', domains: ['dogfood-insurer.invalid'], owner_emails: [] },
    { id: SECOND, company_name: SECOND_NAME, kind: 'insurer', domain: 'dogfood-second.invalid', domains: ['dogfood-second.invalid'], owner_emails: [] },
  ])
  await put('policies', [{ id: POLICY, company_id: CLIENT, policy_number: 'GHS-778899', end_date: new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10) }])
  await put('email_threads', [
    thread(T.renewal, CLIENT, 'Renewal of Group Hospital & Surgical GHS-778899', 5),
    thread(T.insurer, INSURER, 'RE: Quotation for Dogfood Client - Group Hospital & Surgical', 3),
    thread(T.movement, CLIENT, 'Addition of 2 new staff - November', 10),
    thread(T.old, CLIENT, 'Claim for hospitalisation - J Tan', 120),
    thread(T.hidden, CLIENT, 'Renewal budget - confidential', 2),
    thread(T.other_case, CLIENT, 'GHS-778899 renewal timeline', 1),
    thread(T.pantry, CLIENT, 'Office pantry snacks', 8),
  ])
  await put('thread_insurers', [{ thread_id: T.insurer, insurer_company_id: INSURER, client_company_id: CLIENT, via: 'sender_domain' }])
  await put('email_thread_aliases', [{ mailbox: COLLEAGUE, gmail_thread_id: 'dogfood-25', thread_id: T.hidden }])
  await put('email_messages', [
    message(M.client, T.renewal, 'inbound', `HR <${HR}>`, 'Renewal of Group Hospital & Surgical GHS-778899', 'Please keep the same panel of clinics for the renewal. Our budget is capped at last year\'s premium.', 6),
    message(M.trs, T.renewal, 'outbound', ME, 'RE: Renewal of Group Hospital & Surgical GHS-778899', 'Noted, we will approach the insurers this week.', 5),
    message(M.ask, T.insurer, 'outbound', ME, 'Quotation for Dogfood Client - Group Hospital & Surgical', 'Please quote the renewal on the expiring terms. Census attached.', 4),
    message(M.quote, T.insurer, 'inbound', `Underwriting <${UW}>`, 'RE: Quotation for Dogfood Client - Group Hospital & Surgical', 'We can hold the rates if the loss ratio stays under 60%. Quotation attached.', 3),
    message(M.movement, T.movement, 'inbound', HR, 'Addition of 2 new staff - November', 'Please add the two employees in the attached list from 1 November.', 10),
    message(M.old, T.old, 'inbound', HR, 'Claim for hospitalisation - J Tan', 'J Tan was admitted on Monday and needs a letter of guarantee from the hospital.', 120),
    message(M.hidden, T.hidden, 'inbound', HR, 'Renewal budget - confidential', 'The board has approved a 5% increase at most. Please do not share this figure.', 2),
    message(M.timeline, T.other_case, 'inbound', HR, 'GHS-778899 renewal timeline', 'We need the renewal terms two weeks before expiry.', 1),
    message(M.pantry, T.pantry, 'inbound', HR, 'Office pantry snacks', 'Lunch on Friday is at the usual place.', 8),
  ])
  await put('email_participants', [
    person(M.client, T.renewal, HR, 'from'), person(M.client, T.renewal, ME, 'to'),
    person(M.trs, T.renewal, ME, 'from'), person(M.trs, T.renewal, HR, 'to'),
    person(M.ask, T.insurer, ME, 'from'), person(M.ask, T.insurer, UW, 'to'),
    person(M.quote, T.insurer, UW, 'from'), person(M.quote, T.insurer, ME, 'to'),
    person(M.hidden, T.hidden, HR, 'from'), person(M.hidden, T.hidden, COLLEAGUE, 'to'),
  ])
  await put('email_attachments', [{ message_id: M.quote, thread_id: T.insurer, filename: 'Quotation_Dogfood_GHS.pdf' }])
  await put('work_items', [
    { id: W1, company_id: CLIENT, client_name: CLIENT_NAME, case_type: 'renewal', title: 'Group Hospital & Surgical renewal 2027', policy_number: 'GHS-778899', status: 'trs_to_act', evidence: [] },
    { id: W2, company_id: CLIENT, client_name: CLIENT_NAME, case_type: 'claim', title: 'Hospitalisation claim - J Tan', policy_number: null, status: 'waiting_insurer', evidence: [] },
  ])
  // The reader put the colleague's private thread on the renewal; a person picked the timeline onto the claim.
  await put('work_item_threads', [
    { work_item_id: W1, thread_id: T.hidden, side: 'client', joined_by: null, joined_evidence: null },
    { work_item_id: W2, thread_id: T.other_case, side: 'client', joined_by: 'person', joined_evidence: COLLEAGUE },
  ])
  await directory(true)
}

const labels = async () => new Map((await sb<Row[]>(`email_threads?id=${list(THREADS)}&select=id,label,label_rule,label_by,label_basis`)).map(t => [t.id as string, t]))
const links = async (workItemId: string) => sb<Row[]>(`work_item_threads?work_item_id=eq.${workItemId}&select=thread_id,side,joined_by,joined_evidence`)
const events = async (workItemId: string) => (await sb<Row[]>(`work_item_events?work_item_id=eq.${workItemId}&select=id,kind,actor,detail&order=created_at.asc`))
const calls = async (workItemId: string) => sb<Row[]>(`work_item_checklist?work_item_id=eq.${workItemId}&select=item_id,status,message_id,filename,found,rejected,actor`)
/** A line of insurance with no checklist, to start one on: the lists staff keep are never written to. */
async function freeLine(): Promise<string | null> {
  const taken = new Set((await sb<Row[]>('line_checklists?select=line&limit=200')).map(l => l.line as string))
  return [...PRODUCT_LINES].reverse().map(p => p.slug).find(s => checklistLine(s) === s && !taken.has(s)) ?? null
}
const part = (v: CaseBriefView, p: string) => v.brief.rows.filter(r => r.part === p)
const notes = async (workItemId: string) => sb<Row[]>(`work_item_notes?work_item_id=eq.${workItemId}&select=id,section,text,quote,message_id,thread_id,author,author_kind,status,superseded_by,rejected_by&order=created_at.asc`)

// ── the stores ────────────────────────────────────────────────────────────────────────────────

async function walkStores(): Promise<void> {
  console.log('\nLabels by rule')
  const later: string[] = [T.fresh, T.ask, T.first, T.second]
  const seven = THREADS.filter(t => !later.includes(t))
  const first = await labelThreadsByRule(seven)
  let L = await labels()
  const label = (id: string) => L.get(id)?.label
  ok('seven threads labelled', first.labelled === 7 && first.kept === 0, first)
  ok('renewal subject → renewal', label(T.renewal) === 'renewal' && label(T.hidden) === 'renewal' && label(T.other_case) === 'renewal', [label(T.renewal), label(T.hidden), label(T.other_case)])
  ok("quotation subject with an insurer's quotation file → quote_received", label(T.insurer) === 'quote_received' && /insurer file/.test(L.get(T.insurer)?.label_basis ?? ''), L.get(T.insurer))
  ok('addition of staff → member_movement', label(T.movement) === 'member_movement', label(T.movement))
  ok('claim subject → claim', label(T.old) === 'claim', label(T.old))
  ok('no rule matched → other', label(T.pantry) === 'other', label(T.pantry))
  ok('label_by is rule', seven.every(id => L.get(id)?.label_by === 'rule'))
  const again = await labelThreadsByRule(seven)
  ok('second run changes nothing', again.labelled === 7 && again.changed === 0, again)

  console.log('\nProposals for the renewal case')
  // Vectors by hand (no model): the renewal, insurer and private threads point one way, the pantry another, the movement between them.
  const axis = (x: number, y: number) => `[${[x, y, ...Array(382).fill(0)].join(',')}]`
  const vector = (id: string, x: number, y: number): Row => ({ thread_id: id, model: 'dogfood', text_hash: `dogfood-${id.slice(-2)}`, embedding: axis(x, y) })
  await put('thread_vectors', [vector(T.renewal, 1, 0), vector(T.insurer, 1, 0), vector(T.hidden, 1, 0), vector(T.pantry, 0, 1), vector(T.movement, 0.8, 0.6)])
  let s = await loadSources(W1, ME, today)
  ok('nothing picked yet, the private thread counted', s.picked.length === 0 && s.hidden === 1, { picked: s.picked.length, hidden: s.hidden })
  ok('proposed: policy number first (newest first), then subject', s.proposed.map(p => p.id).join() === [T.other_case, T.renewal, T.insurer].join(), s.proposed.map(p => [p.subject, p.reason]))
  ok('reasons: policy_number, policy_number, subject', s.proposed.map(p => p.reason).join() === 'policy_number,policy_number,subject', s.proposed.map(p => p.reason))
  ok('the thread on the claim names that case', s.proposed[0]?.onCase?.id === W2, s.proposed[0]?.onCase)
  ok('insurer thread naming the client is on the insurer side', s.proposed.find(p => p.id === T.insurer)?.side === 'insurer')
  ok('recent: the two unrelated threads, newest first (a private thread on the case orders nothing)', s.recent.map(c => c.id).join() === [T.pantry, T.movement].join(), s.recent.map(c => c.subject))
  ok('older than 90 days listed apart', s.older.map(c => c.id).join() === T.old, s.older.map(c => c.subject))
  ok('the private thread is in no list', ![...s.proposed, ...s.recent, ...s.older].some(c => c.id === T.hidden))

  console.log('\nA person picks')
  const p1 = await pickThread(W1, T.renewal, ME)
  const p2 = await pickThread(W1, T.insurer, ME)
  ok('client thread picked on the client side', p1.side === 'client' && p1.moved_from === null, p1)
  ok('insurer thread picked on the insurer side', p2.side === 'insurer', p2)
  const held = await refusal(() => pickThread(W1, T.other_case, ME))
  ok('a thread on another case is refused with 409 and that case', held.status === 409 && (held.error?.extra.conflict as Row)?.id === W2, { status: held.status, extra: held.error?.extra })
  const moved = await pickThread(W1, T.other_case, ME, { move: true })
  ok('move takes it from the other case', moved.moved_from === W2 && !(await links(W2)).length, moved)
  ok('the other case records the move', (await events(W2)).some(e => e.kind === 'source_moved' && e.detail?.to === W1))
  ok('a private thread is refused with 403', (await refusal(() => pickThread(W1, T.hidden, ME))).status === 403)
  ok('an unknown thread is 404', (await refusal(() => pickThread(W1, NOWHERE, ME))).status === 404)
  ok('an unknown case is 404', (await refusal(() => pickThread(NOWHERE, T.renewal, ME))).status === 404)
  const mine = await links(W1)
  ok('picks are stored as a person\'s, with who', mine.filter(l => l.joined_by === 'person' && l.joined_evidence === ME).length === 3, mine)

  s = await loadSources(W1, ME, today)
  ok('three picked, one hidden', same(s.picked.map(p => p.id), [T.renewal, T.insurer, T.other_case]) && s.hidden === 1, { picked: s.picked.map(p => p.subject), hidden: s.hidden })
  ok('picked_by and message counts', s.picked.every(p => p.picked_by === ME) && s.picked.find(p => p.id === T.renewal)?.messages === 2, s.picked.map(p => [p.picked_by, p.messages]))
  ok('client bucket: the client, TRS, the client again, in date order', s.buckets.client.map(m => m.message_id).join() === [M.client, M.trs, M.timeline].join() && s.buckets.client.map(m => m.by).join() === 'them,trs,them', s.buckets.client.map(m => [m.from, m.by]))
  ok('insurer bucket: TRS asks, the insurer answers with its file', s.buckets.insurer.map(m => m.message_id).join() === [M.ask, M.quote].join() && s.buckets.insurer[1]?.files.join() === 'Quotation_Dogfood_GHS.pdf', s.buckets.insurer.map(m => [m.from, m.by, m.files]))
  ok('no private words in either bucket', ![...s.buckets.client, ...s.buckets.insurer].some(m => m.thread_id === T.hidden))
  ok('picked threads are not proposed again', !s.proposed.length, s.proposed.map(p => p.subject))
  ok('recent is now ordered by closeness to the picked threads, not by date', s.recent.map(c => c.id).join() === [T.movement, T.pantry].join(), s.recent.map(c => c.subject))
  const near = await sb<Row[]>('rpc/thread_similarity', { method: 'POST', body: JSON.stringify({ p_reference: [T.renewal, T.insurer], p_candidates: [T.movement, T.pantry, T.old] }) })
  const sim = new Map(near.map(r => [r.thread_id as string, r.similarity as number]))
  ok('similarity: 0.8 for the movement, 0 for the pantry, none for a thread with no vector', Math.abs((sim.get(T.movement) ?? -1) - 0.8) < 1e-4 && Math.abs(sim.get(T.pantry) ?? -1) < 1e-4 && !sim.has(T.old), near)
  ok('no reference threads, no scores', !(await sb<Row[]>('rpc/thread_similarity', { method: 'POST', body: JSON.stringify({ p_reference: [], p_candidates: [T.movement] }) })).length)

  console.log('\nExclude, restore, side')
  await excludeThread(W1, T.other_case, ME)
  s = await loadSources(W1, ME, today)
  ok('excluded thread leaves picked and is not offered', !s.picked.some(p => p.id === T.other_case) && !s.proposed.some(p => p.id === T.other_case) && s.excluded.map(e => e.id).join() === T.other_case && s.excluded[0]?.excluded_by === ME, s.excluded)
  await restoreThread(W1, T.other_case, ME)
  s = await loadSources(W1, ME, today)
  ok('restored thread is offered again, on no case', s.proposed.some(p => p.id === T.other_case && p.onCase === null) && !s.excluded.length, s.proposed.map(p => [p.subject, p.onCase]))
  await setSide(W1, T.renewal, 'internal', ME)
  ok('side set on a picked thread', (await links(W1)).find(l => l.thread_id === T.renewal)?.side === 'internal')
  await setSide(W1, T.renewal, 'client', ME)
  ok('side on a thread that is not on the case is 404', (await refusal(() => setSide(W1, T.pantry, 'client', ME))).status === 404)
  ok('exclude and side on a private thread are 403', (await refusal(() => excludeThread(W1, T.hidden, ME))).status === 403 && (await refusal(() => setSide(W1, T.hidden, 'client', ME))).status === 403)
  const kinds = (await events(W1)).map(e => e.kind)
  ok('every choice is on the case\'s events', ['source_picked', 'source_excluded', 'source_restored', 'source_side'].every(k => kinds.includes(k)), kinds)

  console.log('\nA person\'s label')
  const set = await setLabel(T.pantry, 'document', ME)
  ok('label set, the rule\'s answer kept beside it', set.label === 'document' && set.label_rule === 'other', set)
  const kept = await labelThreadsByRule([T.pantry])
  L = await labels()
  ok('the rule does not overwrite a person', kept.kept === 1 && label(T.pantry) === 'document' && L.get(T.pantry)?.label_by === ME, L.get(T.pantry))
  ok('labelling a private thread is 403', (await refusal(() => setLabel(T.hidden, 'claim', ME))).status === 403)
  ok('labelling an unknown thread is 404', (await refusal(() => setLabel(NOWHERE, 'claim', ME))).status === 404)

  console.log('\nRelevance')
  const r = await companyRelevance(CLIENT, ME, today)
  ok('active 3, back burner 3, member movements 1', r.counts.active === 3 && r.counts.back_burner === 3 && r.counts.member_movements === 1, r.counts)
  ok('the private thread is counted, not listed', r.hidden === 1 && r.threads.length === 6 && !r.threads.some(t => t.id === T.hidden), { hidden: r.hidden, listed: r.threads.length })
  ok('an old claim is back burner; a movement is its own group', r.threads.find(t => t.id === T.old)?.relevance === 'back_burner' && r.threads.find(t => t.id === T.movement)?.relevance === 'member_movements')
  ok('a recent thread on no open case is back burner', r.threads.find(t => t.id === T.other_case)?.relevance === 'back_burner')
  ok('renewal season from the policy end date', r.season.on && r.season.basis === 'policy ends' && !!r.season.date, r.season)
  ok('a colleague on the thread sees it', (await companyRelevance(CLIENT, COLLEAGUE, today)).hidden === 0)

  console.log('\nToday › Mail in one read')
  const page = await mailByLabel(ME, { relevance: 'all', label: 'all', limit: 2 }, today)
  ok('a page holds up to the limit and says how many there are', page.threads.length === 2 && page.total > 2 && page.total === page.counts.all && page.counts.all === page.counts.active + page.counts.back_burner + page.counts.member_movements, { rows: page.threads.length, total: page.total, counts: page.counts })
  const seen = await mailByLabel(ME, { relevance: 'all', label: 'all', limit: 20_000 }, today)
  ok('the colleague\'s private thread is not in the read', !seen.threads.some(t => t.id === T.hidden) && seen.threads.some(t => t.id === T.renewal))
  ok('the colleague on it has it', (await mailByLabel(COLLEAGUE, { relevance: 'all', label: 'all', limit: 20_000 }, today)).threads.some(t => t.id === T.hidden))
  const code = await mailInCode()
  const views: { relevance: MailRelevance; label: Label | 'all' }[] = [
    ...(['all', ...RELEVANCE] as MailRelevance[]).map(relevance => ({ relevance, label: 'all' as const })),
    ...LABELS.map(l => ({ relevance: 'all' as const, label: l })),
    { relevance: 'back_burner', label: 'renewal' }, { relevance: 'active', label: 'claim' },
  ]
  // Every mailbox on file, a person with none, a colleague on a private thread, and a cron (null).
  for (const viewer of [...new Set([...code.mailboxes, ME, COLLEAGUE]), null]) {
    const rows = await code.rowsFor(viewer)
    const off: string[] = []
    for (const v of views) {
      const want = mailView(rows, { ...v, limit: 20_000 })
      const got = await mailByLabel(viewer, { ...v, limit: 20_000 }, today)
      if (JSON.stringify(want) !== JSON.stringify(got)) off.push(`${v.relevance}/${v.label}: ${want.total} in code, ${got.total} in the database`)
    }
    const who = viewer == null ? 'a cron' : viewer.startsWith('dogfood.') ? viewer.split('@')[0] : `mailbox ${code.mailboxes.indexOf(viewer) + 1}`
    ok(`the database answers what the code rules answer: ${who}, ${views.length} views`, off.length === 0, off.slice(0, 3))
  }

  console.log('\nAn agent\'s turn')
  const turn = {
    evidence: [
      { thread: T.renewal, quote: 'keep the same panel of clinics' },
      { thread: T.insurer, quote: 'hold the rates if the loss ratio stays under 60%' },
      { thread: T.renewal, quote: 'this sentence is in no email on the case' },
      { thread: T.renewal, quote: 'we will approach the insurers this week' },
    ],
    notes: [
      { section: 'next_step', text: 'Send the census to the insurers', quote: 'we will approach the insurers this week', thread_id: T.renewal },
      { section: 'risk', text: 'Premium may exceed the budget', quote: 'words that were never written', thread_id: T.renewal },
      { section: 'wish', text: 'A note with no source' },
    ],
    readThreadIds: [T.renewal],
  }
  const t1 = await recordTurn(W1, 'case_worker', turn)
  ok('three notes kept: client said, insurer said, next step', t1.kept === 3 && t1.stored === 3, t1)
  ok('two dropped with the reason', same(t1.dropped.map(d => d.reason), ['words not found in the email', 'no source email']), t1.dropped)
  ok('two emails marked read, one event', t1.read === 2 && !!t1.event_id, t1)
  let N = await notes(W1)
  ok('client said holds the client\'s words and their email', N.some(n => n.section === 'client_said' && n.message_id === M.client && n.quote === 'keep the same panel of clinics'), N)
  ok('insurer said holds the insurer\'s words and their email', N.some(n => n.section === 'insurer_said' && n.message_id === M.quote))
  ok('TRS\'s own words are nobody\'s statement', !N.some(n => (n.section === 'client_said' || n.section === 'insurer_said') && n.message_id === M.trs))
  const ledger1 = await sbTry<Row[]>(`company_ledger?source_table=eq.work_item_events&source_id=eq.${t1.event_id}&select=company_id,kind,summary`, [])
  ok('the turn is on the client\'s ledger as counts, without the words', ledger1.length === 1 && ledger1[0].company_id === CLIENT && /3 notes kept/.test(ledger1[0].summary ?? '') && !/panel of clinics/.test(ledger1[0].summary ?? ''), ledger1)
  const t2 = await recordTurn(W1, 'case_worker', turn)
  ok('the same turn again stores nothing new', t2.stored === 0 && (await notes(W1)).length === 3, t2)
  const quietLedger = await sbTry<Row[]>(`company_ledger?source_table=eq.work_item_events&source_id=eq.${t2.event_id}&select=id`, [])
  ok('a turn that left nothing is not on the ledger', quietLedger.length === 0)
  await recordTurn(W1, 'case_worker', { notes: [{ section: 'next_step', text: 'Chase the insurer for final terms', quote: 'hold the rates', thread_id: T.insurer }] })
  N = await notes(W1)
  const steps = N.filter(n => n.section === 'next_step')
  ok('a new next step stands; the old one is superseded by it', steps.length === 2 && steps[0].status === 'superseded' && steps[1].status === 'current' && steps[0].superseded_by === steps[1].id, steps)

  console.log('\nResume')
  let state = await loadCaseState(W1, { agent: 'case_worker', viewer: ME })
  ok('four emails the viewer may see', state.messages.length === 4 && !state.messages.some(m => m.thread_id === T.hidden), state.messages.length)
  ok('the case worker has the insurer thread still to read', state.unread.map(m => m.id).join() === [M.ask, M.quote].join(), state.unread.map(m => m.id))
  ok('next step is the standing one', state.resume.next_step === 'Chase the insurer for final terms', state.resume)
  ok('unread counts cover the hidden thread too', state.resume.unread.new === 3 && state.resume.unread.case_worker === 3, state.resume.unread)
  ok('last touch is the agent\'s turn', state.resume.last?.kind === 'agent_turn' && state.resume.last?.actor === 'case_worker', state.resume.last)
  ok('another agent starts with everything unread', (await loadCaseState(W1, { agent: 'relay', viewer: ME })).unread.length === 4)
  await put('email_messages', [message(M.later, T.renewal, 'inbound', HR, 'RE: Renewal of Group Hospital & Surgical GHS-778899', 'One more thing: please add dental to the quotation.', 0)])
  state = await loadCaseState(W1, { agent: 'case_worker', viewer: ME })
  ok('a new email is unread for the agent that read the thread', state.unread.some(m => m.id === M.later) && state.unread.length === 3, state.unread.map(m => m.id))

  console.log('\nPrivate words')
  await recordTurn(W1, 'case_worker', { notes: [{ section: 'client_said', text: 'Budget rise is capped', quote: 'The board has approved a 5% increase at most', thread_id: T.hidden }] })
  const forMe = (await loadCaseState(W1, { viewer: ME })).notes.find(n => n.thread_id === T.hidden)
  const forThem = (await loadCaseState(W1, { viewer: COLLEAGUE })).notes.find(n => n.thread_id === T.hidden)
  ok('a note from a private thread has its quote withheld', !!forMe && forMe.quote === null && forMe.private === true, forMe)
  ok('the colleague on that thread reads the quote', !!forThem?.quote && !forThem.private, forThem)

  console.log('\nA person\'s note')
  const said = 'CFO asked Nathan by phone for two options: as expiring, and with dental'
  const note = await addPersonNote(W1, ME, { section: 'wish', text: said })
  ok('kept without a source email, as a person\'s', note.author === ME && note.author_kind === 'person' && note.quote === null && note.status === 'current', note)
  const noteEvent = (await events(W1)).filter(e => e.kind === 'note').at(-1)
  const ledger2 = await sbTry<Row[]>(`company_ledger?source_table=eq.work_item_events&source_id=eq.${noteEvent?.id}&select=summary,party,actor`, [])
  ok('the note is on the client\'s ledger in its own words', ledger2.length === 1 && (ledger2[0].summary ?? '').includes(said) && ledger2[0].actor === ME, ledger2)
  ok('the same note again is 409', (await refusal(() => addPersonNote(W1, ME, { section: 'wish', text: said }))).status === 409)
  ok('a note naming an email that is not on the case is 400', (await refusal(() => addPersonNote(W1, ME, { section: 'risk', text: 'x', message_id: M.pantry }))).status === 400)
  await setNoteStatus(W1, note.id, ME, 'rejected')
  ok('rejected: off the brief, on record, with who', (await notes(W1)).find(n => n.id === note.id)?.status === 'rejected' && (await notes(W1)).find(n => n.id === note.id)?.rejected_by === ME)
  await setNoteStatus(W1, note.id, ME, 'current')
  ok('restored', (await notes(W1)).find(n => n.id === note.id)?.status === 'current')
  ok('a note that is not on the case is 404', (await refusal(() => setNoteStatus(W1, NOWHERE, ME, 'rejected'))).status === 404)
  ok('reject and restore are on the events', (await events(W1)).filter(e => e.kind === 'note_rejected' || e.kind === 'note_restored').map(e => e.kind).join() === 'note_rejected,note_restored')

  console.log('\nThe brief')
  await recordTurn(W1, 'case_worker', { notes: [
    { section: 'risk', text: 'Budget is capped at last year\'s premium', quote: 'Our budget is capped at last year\'s premium', thread_id: T.renewal },
    { section: 'success_factor', text: 'Insurers approached this week', quote: 'we will approach the insurers this week', thread_id: T.renewal },
    { section: 'open_question', text: 'Will the loss ratio stay under 60%', quote: 'hold the rates if the loss ratio stays under 60%', thread_id: T.insurer },
    { section: 'wish', text: 'Budget figure stays private', quote: 'Please do not share this figure', thread_id: T.hidden },
  ] })
  let b = await loadBrief(W1, ME)
  ok('five parts in order', b.parts.map(p => p.part).join() === 'communicated,wish,stated,open,next' && b.parts[1].name === 'Client wish list', b.parts)
  const comm = part(b, 'communicated')
  ok('Communicated: the last email to the client, then to the insurer by name', comm.length === 2 && comm[0].who === 'To the client' && comm[0].source?.message_id === M.trs && /^To Dogfood Insurer/.test(comm[1].who ?? '') && comm[1].source?.message_id === M.ask, comm.map(r => [r.who, r.source?.message_id]))
  ok('in TRS\'s own words', /approach the insurers/.test(comm[0].text) && /quote the renewal/.test(comm[1].text), comm.map(r => r.text))
  const wishes = part(b, 'wish')
  ok('a person\'s wish with no email has no source and names the person', wishes.some(r => r.text === said && r.source === null && r.author === ME && r.who === null), wishes)
  const secret = wishes.find(r => r.source?.thread_id === T.hidden)
  ok('a wish from a colleague\'s thread: words and sender withheld', !!secret && secret.private === true && secret.source?.quote === null && secret.source?.from === null, secret)
  const theirs = part(await loadBrief(W1, COLLEAGUE), 'wish').find(r => r.source?.thread_id === T.hidden)
  ok('the colleague on that thread reads them', !!theirs && !theirs.private && theirs.source?.quote === 'Please do not share this figure' && theirs.who === 'Client', theirs)
  const stated = part(b, 'stated')
  ok('a risk the client stated is kept, named and sourced', stated.length === 1 && stated[0].kind === 'Risk' && stated[0].who === 'Client' && stated[0].source?.message_id === M.client, stated)
  ok('an agent\'s reading of TRS\'s own words is left off', b.brief.left_off === 1, b.brief.left_off)
  const open = part(b, 'open')
  ok('an open question says who owes whom, with its date', open.length === 1 && /^TRS owes Dogfood Insurer/.test(open[0].who ?? '') && open[0].source?.message_id === M.quote && !!open[0].date, open)
  const next = part(b, 'next')
  ok('one next step, the current one, with the agent that drafts', next.length === 1 && next[0].text === 'Chase the insurer for final terms' && next[0].who === 'Relay drafts' && next[0].source?.message_id === M.quote, next)
  ok('one row rests on no email', b.brief.unsourced === 1 && b.brief.rows.filter(r => !r.source).length === 1, b.brief.unsourced)
  ok('no row is a summary or an inferred risk: every agent row carries its email', b.brief.rows.every(r => r.source || r.author), b.brief.rows.filter(r => !r.source))
  ok('unknown case is 404', (await refusal(() => loadBrief(NOWHERE, ME))).status === 404)

  console.log('\nLine of insurance')
  ok('read from the case title', b.line?.by === 'title' && b.line?.name === 'Employment Benefits' && b.checklist_applies === true, b.line)
  const claim = await loadBrief(W2, ME)
  ok('a claim runs on no checklist', claim.checklist_applies === false && claim.checklist === null, { applies: claim.checklist_applies, checklist: claim.checklist })
  ok('a line off the list is 400', (await refusal(() => setCaseLine(W1, 'snacks', ME))).status === 400)
  const LINE = await freeLine()
  ok('a line with no checklist to test on', !!LINE, LINE)
  if (!LINE) return
  await setCaseLine(W1, LINE, ME)
  b = await loadBrief(W1, ME)
  ok('a person\'s choice stands over the title', b.line?.line === LINE && b.line?.by === 'person', b.line)
  const basic = (await listChecklists()).find(l => l.line === 'basic')?.items.filter(i => i.active) ?? []
  const needed = basic.filter(i => i.required).length
  ok('the basic documents are on file, Required and Optional', basic.length > 0 && needed > 0 && needed < basic.length, basic.map(i => [i.label, i.required]))
  ok('a line with no list of its own runs on the basic documents', b.checklist?.line === 'basic' && b.checklist.total === basic.length && b.checklist.required === needed && b.checklist.complete === false && b.checklist_applies === true, b.checklist && { line: b.checklist.line, total: b.checklist.total, required: b.checklist.required })

  console.log('\nA checklist in Settings')
  const listsBefore = await listChecklists()
  ok('the lists staff keep are listed', listsBefore.some(l => l.line === 'employee_benefits' && l.name === 'Employment Benefits' && l.items.length > 0) && !listsBefore.some(l => l.line === LINE), listsBefore.map(l => [l.line, l.items.length]))
  ok('a list on no line is 400', (await refusal(() => addList('snacks', ME))).status === 400)
  ok('a document on a line with no list is 404', (await refusal(() => addItem(LINE, { label: 'Quotation', words: ['quotation'] }, ME))).status === 404)
  await addList(LINE, ME)
  await addList(LINE, ME)
  await addItem(LINE, { label: 'Insurer quotation', found_by: 'file', words: ['Quotation'] }, ME)
  await addItem(LINE, { label: 'Client wish list', found_by: 'wish' }, ME)
  await addItem(LINE, { label: 'Signed proposal form', found_by: 'person' }, ME)
  await addItem(LINE, { label: 'Budget paper', found_by: 'file', words: ['budget'] }, ME)
  ok('the same document again is 409', (await refusal(() => addItem(LINE, { label: 'insurer quotation', words: ['quote'] }, ME))).status === 409)
  ok('a document with no name is 400', (await refusal(() => addItem(LINE, { label: ' ', words: ['quote'] }, ME))).status === 400)
  ok('a file document with nothing to find it by is 400', (await refusal(() => addItem(LINE, { label: 'Loss record', found_by: 'file' }, ME))).status === 400)
  ok('an unknown document type is 400', (await refusal(() => addItem(LINE, { label: 'Loss record', doc_types: ['snack_menu'] }, ME))).status === 400)
  let draft = (await listChecklists()).find(l => l.line === LINE)
  ok('one list, four documents in the order added, a draft', draft?.items.map(i => i.label).join() === 'Insurer quotation,Client wish list,Signed proposal form,Budget paper' && draft.confirmed_by === null && draft.updated_by === ME, draft)
  ok('words are kept in lower case', draft?.items[0].words.join() === 'quotation', draft?.items[0])
  const [quotation, wishItem, form, budget] = draft?.items.map(i => i.id) ?? []
  await confirmList(LINE, ME)
  draft = (await listChecklists()).find(l => l.line === LINE)
  ok('confirmed by a person, with when', draft?.confirmed_by === ME && !Number.isNaN(Date.parse(draft?.confirmed_at ?? '')), draft && { by: draft.confirmed_by, at: draft.confirmed_at })
  await editItem(form, { label: 'Signed proposal' }, ME)
  draft = (await listChecklists()).find(l => l.line === LINE)
  ok('an edit returns the list to draft', draft?.confirmed_by === null && draft.items.some(i => i.label === 'Signed proposal'), draft && { by: draft.confirmed_by })
  ok('a rename onto another document is 409', (await refusal(() => editItem(form, { label: 'Budget paper' }, ME))).status === 409)
  ok('a document on no list is 404', (await refusal(() => editItem(NOWHERE, { label: 'Anything' }, ME))).status === 404)
  ok('confirming a line with no list is 404', (await refusal(() => confirmList('snacks', ME))).status === 404)
  const after = await listChecklists()
  ok('no other list was written to, the basic documents among them', listsBefore.some(l => l.line === 'basic') && listsBefore.every(l => { const a = after.find(x => x.line === l.line); return !!a && a.updated_at === l.updated_at && a.confirmed_by === l.confirmed_by && a.items.length === l.items.length }), after.map(l => [l.line, l.updated_at]))

  console.log('\nDocuments on the case')
  await put('email_attachments', [{ message_id: M.hidden, thread_id: T.hidden, filename: 'Budget_Dogfood_2027.xlsx' }])
  b = await loadBrief(W1, ME)
  const doc = (v: CaseBriefView, id: string) => v.checklist?.rows.find(r => r.item_id === id)
  ok('the case runs on the list of its line, the basic documents after it', b.checklist?.line === LINE && b.checklist?.total === 4 + basic.length && b.checklist.rows.slice(0, 4).every(r => r.required) && same(b.checklist.rows.slice(4).map(r => r.item_id), basic.map(i => i.id)), b.checklist && { line: b.checklist.line, total: b.checklist.total, rows: b.checklist.rows.map(r => r.label) })
  ok('a file on the case ticks its document: name, sender, email', doc(b, quotation)?.state === 'found' && doc(b, quotation)?.file?.filename === 'Quotation_Dogfood_GHS.pdf' && doc(b, quotation)?.file?.message_id === M.quote && doc(b, quotation)?.file?.thread_id === T.insurer, doc(b, quotation))
  ok('a client wish on the brief ticks the wish list', doc(b, wishItem)?.state === 'found' && doc(b, wishItem)?.file === null, doc(b, wishItem))
  ok('a document only a person can confirm is missing', doc(b, form)?.state === 'missing', doc(b, form))
  ok('a file in a colleague\'s mailbox is found with its name withheld', doc(b, budget)?.state === 'found' && doc(b, budget)?.private === true && doc(b, budget)?.file?.filename === '' && doc(b, budget)?.file?.from === null, doc(b, budget))
  ok('the colleague reads the file name', doc(await loadBrief(W1, COLLEAGUE), budget)?.file?.filename === 'Budget_Dogfood_2027.xlsx')
  ok('three of the line\'s four ticked, no basic document found, none confirmed, not complete', b.checklist?.ticked === 3 && b.checklist?.confirmed === 0 && b.checklist?.complete === false, b.checklist && { ticked: b.checklist.ticked, confirmed: b.checklist.confirmed })
  await setCheck(W1, quotation, ME, 'confirm')
  b = await loadBrief(W1, ME)
  let C = await calls(W1)
  ok('confirm: the found file goes on record with who confirmed', doc(b, quotation)?.state === 'confirmed' && doc(b, quotation)?.actor === ME && doc(b, quotation)?.file?.filename === 'Quotation_Dogfood_GHS.pdf' && C.length === 1 && C[0].found === true && C[0].message_id === M.quote, { row: doc(b, quotation), C })
  await setCheck(W1, quotation, ME, 'clear')
  ok('undo: back to what code finds, nothing kept', doc(await loadBrief(W1, ME), quotation)?.state === 'found' && (await calls(W1)).length === 0)
  await setCheck(W1, quotation, ME, 'reject')
  b = await loadBrief(W1, ME)
  C = await calls(W1)
  ok('not this file: the finding is turned down and not offered again', doc(b, quotation)?.state === 'missing' && doc(b, quotation)?.file === null && C[0]?.status === null && C[0]?.rejected?.[0]?.filename === 'Quotation_Dogfood_GHS.pdf', { row: doc(b, quotation), C })
  ok('turning down with no finding is 409', (await refusal(() => setCheck(W1, quotation, ME, 'reject'))).status === 409)
  await setCheck(W1, quotation, ME, 'confirm')
  C = await calls(W1)
  ok('a person confirms a document no file was found for', doc(await loadBrief(W1, ME), quotation)?.state === 'confirmed' && C[0]?.found === false && C[0]?.message_id === null, C)
  await setCheck(W1, quotation, ME, 'clear')
  C = await calls(W1)
  ok('undo keeps the turned-down file on record', C.length === 1 && C[0].status === null && C[0].rejected.length === 1 && doc(await loadBrief(W1, ME), quotation)?.state === 'missing', C)
  await setCheck(W1, quotation, ME, 'not_needed')
  await setCheck(W1, form, ME, 'confirm')
  await setCheck(W1, budget, COLLEAGUE, 'confirm')
  b = await loadBrief(W1, ME)
  ok('the line\'s documents ticked, the basic Required ones missing: not complete', b.checklist?.complete === false && b.checklist?.ticked === 4 && b.checklist?.confirmed === 3 && b.checklist.required_ticked === 4 && doc(b, quotation)?.state === 'not_needed', b.checklist && { ticked: b.checklist.ticked, confirmed: b.checklist.confirmed, required_ticked: b.checklist.required_ticked, complete: b.checklist.complete })
  for (const i of basic.filter(x => x.required)) await setCheck(W1, i.id, ME, 'confirm')
  b = await loadBrief(W1, ME)
  ok('every Required document ticked: complete with the Optional ones missing', b.checklist?.complete === true && b.checklist.required_ticked === b.checklist.required && b.checklist.required === 4 + needed && b.checklist.ticked === 4 + needed && basic.filter(i => !i.required).every(i => doc(b, i.id)?.state === 'missing' && doc(b, i.id)?.required === false), b.checklist && { ticked: b.checklist.ticked, required: b.checklist.required, required_ticked: b.checklist.required_ticked, complete: b.checklist.complete })
  ok('a confirmed file in a colleague\'s mailbox stays withheld', doc(b, budget)?.state === 'confirmed' && doc(b, budget)?.private === true && doc(b, budget)?.file?.filename === '' && doc(b, budget)?.actor === COLLEAGUE, doc(b, budget))
  ok('a document that is not on the list is 404', (await refusal(() => setCheck(W1, NOWHERE, ME, 'confirm'))).status === 404)
  ok('a call on a case with no checklist is 404', (await refusal(() => setCheck(W2, quotation, ME, 'confirm'))).status === 404)
  await editItem(form, { active: false }, ME)
  b = await loadBrief(W1, ME)
  ok('a retired document leaves the case\'s list; its call stays on record', b.checklist?.total === 3 + basic.length && !doc(b, form) && (await calls(W1)).some(c => c.item_id === form && c.status === 'confirmed'), b.checklist && { total: b.checklist.total })
  const E = await events(W1)
  ok('every call and the line choice are on the case\'s events', E.filter(e => e.kind === 'checklist').length === 8 + needed && E.filter(e => e.kind === 'line').length === 1 && E.some(e => e.detail?.note === 'Finding turned down: Insurer quotation') && E.some(e => /^Line set: /.test(e.detail?.note ?? '')), E.filter(e => e.kind === 'checklist' || e.kind === 'line').map(e => e.detail?.note))
  await setCaseLine(W1, null, ME)
  b = await loadBrief(W1, ME)
  ok('clearing the choice returns the case to its title\'s line', b.line?.by === 'title' && b.checklist?.line === 'employee_benefits' && (b.checklist?.total ?? 0) > 0, b.line)

  console.log('\nRounds')
  const UNDERWRITER = 'Dogfood Insurer (test)'
  const CHANGE = `change:${M.later}:${UNDERWRITER}`, TERMS = `quote:${M.quote}:${UNDERWRITER}`
  let rv = await loadRounds(W1, ME)
  const moveOf = (id: string) => rv.rounds.flatMap(x => x.moves).find(m => m.message_id === id)
  const draftRow = async (id: string) => (await sb<Row[]>(`ai_drafts?id=eq.${id}&select=id,to_email,cc,subject,body,status,thread_id,party,pair_id,draft_class,generated_by,attachments,context_used`))[0]
  const drafts = async () => sb<Row[]>(`ai_drafts?work_item_id=eq.${W1}&select=id,pair_id&order=created_at.asc`)
  ok('every email is one move: the client asks, TRS asks the insurer, the insurer quotes', [M.client, M.trs, M.ask, M.quote].map(id => moveOf(id)?.move).join() === 'ask,note,request,quote' && moveOf(M.quote)?.insurer === UNDERWRITER, rv.rounds[0]?.moves.map(m => [m.by, m.move, m.insurer]))
  ok('round 1: the insurer was asked and has replied with terms', rv.rounds[0]?.chains.length === 1 && rv.rounds[0].chains[0].insurer === UNDERWRITER && rv.rounds[0].chains[0].state === 'replied' && !!rv.rounds[0].chains[0].asked_at && !rv.rounds[0].chains[0].sent_at, rv.rounds[0]?.chains)
  ok('the client\'s change after the insurer was asked opens round 2', rv.rounds.length === 2 && rv.rounds[1].moves.map(m => m.message_id).join() === M.later && moveOf(M.later)?.move === 'change' && rv.rounds[1].chains[0]?.state === 'to_ask', rv.rounds[1])
  ok('a colleague\'s email is a move with no words', moveOf(M.hidden)?.private === true && moveOf(M.hidden)?.text === '' && !moveOf(M.hidden)?.files.length, moveOf(M.hidden))
  ok('two next steps: the change to the insurer first, then the terms to the client', rv.steps.map(x => x.id).join('|') === [CHANGE, TERMS].join('|') && rv.steps.map(x => [x.act, x.to, x.agent, x.draft].join()).join('|') === 'draft,insurer,Insurer agent,forward_change|draft,client,Client agent,relay_quote', rv.steps.map(x => [x.id, x.act, x.to, x.agent, x.draft]))
  ok('no step has an unsent email yet', !Object.keys(rv.drafted).length && rv.moves.insurer.some(x => x.move === 'quote') && rv.names.move.change === 'Change', rv.drafted)

  ok('a step that is not waiting is 404', (await refusal(() => draftStep(W1, `quote:${M.client}:`, ME))).status === 404)
  ok('an unknown case is 404', (await refusal(() => draftStep(NOWHERE, CHANGE, ME))).status === 404 && (await refusal(() => loadRounds(NOWHERE, ME))).status === 404)
  const stepOne = await draftStep(W1, CHANGE, ME)
  let dr = await draftRow(stepOne.draft_id)
  ok('the change is drafted to the underwriter, on the insurer\'s thread', stepOne.to === UW && !stepOne.existing && dr.to_email === UW && !dr.cc && dr.thread_id === T.insurer && dr.status === 'pending' && dr.party === 'insurer' && dr.draft_class === 'forward', { to: dr.to_email, cc: dr.cc, thread: dr.thread_id, party: dr.party, class: dr.draft_class })
  ok('in the client\'s own words, from the template', dr.generated_by === 'template' && /has revised their request/.test(dr.body) && /please add dental to the quotation/.test(dr.body) && /revised terms/.test(dr.body) && /^Re: /i.test(dr.subject), { subject: dr.subject, body: dr.body })
  ok('it records the insurer agent, the step and the email it rests on', dr.context_used?.agent === 'insurer_agent' && dr.context_used?.step === CHANGE && dr.context_used?.kind === 'forward_change' && dr.context_used?.message_id === M.later && String(dr.context_used?.basis ?? '').includes(ME), dr.context_used)
  ok('it is the case\'s unsent email, as the case had none', (await sb<Row[]>(`work_items?id=eq.${W1}&select=draft_id`))[0]?.draft_id === stepOne.draft_id)
  const stepAgain = await draftStep(W1, CHANGE, ME)
  ok('the same step again writes no second email', stepAgain.existing && stepAgain.draft_id === stepOne.draft_id && stepAgain.to === UW && (await drafts()).length === 1, stepAgain)

  const stepTwo = await draftStep(W1, TERMS, ME)
  dr = await draftRow(stepTwo.draft_id)
  ok('the terms are drafted to the client\'s HR, on the client\'s thread, with the insurer\'s file', stepTwo.to === HR && dr.to_email === HR && !dr.cc && dr.thread_id === T.renewal && dr.party === 'client' && dr.attachments?.length === 1 && dr.attachments[0].filename === 'Quotation_Dogfood_GHS.pdf' && dr.context_used?.agent === 'client_agent' && dr.context_used?.step === TERMS, { to: dr.to_email, thread: dr.thread_id, files: dr.attachments, context: dr.context_used })
  const pair = await drafts()
  ok('it sits beside the first: one pair, the first still the case\'s own', pair.length === 2 && !!pair[0].pair_id && pair[0].pair_id === pair[1].pair_id && (await sb<Row[]>(`work_items?id=eq.${W1}&select=draft_id`))[0]?.draft_id === stepOne.draft_id, pair)
  rv = await loadRounds(W1, ME)
  ok('each step shows its unsent email', rv.drafted[CHANGE] === stepOne.draft_id && rv.drafted[TERMS] === stepTwo.draft_id, rv.drafted)
  ok('no private words reach a draft', !(await sb<Row[]>(`ai_drafts?work_item_id=eq.${W1}&select=body`)).some(x => /5% increase/.test(x.body)))

  await setCall(W1, M.quote, { by: 'insurer', move: 'question' }, ME)
  rv = await loadRounds(W1, ME)
  ok('a person\'s call replaces the rule\'s reading, which is kept beside it', moveOf(M.quote)?.move === 'question' && moveOf(M.quote)?.rule === 'quote' && moveOf(M.quote)?.set_by === 'person', moveOf(M.quote))
  ok('the steps follow the call: the insurer\'s question is owed to the client', rv.steps.map(x => x.id).join('|') === [CHANGE, `question:${M.quote}:${UNDERWRITER}`].join('|'), rv.steps.map(x => x.id))
  await setCall(W1, M.quote, null, ME)
  rv = await loadRounds(W1, ME)
  ok('handing the email back restores the rule', moveOf(M.quote)?.move === 'quote' && moveOf(M.quote)?.set_by === 'rule' && rv.steps.map(x => x.id).join('|') === [CHANGE, TERMS].join('|'), moveOf(M.quote))
  ok('an email that is not on the case is 404', (await refusal(() => setCall(W1, M.movement, { by: 'client', move: 'ask' }, ME))).status === 404)
  ok('an email in a colleague\'s mailbox is 403', (await refusal(() => setCall(W1, M.hidden, { by: 'client', move: 'ask' }, ME))).status === 403)
  ok('TRS\'s own email cannot be given to the client, nor an insurer\'s email a client\'s move', (await refusal(() => setCall(W1, M.ask, { by: 'client', move: 'ask' }, ME))).status === 400 && (await refusal(() => setCall(W1, M.quote, { by: 'insurer', move: 'ask' }, ME))).status === 400)
  const calls2 = (await events(W1)).filter(e => e.kind === 'move')
  ok('both calls are on the case\'s events, with who made them', calls2.length === 2 && calls2.every(e => e.actor === ME && e.detail?.message_id === M.quote && e.detail?.rule === 'quote') && calls2[0].detail?.note === 'Email set to Insurer: Question' && calls2[1].detail?.note === 'Email handed back to the rule', calls2.map(e => e.detail))

  await put('email_messages', [message(M.reask, T.insurer, 'outbound', ME, 'RE: Quotation for Dogfood Client - Group Hospital & Surgical', 'Our client has asked to add dental. Please requote on that basis and let us have your revised terms.', 0)])
  await put('email_participants', [person(M.reask, T.insurer, ME, 'from'), person(M.reask, T.insurer, UW, 'to')])
  rv = await loadRounds(W1, ME)
  ok('once TRS has written to the insurer the change is no longer owed: round 2 waits on the insurer', rv.rounds[1]?.chains[0]?.state === 'asked' && !rv.steps.some(x => x.id === CHANGE) && rv.steps.some(x => x.id === `waiting::${UNDERWRITER}` && x.act === 'wait'), { chains: rv.rounds[1]?.chains, steps: rv.steps.map(x => x.id) })
  ok('a step that has moved on is not drafted', (await refusal(() => draftStep(W1, CHANGE, ME))).status === 404)
  ok('a step that only waits has no email', (await refusal(() => draftStep(W1, `waiting::${UNDERWRITER}`, ME))).status === 400)
  await sb(`work_items?id=eq.${W1}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ closed_at: new Date().toISOString() }) })
  ok('a closed case drafts nothing', (await refusal(() => draftStep(W1, TERMS, ME))).status === 400)
  await sb(`work_items?id=eq.${W1}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ closed_at: null }) })

  console.log('\nThe case worker\'s guard')
  await pickThread(W2, T.other_case, COLLEAGUE)
  await excludeThread(W2, T.movement, COLLEAGUE)
  const can = await attachable(W2, [T.old, T.other_case, T.renewal, T.movement])
  ok('free and own threads may attach; a person\'s pick elsewhere is held; an excluded thread stays off',
    same(can.keep, [T.old, T.other_case]) && can.held.get(T.renewal) === W1 && can.excluded.join() === T.movement, { keep: can.keep, held: Array.from(can.held), excluded: can.excluded })
  const input: CaseInput = {
    companyId: CLIENT, mode: 'client', companyName: CLIENT_NAME, prompt: '', files: new Map(),
    ctx: { threadIds: THREADS, addresses: [HR, UW], attachments: [], text: '', staff: [] },
    threadSide: new Map([[T.old, 'client'], [T.other_case, 'client'], [T.renewal, 'client'], [T.movement, 'client']]),
  }
  const read = (over: Partial<CleanCase>): CleanCase => ({
    item_id: null, client: CLIENT_NAME, case_type: 'claim', title: 'Hospitalisation claim - J Tan', threads: [], insurer: null, policy_number: null, status: 'waiting_insurer',
    waiting_since: null, last_activity: null, summary: null, next_action: 'Send the letter of guarantee', deadline: null, deadline_basis: null, draft: null, draft_withheld: null,
    pair_draft: null, pair_withheld: null, suggested_owner: null, owner_basis: null, needs_human: null, stage: null, evidence: [], confidence: 'high', ...over,
  })
  const stored = await storeCase(input, read({ item_id: W2, threads: [T.old, T.other_case, T.renewal, T.movement], evidence: [{ thread: T.old, quote: 'needs a letter of guarantee from the hospital' }] }))
  const w2 = await links(W2), w1 = await links(W1)
  ok('the read updates the case it named', stored === W2)
  ok('it attaches the free thread and keeps its own', same(w2.map(l => l.thread_id), [T.old, T.other_case]), w2)
  ok('a person\'s pick is still a person\'s', w2.find(l => l.thread_id === T.other_case)?.joined_by === 'person' && w2.find(l => l.thread_id === T.other_case)?.joined_evidence === COLLEAGUE)
  ok('the renewal keeps the thread a person picked for it', w1.some(l => l.thread_id === T.renewal && l.joined_by === 'person'), w1)
  ok('the excluded thread is not put back', !w2.some(l => l.thread_id === T.movement))
  const n2 = await notes(W2)
  ok('the read left its evidence on the case as Client said', n2.length === 1 && n2[0].section === 'client_said' && n2[0].message_id === M.old && n2[0].author === 'case_worker', n2)
  const e2 = (await events(W2)).map(e => e.kind)
  ok('one read event, no second event for the same turn', e2.filter(k => k === 'read').length === 1 && !e2.includes('agent_turn'), e2)
  ok('the case worker has read both threads of the claim', (await loadCaseState(W2, { agent: 'case_worker' })).unread.length === 0)
  const before = (await caseIds()).length
  const sent = await storeCase(input, read({ case_type: 'documents', title: 'Policy schedule request', threads: [T.renewal] }))
  ok('a case made only of a person\'s picks opens nothing new', sent === W1 && (await caseIds()).length === before, { sent, cases: (await caseIds()).length })

  console.log('\nCombine')
  const FIRST_NAME = 'Dogfood Insurer (test)'
  await seedCombine()

  const pv = await combinePreview([T.ask, T.first, T.second], ME)
  const pvOf = (id: string) => pv.threads.find(t => t.id === id)
  ok('the form opens on the client most threads belong to, with its open cases', pv.client?.id === CLIENT && pv.cases.some(c => c.id === W1) && pv.cases.some(c => c.id === W2), { client: pv.client, cases: pv.cases })
  ok('a kind of case from the labels and a title from the oldest subject', pv.case_type === 'new_quote' && pv.title === 'Request for quotation - Public Liability 2027', { type: pv.case_type, title: pv.title })
  ok('the client\'s thread opens as Client, the insurer\'s thread as its insurer', pvOf(T.ask)?.side === 'client' && pvOf(T.ask)?.insurer_id === null && pvOf(T.first)?.side === 'insurer' && pvOf(T.first)?.insurer_id === INSURER, pv.threads.map(t => [t.side, t.insurer_id]))
  ok('both test insurers are offered by name', pv.insurers.some(x => x.id === INSURER) && pv.insurers.some(x => x.id === SECOND && x.name === SECOND_NAME))
  ok('no thread is held by a case yet', pv.threads.every(t => t.held === null))
  ok('a thread a case holds says which case and who picked it', (await combinePreview([T.renewal], ME)).threads[0]?.held?.id === W1)
  ok('no thread ticked is 400', (await refusal(() => combinePreview([], ME))).status === 400)
  ok('a thread that is gone is 404', (await refusal(() => combinePreview([NOWHERE], ME))).status === 404)
  ok('a colleague\'s thread is 403', (await refusal(() => combinePreview([T.ask, T.hidden], ME))).status === 403)

  const pick3 = [{ id: T.ask, side: 'client' as const, insurer_id: null }, { id: T.first, side: 'insurer' as const, insurer_id: INSURER }, { id: T.second, side: 'insurer' as const, insurer_id: SECOND }]
  const start = { company_id: CLIENT, case_type: 'new_quote' as const, title: 'Public Liability 2027', work_item_id: null, move: [] as string[] }
  const casesNow = async () => (await caseIds()).length
  const n0 = await casesNow()
  ok('an insurer that is not on file is 400', (await refusal(() => combineThreads({ ...start, threads: [{ id: T.ask, side: 'insurer', insurer_id: CLIENT }] }, ME))).status === 400)
  ok('a company that is not on file is 400', (await refusal(() => combineThreads({ ...start, company_id: NOWHERE, threads: pick3 }, ME))).status === 400)
  ok('an insurer as the client is 400', (await refusal(() => combineThreads({ ...start, company_id: INSURER, threads: pick3 }, ME))).status === 400)
  ok('a colleague\'s thread is 403', (await refusal(() => combineThreads({ ...start, threads: [...pick3, { id: T.hidden, side: 'client', insurer_id: null }] }, ME))).status === 403)
  const onOther = await refusal(() => combineThreads({ ...start, threads: [...pick3, { id: T.renewal, side: 'client', insurer_id: null }] }, ME))
  ok('a thread on another case is 409, naming the case', onOther.status === 409 && (onOther.error?.extra as Row | undefined)?.conflicts?.[0]?.thread_id === T.renewal && (onOther.error?.extra as Row | undefined)?.conflicts?.[0]?.held?.id === W1, onOther.error?.extra)
  ok('no refusal left a case behind', (await casesNow()) === n0, { before: n0, after: await casesNow() })

  const made = await combineThreads({ ...start, threads: pick3 }, ME)
  const W3 = made.id
  const [w3] = await sb<Row[]>(`work_items?id=eq.${W3}&select=company_id,case_type,title,owner_email,source,status,closed_at`)
  ok('one case is started for the client, owned by the person', made.created && w3?.company_id === CLIENT && w3.case_type === 'new_quote' && w3.title === 'Public Liability 2027' && w3.owner_email === ME && w3.source === 'person' && (await casesNow()) === n0 + 1, w3)
  let l3 = await sb<Row[]>(`work_item_threads?work_item_id=eq.${W3}&select=thread_id,side,joined_by,joined_evidence,insurer_company_id`)
  const l3Of = (id: string) => l3.find(l => l.thread_id === id)
  ok('all three threads are on it as the person\'s picks', l3.length === 3 && l3.every(l => l.joined_by === 'person' && l.joined_evidence === ME), l3)
  ok('each thread carries its side and its named insurer', l3Of(T.ask)?.side === 'client' && l3Of(T.ask)?.insurer_company_id === null && l3Of(T.first)?.insurer_company_id === INSURER && l3Of(T.second)?.side === 'insurer' && l3Of(T.second)?.insurer_company_id === SECOND, l3)
  const e3 = await events(W3)
  ok('started, three picks and three sides are on the case\'s events', e3.filter(e => e.kind === 'started').length === 1 && e3.filter(e => e.kind === 'source_side').length === 3 && e3.every(e => e.actor === ME), e3.map(e => e.kind))

  let rv3 = await loadRounds(W3, ME)
  const chain = (name: string) => rv3.rounds[0]?.chains.find(c => c.insurer === name)
  const QUOTE1 = `quote:${M.c_quote1}:${FIRST_NAME}`, QUOTE2 = `quote:${M.c_quote2}:${SECOND_NAME}`
  ok('one round, two insurers, each asked and replied', rv3.rounds.length === 1 && rv3.rounds[0].chains.length === 2 && chain(FIRST_NAME)?.state === 'replied' && chain(SECOND_NAME)?.state === 'replied', rv3.rounds[0]?.chains)
  ok('the named insurer stands over the thread\'s own company and its sender', rv3.rounds[0].moves.find(m => m.message_id === M.c_quote2)?.insurer === SECOND_NAME && rv3.rounds[0].moves.find(m => m.message_id === M.c_quote2)?.by === 'insurer' && chain(SECOND_NAME)?.thread_id === T.second, rv3.rounds[0]?.moves.map(m => [m.by, m.move, m.insurer]))
  ok('two next steps: each insurer\'s terms to the client', same(rv3.steps.map(x => x.id), [QUOTE1, QUOTE2]) && rv3.steps.every(x => x.act === 'draft' && x.to === 'client' && x.agent === 'Client agent'), rv3.steps.map(x => [x.id, x.act, x.to]))

  const ran = await runSteps(W3, ME)
  const d3 = await sb<Row[]>(`ai_drafts?work_item_id=eq.${W3}&select=id,to_email,thread_id,status,party,generated_by,pair_id,attachments,context_used,body&order=created_at.asc`)
  ok('Run writes both emails, none passed over', ran.made === 2 && ran.existing === 0 && ran.skipped.length === 0 && d3.length === 2, ran)
  ok('each to the client\'s HR on the client\'s thread, unsent, from the template', d3.every(d => d.to_email === HR && d.thread_id === T.ask && d.status === 'pending' && d.party === 'client' && d.generated_by === 'template' && d.context_used?.agent === 'client_agent'), d3.map(d => [d.to_email, d.thread_id, d.status, d.party, d.generated_by]))
  ok('each carries its own insurer\'s file and figure, and they sit as one pair', same(d3.map(d => d.attachments?.[0]?.filename), ['PL_Quotation_First.pdf', 'PL_Quotation_Second.pdf']) && d3.some(d => /\$2,400/.test(d.body)) && d3.some(d => /\$2,150/.test(d.body)) && !!d3[0].pair_id && d3[0].pair_id === d3[1].pair_id, d3.map(d => [d.attachments?.[0]?.filename, d.pair_id]))
  const rerun = await runSteps(W3, ME)
  ok('Run again writes nothing new', rerun.made === 0 && rerun.existing === 2 && (await sb<Row[]>(`ai_drafts?work_item_id=eq.${W3}&select=id`)).length === 2, rerun)
  rv3 = await loadRounds(W3, ME)
  ok('each step shows its unsent email', same(Object.keys(rv3.drafted), [QUOTE1, QUOTE2]), rv3.drafted)

  await setSide(W3, T.second, 'insurer', ME, INSURER)
  rv3 = await loadRounds(W3, ME)
  ok('naming another insurer for a thread moves its emails to that insurer', rv3.rounds[0].moves.find(m => m.message_id === M.c_quote2)?.insurer === FIRST_NAME && rv3.rounds[0].chains.length === 1, rv3.rounds[0]?.chains)
  await setSide(W3, T.second, 'client', ME)
  l3 = await sb<Row[]>(`work_item_threads?work_item_id=eq.${W3}&select=thread_id,side,insurer_company_id`)
  ok('a thread set to Client keeps no insurer', l3Of(T.second)?.side === 'client' && l3Of(T.second)?.insurer_company_id === null, l3Of(T.second))
  ok('an insurer that is not on file is 400', (await refusal(() => setSide(W3, T.second, 'insurer', ME, CLIENT))).status === 400)
  await setSide(W3, T.second, 'insurer', ME, SECOND)

  const added = await combineThreads({ company_id: null, case_type: 'other', title: '', work_item_id: W3, threads: [{ id: T.pantry, side: 'client', insurer_id: null }], move: [] }, ME)
  ok('threads are added to an open case: no second case', !added.created && added.id === W3 && (await casesNow()) === n0 + 1 && (await links(W3)).length === 4, added)
  const taken = await refusal(() => combineThreads({ company_id: null, case_type: 'other', title: '', work_item_id: W2, threads: [{ id: T.pantry, side: 'client', insurer_id: null }], move: [] }, ME))
  ok('adding a thread another case holds is 409 until the person agrees', taken.status === 409 && (await links(W3)).some(l => l.thread_id === T.pantry), taken.error?.extra)
  await combineThreads({ company_id: null, case_type: 'other', title: '', work_item_id: W2, threads: [{ id: T.pantry, side: 'client', insurer_id: null }], move: [T.pantry] }, ME)
  ok('agreed, the thread moves: one thread, one case', !(await links(W3)).some(l => l.thread_id === T.pantry) && (await links(W2)).some(l => l.thread_id === T.pantry && l.joined_by === 'person'))
  ok('the same combine again changes nothing', (await combineThreads({ company_id: null, case_type: 'other', title: '', work_item_id: W3, threads: pick3, move: [] }, ME)).id === W3 && (await links(W3)).length === 3)
  await sb(`work_items?id=eq.${W3}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ closed_at: new Date().toISOString() }) })
  ok('a closed case takes no thread and runs nothing', (await refusal(() => combineThreads({ company_id: null, case_type: 'other', title: '', work_item_id: W3, threads: [{ id: T.movement, side: 'client', insurer_id: null }], move: [] }, ME))).status === 400 && (await refusal(() => runSteps(W3, ME))).status === 400)
  await sb(`work_items?id=eq.${W3}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ closed_at: null }) })
  const b3 = await loadBrief(W3, ME)
  ok('a quotation case made by Combine is checked for the basic documents', b3.checklist_applies === true && (b3.checklist?.total ?? 0) >= basic.length && basic.every(i => b3.checklist?.rows.some(r => r.item_id === i.id && r.required === i.required)), b3.checklist && { line: b3.checklist.line, total: b3.checklist.total })

  console.log('\nIngest')
  await put('email_threads', [thread(T.fresh, CLIENT, 'Request for quotation - Work Injury Compensation', 0)])
  await put('email_messages', [message(M.fresh, T.fresh, 'inbound', HR, 'Request for quotation - Work Injury Compensation', 'Please quote Work Injury Compensation for 40 staff.', 0)])
  const d1 = await depositMessages([M.fresh])
  L = await labels()
  ok('a new email labels its thread at ingest', label(T.fresh) === 'quotation_request' && L.get(T.fresh)?.label_by === 'rule', L.get(T.fresh))
  ok('and is written to the client\'s ledger', d1.written >= 1 && (await sbTry<Row[]>(`company_ledger?source_table=eq.email_messages&source_id=eq.${M.fresh}&select=company_id`, [])).some(x => x.company_id === CLIENT), d1.written)
  await put('email_messages', [message(M.terms, T.fresh, 'inbound', UW, 'RE: Request for quotation - Work Injury Compensation', 'Our terms are attached.', 0)])
  await put('email_attachments', [{ message_id: M.terms, thread_id: T.fresh, filename: 'WICA quotation.pdf' }])
  await depositMessages([M.terms])
  L = await labels()
  ok('an insurer\'s quotation file turns the request into a quote received', label(T.fresh) === 'quote_received', L.get(T.fresh))
}

// ── the routes ────────────────────────────────────────────────────────────────────────────────

/** Three threads for Combine: the client's ask and two insurers' terms, the second from a sender no company on file owns. */
async function seedCombine(): Promise<void> {
  await put('email_threads', [
    thread(T.ask, CLIENT, 'Request for quotation - Public Liability 2027', 3),
    thread(T.first, INSURER, 'RE: Quotation for Dogfood Client - Public Liability', 2),
    thread(T.second, CLIENT, 'Public Liability terms - second market', 1),
  ])
  await put('thread_insurers', [{ thread_id: T.first, insurer_company_id: INSURER, client_company_id: CLIENT, via: 'sender_domain' }])
  await put('email_messages', [
    message(M.c_ask, T.ask, 'inbound', `HR <${HR}>`, 'Request for quotation - Public Liability 2027', 'Please quote Public Liability for our new warehouse, limit $1,000,000.', 3),
    message(M.c_req1, T.first, 'outbound', ME, 'Quotation for Dogfood Client - Public Liability', 'Please quote Public Liability for a warehouse, limit $1,000,000.', 2.5),
    message(M.c_quote1, T.first, 'inbound', `Underwriting <${UW}>`, 'RE: Quotation for Dogfood Client - Public Liability', 'Our terms: annual premium $2,400. Quotation attached.', 2),
    message(M.c_req2, T.second, 'outbound', ME, 'Public Liability terms - second market', 'Please quote Public Liability for a warehouse, limit $1,000,000.', 1.5),
    message(M.c_quote2, T.second, 'inbound', `Desk <${DESK}>`, 'RE: Public Liability terms - second market', 'We can offer an annual premium of $2,150. Quotation attached.', 1),
  ])
  await put('email_participants', [
    person(M.c_ask, T.ask, HR, 'from'), person(M.c_ask, T.ask, ME, 'to'),
    person(M.c_req1, T.first, ME, 'from'), person(M.c_req1, T.first, UW, 'to'),
    person(M.c_quote1, T.first, UW, 'from'), person(M.c_quote1, T.first, ME, 'to'),
    person(M.c_req2, T.second, ME, 'from'), person(M.c_req2, T.second, DESK, 'to'),
    person(M.c_quote2, T.second, DESK, 'from'), person(M.c_quote2, T.second, ME, 'to'),
  ])
  await put('email_attachments', [{ message_id: M.c_quote1, thread_id: T.first, filename: 'PL_Quotation_First.pdf' }, { message_id: M.c_quote2, thread_id: T.second, filename: 'PL_Quotation_Second.pdf' }])
  await labelThreadsByRule([T.ask, T.first, T.second])
}

async function walkRoutes(base: string): Promise<void> {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  const session = await createSession({ id: 'dogfood', email: ME, name: 'Dogfood' }, secret)
  const outsider = await createSession({ id: 'dogfood-out', email: 'someone@dogfood-client.invalid', name: 'Outsider' }, secret)
  const call = async (method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, cookie: string | null = session) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: `trs_session=${cookie}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: r.status, json: await r.json().catch(() => null) as Row | null }
  }
  await labelThreadsByRule(THREADS.filter(t => t !== T.fresh))

  console.log('\nGET/POST /api/work/:id/sources')
  ok('no session → 401', (await call('GET', `/api/work/${W1}/sources`, undefined, null)).status === 401)
  ok('a session outside TRS → 401', (await call('GET', `/api/work/${W1}/sources`, undefined, outsider)).status === 401)
  let r = await call('GET', `/api/work/${W1}/sources`)
  ok('sources of the case', r.status === 200 && r.json?.hidden === 1 && r.json?.proposed?.length === 3 && r.json?.older?.length === 1, { status: r.status, body: r.json && { hidden: r.json.hidden, proposed: r.json.proposed?.length, error: r.json.error } })
  ok('this server reads the same database', r.json?.item?.title === 'Group Hospital & Surgical renewal 2027', r.json?.item)
  ok('unknown case → 404', (await call('GET', `/api/work/${NOWHERE}/sources`)).status === 404)
  ok('unknown action → 400', (await call('POST', `/api/work/${W1}/sources`, { action: 'burn', thread_id: T.renewal })).status === 400)
  ok('no thread → 400', (await call('POST', `/api/work/${W1}/sources`, { action: 'pick' })).status === 400)
  ok('no body → 400', (await call('POST', `/api/work/${W1}/sources`)).status === 400)
  r = await call('POST', `/api/work/${W1}/sources`, { action: 'pick', thread_id: T.renewal })
  ok('pick answers the sources as they stand', r.status === 200 && r.json?.ok === true && r.json?.side === 'client' && r.json?.sources?.picked?.[0]?.id === T.renewal && r.json?.sources?.buckets?.client?.length === 2, r.json && { status: r.status, side: r.json.side, error: r.json.error })
  r = await call('POST', `/api/work/${W1}/sources`, { action: 'pick', thread_id: T.other_case })
  ok('a thread on another case → 409 naming the case', r.status === 409 && r.json?.conflict?.id === W2 && r.json?.conflict?.title === 'Hospitalisation claim - J Tan', r)
  ok('the conflict names who picked it and when', r.json?.conflict?.picked_by === COLLEAGUE && !Number.isNaN(Date.parse(r.json?.conflict?.picked_at ?? '')), r.json?.conflict)
  r = await call('POST', `/api/work/${W1}/sources`, { action: 'pick', thread_id: T.other_case, move: true })
  ok('move → 200 with where it came from', r.status === 200 && r.json?.moved_from === W2, r.json && { status: r.status, moved_from: r.json.moved_from })
  ok('a private thread → 403', (await call('POST', `/api/work/${W1}/sources`, { action: 'pick', thread_id: T.hidden })).status === 403)
  ok('side without a valid side → 400', (await call('POST', `/api/work/${W1}/sources`, { action: 'side', thread_id: T.renewal, side: 'left' })).status === 400)
  r = await call('POST', `/api/work/${W1}/sources`, { action: 'side', thread_id: T.other_case, side: 'insurer' })
  ok('side → 200', r.status === 200 && r.json?.sources?.picked?.find((p: Row) => p.id === T.other_case)?.side === 'insurer', r.json?.error)
  r = await call('POST', `/api/work/${W1}/sources`, { action: 'exclude', thread_id: T.other_case })
  ok('exclude → 200, listed as excluded', r.status === 200 && r.json?.sources?.excluded?.[0]?.id === T.other_case, r.json?.error)
  r = await call('POST', `/api/work/${W1}/sources`, { action: 'restore', thread_id: T.other_case })
  ok('restore → 200, offered again', r.status === 200 && !r.json?.sources?.excluded?.length && r.json?.sources?.proposed?.some((p: Row) => p.id === T.other_case), r.json?.error)

  console.log('\nPOST /api/threads/:id/label')
  ok('no session → 401', (await call('POST', `/api/threads/${T.pantry}/label`, { label: 'document' }, null)).status === 401)
  r = await call('POST', `/api/threads/${T.pantry}/label`, { label: 'snacks' })
  ok('a label off the list → 400 with the list', r.status === 400 && /quotation_request/.test(r.json?.error ?? ''), r)
  r = await call('POST', `/api/threads/${T.pantry}/label`, { label: 'document' })
  ok('label → 200 with the rule\'s answer beside it', r.status === 200 && r.json?.label === 'document' && r.json?.label_rule === 'other', r)
  ok('a private thread → 403', (await call('POST', `/api/threads/${T.hidden}/label`, { label: 'claim' })).status === 403)
  ok('unknown thread → 404', (await call('POST', `/api/threads/${NOWHERE}/label`, { label: 'claim' })).status === 404)

  console.log('\nGET /api/companies/:id/relevance')
  ok('no session → 401', (await call('GET', `/api/companies/${CLIENT}/relevance`, undefined, null)).status === 401)
  r = await call('GET', `/api/companies/${CLIENT}/relevance`)
  ok('groups, hidden count and renewal season', r.status === 200 && r.json?.counts?.active === 2 && r.json?.counts?.member_movements === 1 && r.json?.counts?.back_burner === 4 && r.json?.hidden === 1 && r.json?.season?.on === true, r.json && { counts: r.json.counts, hidden: r.json.hidden, season: r.json.season, error: r.json.error })

  console.log('\nGET/POST /api/work/:id/memory')
  ok('no session → 401', (await call('GET', `/api/work/${W1}/memory`, undefined, null)).status === 401)
  await recordTurn(W1, 'case_worker', { evidence: [{ thread: T.renewal, quote: 'keep the same panel of clinics' }], readThreadIds: [T.renewal] })
  r = await call('GET', `/api/work/${W1}/memory`)
  ok('nine sections, the agent\'s note under Client said, no email bodies', r.status === 200 && r.json?.sections?.length === 9 && r.json?.sections?.find((x: Row) => x.section === 'client_said')?.notes?.length === 1 && !('body_text' in (r.json?.emails?.[0] ?? {})), r.json && { sections: r.json.sections?.length, error: r.json.error })
  ok('where it stands: last touch and unread counts', r.json?.resume?.last?.kind === 'agent_turn' && typeof r.json?.resume?.unread?.new === 'number', r.json?.resume)
  ok('unknown case → 404', (await call('GET', `/api/work/${NOWHERE}/memory`)).status === 404)
  ok('unknown action → 400', (await call('POST', `/api/work/${W1}/memory`, { action: 'forget' })).status === 400)
  ok('a note with no section → 400', (await call('POST', `/api/work/${W1}/memory`, { action: 'note', section: 'gossip', text: 'x' })).status === 400)
  ok('a note with no text → 400', (await call('POST', `/api/work/${W1}/memory`, { action: 'note', section: 'risk', text: '  ' })).status === 400)
  r = await call('POST', `/api/work/${W1}/memory`, { action: 'note', section: 'risk', text: 'Client is also talking to another broker' })
  const noteId = r.json?.note?.id as string | undefined
  ok('a person\'s note → 200, in its section', r.status === 200 && !!noteId && r.json?.note?.author === ME && r.json?.memory?.sections?.find((x: Row) => x.section === 'risk')?.notes?.length === 1, r.json && { status: r.status, error: r.json.error })
  ok('the same note again → 409', (await call('POST', `/api/work/${W1}/memory`, { action: 'note', section: 'risk', text: 'Client is also talking to another broker' })).status === 409)
  ok('reject without a note → 400', (await call('POST', `/api/work/${W1}/memory`, { action: 'reject' })).status === 400)
  r = await call('POST', `/api/work/${W1}/memory`, { action: 'reject', note_id: noteId })
  ok('reject → 200, set aside', r.status === 200 && r.json?.memory?.set_aside?.some((n: Row) => n.id === noteId && n.status === 'rejected') && !r.json?.memory?.sections?.find((x: Row) => x.section === 'risk')?.notes?.length, r.json?.error)
  r = await call('POST', `/api/work/${W1}/memory`, { action: 'restore', note_id: noteId })
  ok('restore → 200, back in its section', r.status === 200 && r.json?.memory?.sections?.find((x: Row) => x.section === 'risk')?.notes?.length === 1, r.json?.error)
  ok('a note that is not on the case → 404', (await call('POST', `/api/work/${W1}/memory`, { action: 'reject', note_id: NOWHERE })).status === 404)

  console.log('\nGET/POST /api/work/:id/brief')
  ok('no session → 401', (await call('GET', `/api/work/${W1}/brief`, undefined, null)).status === 401)
  ok('a session outside TRS → 401', (await call('POST', `/api/work/${W1}/brief`, { action: 'line', line: null }, outsider)).status === 401)
  r = await call('GET', `/api/work/${W1}/brief`)
  const rows = (r.json?.brief?.rows ?? []) as Row[]
  ok('five parts, the line of the case and the staff names', r.status === 200 && r.json?.parts?.length === 5 && r.json?.line?.by === 'title' && r.json?.checklist_applies === true && Array.isArray(r.json?.staff), r.json && { status: r.status, parts: r.json.parts?.length, line: r.json.line, error: r.json.error })
  ok('Communicated carries TRS\'s last email; the person\'s risk is under Known risks', rows.some(x => x.part === 'communicated' && x.who === 'To the client' && x.source?.message_id === M.trs) && rows.some(x => x.part === 'stated' && x.kind === 'Risk' && x.author === ME), rows.map(x => [x.part, x.who]))
  ok('no email body leaves the route', !JSON.stringify(r.json).includes('body_text'))
  ok('unknown case → 404', (await call('GET', `/api/work/${NOWHERE}/brief`)).status === 404)
  ok('unknown action → 400', (await call('POST', `/api/work/${W1}/brief`, { action: 'tick' })).status === 400)
  ok('no body → 400', (await call('POST', `/api/work/${W1}/brief`)).status === 400)
  ok('a call with no document → 400', (await call('POST', `/api/work/${W1}/brief`, { action: 'confirm' })).status === 400)
  ok('a line that is not a line → 400', (await call('POST', `/api/work/${W1}/brief`, { action: 'line', line: 'snacks' })).status === 400)
  ok('a line that is not text → 400', (await call('POST', `/api/work/${W1}/brief`, { action: 'line', line: 7 })).status === 400)

  console.log('\nGET/POST/PATCH /api/settings/checklists')
  ok('no session → 401', (await call('GET', '/api/settings/checklists', undefined, null)).status === 401)
  ok('a session outside TRS → 401', (await call('POST', '/api/settings/checklists', { action: 'list', line: 'cyber' }, outsider)).status === 401)
  r = await call('GET', '/api/settings/checklists')
  ok('the lists, the document types and the staff names', r.status === 200 && r.json?.lists?.some((l: Row) => l.line === 'employee_benefits') && r.json?.doc_types?.length > 0 && Array.isArray(r.json?.staff), r.json && { status: r.status, lists: r.json.lists?.length, error: r.json.error })
  const LINE = await freeLine()
  ok('a line with no checklist to test on', !!LINE, LINE)
  if (LINE) {
    const listOf = (x: { json: Row | null }) => (x.json?.lists as Row[] | undefined)?.find(l => l.line === LINE)
    ok('no line → 400', (await call('POST', '/api/settings/checklists', { action: 'list' })).status === 400)
    ok('unknown action → 400', (await call('POST', '/api/settings/checklists', { action: 'burn', line: LINE })).status === 400)
    ok('a list on no line → 400', (await call('POST', '/api/settings/checklists', { action: 'list', line: 'snacks' })).status === 400)
    ok('a document before the list → 404', (await call('POST', '/api/settings/checklists', { action: 'item', line: LINE, label: 'Signed proposal form', found_by: 'person' })).status === 404)
    r = await call('POST', '/api/settings/checklists', { action: 'list', line: LINE })
    ok('a list is started, empty', r.status === 200 && r.json?.ok === true && listOf(r)?.items?.length === 0, r.json && { status: r.status, error: r.json.error })
    ok('confirming an empty list → 409', (await call('POST', '/api/settings/checklists', { action: 'confirm', line: LINE })).status === 409)
    r = await call('POST', '/api/settings/checklists', { action: 'item', line: LINE, label: 'Signed proposal form', found_by: 'person' })
    const itemId = listOf(r)?.items?.[0]?.id as string | undefined
    ok('a document is added by the signed-in person', r.status === 200 && !!itemId && listOf(r)?.updated_by === ME && listOf(r)?.items?.[0]?.found_by === 'person', r.json && { status: r.status, error: r.json.error })
    ok('the same document again → 409', (await call('POST', '/api/settings/checklists', { action: 'item', line: LINE, label: 'Signed proposal form', found_by: 'person' })).status === 409)
    ok('a document with no name → 400', (await call('POST', '/api/settings/checklists', { action: 'item', line: LINE, label: '' })).status === 400)
    r = await call('POST', '/api/settings/checklists', { action: 'confirm', line: LINE })
    ok('confirm → 200, by the signed-in person', r.status === 200 && listOf(r)?.confirmed_by === ME, r.json?.error)
    ok('an edit with no document → 400', (await call('PATCH', '/api/settings/checklists', { label: 'x' })).status === 400)
    ok('an edit of a document on no list → 404', (await call('PATCH', '/api/settings/checklists', { id: NOWHERE, label: 'Anything' })).status === 404)
    r = await call('PATCH', '/api/settings/checklists', { id: itemId, label: 'Signed proposal' })
    ok('an edit → 200, the list is a draft again', r.status === 200 && listOf(r)?.confirmed_by === null && listOf(r)?.items?.[0]?.label === 'Signed proposal', r.json?.error)

    r = await call('POST', `/api/work/${W1}/brief`, { action: 'line', line: LINE })
    const docRow = (x: { json: Row | null }) => (x.json?.brief?.checklist?.rows as Row[] | undefined)?.find(d => d.item_id === itemId)
    ok('line → 200, the case runs on that list', r.status === 200 && r.json?.brief?.line?.by === 'person' && r.json?.brief?.checklist?.line === LINE && docRow(r)?.state === 'missing', r.json && { status: r.status, line: r.json.brief?.line, error: r.json.error })
    ok('a document that is not on the list → 404', (await call('POST', `/api/work/${W1}/brief`, { action: 'confirm', item_id: NOWHERE })).status === 404)
    ok('turning down with no finding → 409', (await call('POST', `/api/work/${W1}/brief`, { action: 'reject', item_id: itemId })).status === 409)
    r = await call('POST', `/api/work/${W1}/brief`, { action: 'confirm', item_id: itemId })
    ok('confirm → 200, by the signed-in person; the basic Required documents still missing', r.status === 200 && docRow(r)?.state === 'confirmed' && docRow(r)?.actor === ME && r.json?.brief?.checklist?.complete === false && r.json.brief.checklist.required_ticked === 1 && r.json.brief.checklist.required > 1, r.json?.error ?? docRow(r))
    const basicNeeded = (r.json?.brief?.checklist?.rows as Row[]).filter(d => d.item_id !== itemId && d.required)
    for (const d of basicNeeded) r = await call('POST', `/api/work/${W1}/brief`, { action: 'confirm', item_id: d.item_id })
    ok('every Required document confirmed → the list is complete, the Optional ones missing', r.status === 200 && r.json?.brief?.checklist?.complete === true && (r.json.brief.checklist.rows as Row[]).some(d => !d.required && d.state === 'missing'), r.json?.brief?.checklist && { required: r.json.brief.checklist.required, ticked: r.json.brief.checklist.required_ticked })
    r = await call('POST', `/api/work/${W1}/brief`, { action: 'not_needed', item_id: itemId })
    ok('not needed → 200', r.status === 200 && docRow(r)?.state === 'not_needed', r.json?.error)
    r = await call('POST', `/api/work/${W1}/brief`, { action: 'clear', item_id: itemId })
    ok('undo → 200, missing again', r.status === 200 && docRow(r)?.state === 'missing', r.json?.error)
    r = await call('PATCH', '/api/settings/checklists', { id: itemId, active: false })
    ok('retire → 200, kept on the list as retired', r.status === 200 && listOf(r)?.items?.[0]?.active === false, r.json?.error)
    r = await call('POST', `/api/work/${W1}/brief`, { action: 'line', line: null })
    ok('clearing the line → 200, back to the title\'s line', r.status === 200 && r.json?.brief?.line?.by === 'title', r.json?.error)
  }

  console.log('\nGET /api/today/mail')
  ok('no session → 401', (await call('GET', '/api/today/mail', undefined, null)).status === 401)
  ok('a session outside TRS → 401', (await call('GET', '/api/today/mail', undefined, outsider)).status === 401)
  ok('unknown relevance → 400', (await call('GET', '/api/today/mail?relevance=urgent')).status === 400)
  ok('unknown label → 400', (await call('GET', '/api/today/mail?label=snacks')).status === 400)
  r = await call('GET', '/api/today/mail?limit=20000')
  const mail = (r.json?.threads ?? []) as Row[]
  const row = (id: string) => mail.find(t => t.id === id)
  ok('every thread the person may see, with the counts by group', r.status === 200 && r.json?.total === r.json?.counts?.all && mail.length === r.json?.total && r.json?.me === ME, r.json && { status: r.status, total: r.json.total, counts: r.json.counts, rows: mail.length, error: r.json.error })
  ok('a thread on a case names the client and the case', row(T.renewal)?.company?.name === CLIENT_NAME && row(T.renewal)?.case?.id === W1 && row(T.renewal)?.relevance === 'active', row(T.renewal))
  ok('a label a person set names the person', row(T.pantry)?.label === 'document' && row(T.pantry)?.set_by?.kind === 'person' && row(T.pantry)?.set_by?.email === ME, row(T.pantry))
  ok('a label by rule says so', row(T.movement)?.label === 'member_movement' && row(T.movement)?.set_by?.kind === 'rule' && row(T.movement)?.relevance === 'member_movements', row(T.movement))
  ok('the colleague\'s private thread is not listed', !row(T.hidden))
  r = await call('GET', '/api/today/mail?relevance=member_movements&label=member_movement&limit=20000')
  const narrowed = (r.json?.threads ?? []) as Row[]
  ok('relevance and label narrow the rows', r.status === 200 && narrowed.every(t => t.relevance === 'member_movements' && t.label === 'member_movement') && narrowed.some(t => t.id === T.movement) && r.json?.total === r.json?.counts?.member_movements && narrowed.length < mail.length, r.json && { rows: narrowed.length, counts: r.json.counts })

  // Refusals only: each answers before any model is reached. The case with threads is never read here.
  console.log('\nPOST /api/work/:id/read')
  ok('no session → 401', (await call('POST', `/api/work/${W2}/read`, {}, null)).status === 401)
  ok('a session outside TRS → 401', (await call('POST', `/api/work/${W2}/read`, {}, outsider)).status === 401)
  ok('unknown case → 404', (await call('POST', `/api/work/${NOWHERE}/read`, {})).status === 404)
  ok('this case holds no thread now', !(await links(W2)).length)
  r = await call('POST', `/api/work/${W2}/read`, {})
  ok('a case with no thread → 400, nothing read', r.status === 400 && /Add a thread/.test(r.json?.error ?? '') && !(await events(W2)).some(e => e.kind === 'read'), r)
  await sb(`work_items?id=eq.${W2}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ closed_at: new Date().toISOString() }) })
  r = await call('POST', `/api/work/${W2}/read`, {})
  ok('a closed case → 400', r.status === 400 && /closed/.test(r.json?.error ?? ''), r)

  console.log('\nGET/POST /api/work/:id/rounds')
  const terms = `quote:${M.quote}:Dogfood Insurer (test)`
  ok('no session → 401', (await call('GET', `/api/work/${W1}/rounds`, undefined, null)).status === 401)
  ok('a session outside TRS → 401', (await call('POST', `/api/work/${W1}/rounds`, { action: 'draft', step: terms }, outsider)).status === 401)
  ok('unknown case → 404', (await call('GET', `/api/work/${NOWHERE}/rounds`)).status === 404)
  ok('the insurer\'s thread joins the case', (await call('POST', `/api/work/${W1}/sources`, { action: 'pick', thread_id: T.insurer })).status === 200)
  r = await call('GET', `/api/work/${W1}/rounds`)
  ok('one round: request, terms asked, terms received; the terms are owed to the client', r.status === 200 && r.json?.rounds?.length === 1 && r.json.rounds[0].moves.map((m: Row) => m.move).join() === 'ask,note,request,quote,note' && r.json.rounds[0].chains?.[0]?.state === 'replied' && r.json.steps?.map((x: Row) => x.id).join() === terms && r.json.steps[0].agent === 'Client agent', r.json && { status: r.status, rounds: r.json.rounds?.map((x: Row) => x.moves?.map((m: Row) => m.move)), steps: r.json.steps?.map((x: Row) => x.id), error: r.json.error })
  ok('the page\'s lists come with it: what an email may be called, by writer', r.json?.moves?.client?.some((x: Row) => x.move === 'change' && x.name === 'Change') && r.json?.moves?.trs?.some((x: Row) => x.move === 'request') && r.json?.names?.state?.replied && r.json?.item?.id === W1 && !Object.keys(r.json?.drafted ?? {}).length, r.json && { moves: r.json.moves, names: r.json.names })
  ok('no email body leaves the route', !JSON.stringify(r.json).includes('body_text'))
  ok('unknown action → 400', (await call('POST', `/api/work/${W1}/rounds`, { action: 'burn' })).status === 400)
  ok('no body → 400', (await call('POST', `/api/work/${W1}/rounds`)).status === 400)
  ok('draft with no step → 400', (await call('POST', `/api/work/${W1}/rounds`, { action: 'draft' })).status === 400)
  ok('a step that is not waiting → 404', (await call('POST', `/api/work/${W1}/rounds`, { action: 'draft', step: `quote:${M.client}:` })).status === 404)
  ok('move with no email → 400', (await call('POST', `/api/work/${W1}/rounds`, { action: 'move', by: 'client', move: 'ask' })).status === 400)
  ok('a move that is not a move → 400', (await call('POST', `/api/work/${W1}/rounds`, { action: 'move', message_id: M.quote, by: 'insurer', move: 'haggle' })).status === 400)
  ok('an insurer\'s email set to a client\'s move → 400', (await call('POST', `/api/work/${W1}/rounds`, { action: 'move', message_id: M.quote, by: 'insurer', move: 'ask' })).status === 400)
  ok('an email that is not on the case → 404', (await call('POST', `/api/work/${W1}/rounds`, { action: 'move', message_id: M.movement, by: 'client', move: 'ask' })).status === 404)
  r = await call('POST', `/api/work/${W1}/rounds`, { action: 'draft', step: terms })
  ok('draft → 200 with the email made, to the client\'s HR, and the step now showing it', r.status === 200 && r.json?.made?.to === HR && r.json.made.existing === false && r.json.drafted?.[terms] === r.json.made.draft_id, r.json && { status: r.status, made: r.json.made, drafted: r.json.drafted, error: r.json.error })
  const madeId = r.json?.made?.draft_id
  r = await call('POST', `/api/work/${W1}/rounds`, { action: 'draft', step: terms })
  ok('the same step again → the same email', r.status === 200 && r.json?.made?.existing === true && r.json.made.draft_id === madeId && (await sb<Row[]>(`ai_drafts?work_item_id=eq.${W1}&select=id`)).length === 1, r.json?.made)
  r = await call('POST', `/api/work/${W1}/rounds`, { action: 'move', message_id: M.quote, by: 'insurer', move: 'decline' })
  ok('move → 200, the email reads as the person called it and the step follows', r.status === 200 && r.json?.rounds?.[0]?.moves?.find((m: Row) => m.message_id === M.quote)?.move === 'decline' && r.json.rounds[0].moves.find((m: Row) => m.message_id === M.quote)?.set_by === 'person' && r.json.steps?.[0]?.id === `decline:${M.quote}:Dogfood Insurer (test)`, r.json && { status: r.status, steps: r.json.steps?.map((x: Row) => x.id), error: r.json.error })
  r = await call('POST', `/api/work/${W1}/rounds`, { action: 'move', message_id: M.quote, by: null, move: null })
  ok('handing it back → 200, the rule\'s reading again', r.status === 200 && r.json?.rounds?.[0]?.moves?.find((m: Row) => m.message_id === M.quote)?.move === 'quote' && r.json.steps?.[0]?.id === terms, r.json && { status: r.status, steps: r.json.steps?.map((x: Row) => x.id), error: r.json.error })

  console.log('\nGET/POST /api/work/combine')
  await seedCombine()
  const ticked = [T.ask, T.first, T.second].join(',')
  ok('no session → 401', (await call('GET', `/api/work/combine?threads=${ticked}`, undefined, null)).status === 401 && (await call('POST', '/api/work/combine', {}, null)).status === 401)
  ok('a session outside TRS → 401', (await call('GET', `/api/work/combine?threads=${ticked}`, undefined, outsider)).status === 401)
  ok('no thread ticked → 400', (await call('GET', '/api/work/combine?threads=')).status === 400)
  ok('more than forty threads → 400', (await call('GET', `/api/work/combine?threads=${Array.from({ length: 41 }, (_, n) => u(500 + n)).join(',')}`)).status === 400)
  ok('a colleague\'s thread → 403', (await call('GET', `/api/work/combine?threads=${T.ask},${T.hidden}`)).status === 403)
  r = await call('GET', `/api/work/combine?threads=${ticked}`)
  ok('the form → 200: the client, each thread\'s side and insurer, a kind of case and a title', r.status === 200 && r.json?.client?.id === CLIENT && r.json.case_type === 'new_quote' && r.json.threads?.length === 3 && r.json.threads.find((t: Row) => t.id === T.first)?.insurer_id === INSURER && r.json.insurers?.some((x: Row) => x.id === SECOND), r.json && { status: r.status, client: r.json.client, type: r.json.case_type, threads: r.json.threads?.map((t: Row) => [t.side, t.insurer_id]), error: r.json.error })
  ok('no email body leaves the route', !JSON.stringify(r.json).includes('annual premium'))
  const body3 = { company_id: CLIENT, case_type: 'new_quote', title: 'Public Liability 2027', threads: [{ id: T.ask, side: 'client' }, { id: T.first, side: 'insurer', insurer_id: INSURER }, { id: T.second, side: 'insurer', insurer_id: SECOND }] }
  ok('no body → 400', (await call('POST', '/api/work/combine')).status === 400)
  ok('a thread with no side → 400', (await call('POST', '/api/work/combine', { ...body3, threads: [{ id: T.ask }] })).status === 400)
  ok('no title → 400', (await call('POST', '/api/work/combine', { ...body3, title: ' ' })).status === 400)
  ok('an insurer that is not on file → 400', (await call('POST', '/api/work/combine', { ...body3, threads: [{ id: T.second, side: 'insurer', insurer_id: CLIENT }] })).status === 400)
  r = await call('POST', '/api/work/combine', { ...body3, threads: [...body3.threads, { id: T.renewal, side: 'client' }] })
  ok('a thread on another case → 409 with the case that holds it', r.status === 409 && r.json?.conflicts?.[0]?.thread_id === T.renewal && r.json.conflicts[0].held?.id === W1, r)
  const n0 = (await caseIds()).length
  r = await call('POST', '/api/work/combine', body3)
  const W3 = r.json?.id as string
  ok('combine → 200 with the case started', r.status === 200 && !!W3 && r.json.created === true && (await caseIds()).length === n0 + 1 && (await links(W3)).length === 3, r)
  ok('the named insurer is kept on the thread', (await sb<Row[]>(`work_item_threads?work_item_id=eq.${W3}&thread_id=eq.${T.second}&select=side,insurer_company_id`))[0]?.insurer_company_id === SECOND)
  r = await call('POST', `/api/work/${W3}/sources`, { action: 'side', thread_id: T.second, side: 'insurer', insurer_id: INSURER })
  ok('the insurer of a thread is changed on the case → 200', r.status === 200 && (await sb<Row[]>(`work_item_threads?work_item_id=eq.${W3}&thread_id=eq.${T.second}&select=insurer_company_id`))[0]?.insurer_company_id === INSURER, r)
  await call('POST', `/api/work/${W3}/sources`, { action: 'side', thread_id: T.second, side: 'insurer', insurer_id: SECOND })

  console.log('\nPOST /api/work/:id/rounds { action: run }')
  ok('no session → 401', (await call('POST', `/api/work/${W3}/rounds`, { action: 'run' }, null)).status === 401)
  r = await call('POST', `/api/work/${W3}/rounds`, { action: 'run' })
  ok('run → 200: two emails written, each step showing its email', r.status === 200 && r.json?.ran?.made === 2 && r.json.ran.existing === 0 && r.json.ran.skipped?.length === 0 && Object.keys(r.json.drafted ?? {}).length === 2 && r.json.rounds?.[0]?.chains?.length === 2, r.json && { status: r.status, ran: r.json.ran, drafted: r.json.drafted, error: r.json.error })
  r = await call('POST', `/api/work/${W3}/rounds`, { action: 'run' })
  ok('run again → nothing new', r.status === 200 && r.json?.ran?.made === 0 && r.json.ran.existing === 2 && (await sb<Row[]>(`ai_drafts?work_item_id=eq.${W3}&select=id`)).length === 2, r.json?.ran)
  ok('nothing was sent', (await sb<Row[]>(`ai_drafts?work_item_id=eq.${W3}&select=status`)).every(d => d.status === 'pending' || d.status === 'draft'))
}

// ── run ───────────────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Database: ${host}${local ? ' (local)' : ' (LIVE)'}`)
  if (!local && !live) { console.error('This is not a local database. Add --live to run there; the test records are removed at the end.'); process.exit(2) }
  if (mode === 'clean') { await clean(); console.log('Removed.', await leftovers()); return }
  if (mode !== 'lib' && mode !== 'http') { console.error('Mode is lib, http <base url> or clean.'); process.exit(2) }
  if (mode === 'http' && !rest[0]) { console.error('Name the server: http http://127.0.0.1:3117'); process.exit(2) }
  await seed()
  try {
    if (mode === 'lib') await walkStores(); else await walkRoutes(rest[0].replace(/\/$/, ''))
  } catch (e) {
    failed.push(`stopped: ${e instanceof Error ? e.message : String(e)}`)
    console.error(e)
  } finally {
    await clean()
    const left = await leftovers()
    console.log('\nTest records')
    ok('all removed', Object.keys(left).length === 0, left)
  }
  console.log(`\n${passed} passed, ${failed.length} failed`)
  for (const f of failed) console.log(`  - ${f}`)
  process.exit(failed.length ? 1 : 0)
}

main()
