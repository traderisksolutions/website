/**
 * Dogfood of case sources, thread labels, relevance and case memory against a real database:
 * every query, every write and every route, on test records that are removed at the end.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/dogfood-case-sources.mts lib
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/dogfood-case-sources.mts http http://127.0.0.1:3117
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/dogfood-case-sources.mts clean
 *
 * lib   seeds two companies, eight threads and two cases under fixed ids on `.invalid` domains,
 *       then walks the stores: rule labels, proposals, pick / conflict / move / exclude / restore,
 *       a private thread, a person's label, relevance and renewal season, an agent's turn with
 *       evidence, the resume point, a person's note, the case worker's guard and the ingest hook.
 * http  seeds the same records and walks the four routes with a signed-in session (the dev
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

type Row = Record<string, any>

const [mode = 'lib', ...rest] = process.argv.slice(2).filter(a => a !== '--live')
const live = process.argv.includes('--live')
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://missing').host
const local = /^(127\.0\.0\.1|localhost)(:|$)/.test(host)

const u = (n: number) => `d09f00d0-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLIENT = u(1), INSURER = u(2), POLICY = u(5)
const W1 = u(11), W2 = u(12)
const T = { renewal: u(21), insurer: u(22), movement: u(23), old: u(24), hidden: u(25), other_case: u(26), pantry: u(27), fresh: u(28) }
const M = { client: u(31), trs: u(32), ask: u(33), quote: u(34), movement: u(35), old: u(36), hidden: u(37), timeline: u(38), pantry: u(39), later: u(40), fresh: u(41), terms: u(42) }
const COMPANIES = [CLIENT, INSURER], THREADS = Object.values(T), CASES = [W1, W2]
const ME = 'dogfood.staff@trade-risksol.com', COLLEAGUE = 'dogfood.colleague@trade-risksol.com'
const HR = 'hr@dogfood-client.invalid', UW = 'uw@dogfood-insurer.invalid'
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
  for (const t of ['work_item_notes', 'work_item_reads', 'work_item_thread_excluded', 'work_item_events', 'work_item_threads']) await del(`${t}?work_item_id=${list(cases)}`)
  await del(`work_item_thread_excluded?thread_id=${list(THREADS)}`)
  await del(`work_item_threads?thread_id=${list(THREADS)}`)
  await del(`work_items?id=${list(cases)}`)
  for (const t of ['thread_insurers', 'email_thread_aliases', 'email_attachments', 'email_participants', 'email_messages']) await del(`${t}?thread_id=${list(THREADS)}`)
  await del(`email_threads?id=${list(THREADS)}`)
  await del(`policies?id=eq.${POLICY}`)
  await del(`companies?id=${list(COMPANIES)}`)
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
    company_ledger: await count(`company_ledger?or=(company_id.${list(COMPANIES)},group_id.${list(COMPANIES)})&select=id`),
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
  await put('thread_insurers', [{ thread_id: T.insurer, insurer_company_id: INSURER, client_company_id: CLIENT, via: 'dogfood' }])
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
const notes = async (workItemId: string) => sb<Row[]>(`work_item_notes?work_item_id=eq.${workItemId}&select=id,section,text,quote,message_id,thread_id,author,author_kind,status,superseded_by,rejected_by&order=created_at.asc`)

// ── the stores ────────────────────────────────────────────────────────────────────────────────

async function walkStores(): Promise<void> {
  console.log('\nLabels by rule')
  const seven = THREADS.filter(t => t !== T.fresh)
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
  let s = await loadSources(W1, ME, today)
  ok('nothing picked yet, the private thread counted', s.picked.length === 0 && s.hidden === 1, { picked: s.picked.length, hidden: s.hidden })
  ok('proposed: policy number first (newest first), then subject', s.proposed.map(p => p.id).join() === [T.other_case, T.renewal, T.insurer].join(), s.proposed.map(p => [p.subject, p.reason]))
  ok('reasons: policy_number, policy_number, subject', s.proposed.map(p => p.reason).join() === 'policy_number,policy_number,subject', s.proposed.map(p => p.reason))
  ok('the thread on the claim names that case', s.proposed[0]?.onCase?.id === W2, s.proposed[0]?.onCase)
  ok('insurer thread naming the client is on the insurer side', s.proposed.find(p => p.id === T.insurer)?.side === 'insurer')
  ok('recent: the two unrelated threads, newest first', s.recent.map(c => c.id).join() === [T.pantry, T.movement].join(), s.recent.map(c => c.subject))
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

async function walkRoutes(base: string): Promise<void> {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  const session = await createSession({ id: 'dogfood', email: ME, name: 'Dogfood' }, secret)
  const outsider = await createSession({ id: 'dogfood-out', email: 'someone@dogfood-client.invalid', name: 'Outsider' }, secret)
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown, cookie: string | null = session) => {
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
