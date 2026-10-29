/**
 * End-to-end check of the email flow on the live database with test records only (.invalid
 * addresses; nothing is sent; everything created is removed at the end):
 *   client email → classifier → group benefits quote (requirement, budget, country) → a second
 *   email joins it → broker asks a Tier C insurer (placement, draft with grid and list) → request
 *   "sent" → chaser → insurer asks for documents (fresh thread) → insurer quotes with a PDF →
 *   quote read → attachment in the data room on the policy → documents required → insurer
 *   threads filed on the policy.
 *
 * Needs a local server on :3117 (npx next start -p 3117) with CRON_SECRET and working Gemini keys
 * in its environment, and the same CRON_SECRET and keys in this script's environment:
 *   env CRON_SECRET=... GEMINI_API_KEY...=... npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/dogfood-email-flow.mts
 * First run 29–30 Oct 2026: 16 of 16 after fixes (category mismatch, request threads, contacts default).
 */
import { sb, sbTry } from '../src/lib/crm/db'
import { createInsurer, createProduct, addProductContact, listProducts } from '../src/lib/insurer-products'
import { askInsurers } from '../src/lib/gb/outreach'
import { handleInbound, runChases } from '../src/lib/placement/workflow'
import { ingestAttachment } from '../src/lib/documents/ingest'
import * as docStore from '../src/lib/documents/store'
import { dataRoomStatus } from '../src/lib/documents/taxonomy'
import { sweepInsurerThreads } from '../src/lib/insurers/thread-sweep'

const T0 = new Date().toISOString()
const SERVER = 'http://localhost:3117'
const results: { step: string; ok: boolean; detail: string }[] = []
const check = (step: string, ok: boolean, detail: string) => { results.push({ step, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${step} — ${detail}`) }
const made: { companies: string[]; threads: string[]; contacts: string[] } = { companies: [], threads: [], contacts: [] }
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

async function thread(companyId: string | null, subject: string) {
  const [t] = await sb<{ id: string }[]>('email_threads', { method: 'POST', body: JSON.stringify({ subject, company_id: companyId, gmail_thread_id: `dogfood-${crypto.randomUUID()}`, last_message_at: new Date().toISOString(), message_count: 1, status: 'open' }) })
  made.threads.push(t.id)
  return t.id
}
async function message(threadId: string, m: { direction: 'inbound' | 'outbound'; from: string; subject: string; body: string; inReplyTo?: string | null; attachments?: boolean }) {
  const [row] = await sb<{ id: string }[]>('email_messages', { method: 'POST', body: JSON.stringify({
    thread_id: threadId, gmail_message_id: `dogfood-${crypto.randomUUID()}`, direction: m.direction, from_address: m.from, subject: m.subject, body_text: m.body,
    sent_at: new Date().toISOString(), has_attachments: !!m.attachments, rfc822_message_id: `<${crypto.randomUUID()}@dogfood.invalid>`, in_reply_to: m.inReplyTo ?? null,
  }) })
  return row.id
}

try {
  // ── Setup: a test client and a test insurer with one underwriter ─────────────────────────────
  const [client] = await sb<{ id: string }[]>('companies', { method: 'POST', body: JSON.stringify({ company_name: 'TRS Dogfood Client Pte Ltd', kind: 'client', domain: 'dogfood-client.invalid', domains: ['dogfood-client.invalid'], owner_emails: [] }) })
  made.companies.push(client.id)
  const insurer = await createInsurer('Dogfood Assurance', 'dogfood-insurer.invalid')
  made.companies.push(insurer.id)
  // Leftovers from an interrupted run are adopted so this run's cleanup removes them.
  for (const c of await sbTry<{ id: string }[]>(`companies?company_name=ilike.*Dogfood*&select=id`, [])) if (!made.companies.includes(c.id)) made.companies.push(c.id)
  const product = (await listProducts({ insurerCompanyId: insurer.id }))[0] ?? await createProduct(insurer.id, { name: 'Employee Benefits Insurance', product_line: 'employee_benefits' }, 'dogfood')
  const withUw = await addProductContact(product.id, { email: 'uw@dogfood-insurer.invalid', name: 'Dana Underwriter' })
  const uw = withUw.contacts[0]
  made.contacts.push(uw.contact_id)
  check('Setup', !!uw, `client ${client.id.slice(0, 8)}, insurer ${insurer.name}, underwriter ${uw.email}`)

  // ── 1. Client emails a group benefits request with an employee list ─────────────────────────
  const census = [
    'Name | Relationship | Date of birth | Category', 'Alan Tan | Employee | 12/03/1980 | Staff', 'Bea Tan | Spouse | 05/07/1982 | Staff',
    'Chris Lim | Employee | 23/11/1990 | Staff', 'Dina Ong | Employee | 01/02/1975 | Manager', 'Eli Ong | Child | 14/09/2015 | Manager', 'Fay Koh | Employee | 30/06/1995 | Staff',
  ].join('\n')
  const t1 = await thread(client.id, 'Group insurance quote for 2027 - TRS Dogfood Client')
  const m1 = await message(t1, { direction: 'inbound', from: 'hr@dogfood-client.invalid', subject: 'Group insurance quote for 2027 - TRS Dogfood Client',
    body: `Hi TRS,\n\nWe are TRS Dogfood Client Pte Ltd, a Singapore company. Please quote group insurance for our staff from 1 January 2027: hospital and surgical (private hospital, 1-bedded), GP with no co-payment, and specialist. Spouses and children to be covered. Our current insurer is AIA and the policy renews on 1 January 2027. Our budget is about S$20,000 a year in total.\n\nEmployee list:\n${census}\n\nThanks,\nHR` })
  const cls = await fetch(`${SERVER}/api/email/classify`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET ?? '' }, body: JSON.stringify({ thread_id: t1, message_id: m1 }) }).then(r => r.json())
  check('1a Classifier', cls.category === 'group_benefits', `category ${cls.category}`)
  let quote: { id: string; member_count: number; requirement: any; results: any[]; notes: string } | undefined
  for (let i = 0; i < 24 && !quote; i++) { await wait(5000); quote = (await sbTry<any[]>(`gb_quotations?notes=like.*${encodeURIComponent(`[message:${m1}]`)}*&select=id,member_count,requirement,results,notes&limit=1`, []))[0] }
  check('1b Quote drafted from the email', !!quote && quote.member_count === 6, quote ? `${quote.member_count} lives, ${quote.results?.length ?? 0} insurers priced` : 'no quotation after 2 minutes')
  if (quote) {
    const req = quote.requirement ?? {}
    const r0 = req.categories?.[0]?.requirement ?? {}
    check('1c Requirement read', r0.ward === 'P1' && r0.gp === 'nil' && !!r0.sp, `ward ${r0.ward}, GP ${r0.gp}, specialist ${r0.sp}, dependants ${r0.deps}`)
    check('1d Budget, insurer, renewal, country', req.budget === 20000 && /AIA/i.test(req.current_insurer ?? '') && req.renewal_date === '2027-01-01' && req.country === 'SG', `budget ${req.budget}, current ${req.current_insurer}, renews ${req.renewal_date}, country ${req.country}`)
    const totals = (quote.results ?? []).map((r: any) => `${r.insurer_name.split(' ')[0]} ${Math.round(r.total)}`)
    check('1e Tier A prices', (quote.results ?? []).length === 5 && (quote.results ?? []).every((r: any) => r.total > 0), totals.join(', '))
  }

  // ── 2. The client writes again: joins the open request ───────────────────────────────────────
  const t2 = await thread(client.id, 'Re: group insurance - TRS Dogfood Client')
  const m2 = await message(t2, { direction: 'inbound', from: 'hr@dogfood-client.invalid', subject: 'Group insurance - TRS Dogfood Client', body: 'Hi again, please also quote group dental for our staff on the group benefits we asked about. Thanks, HR' })
  await fetch(`${SERVER}/api/email/classify`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET ?? '' }, body: JSON.stringify({ thread_id: t2, message_id: m2 }) })
  let joined = false
  for (let i = 0; i < 18 && !joined; i++) { await wait(5000); const q = (await sbTry<any[]>(`gb_quotations?id=eq.${quote?.id}&select=notes`, []))[0]; joined = !!q?.notes?.includes(`[message:${m2}]`) }
  const quotes = await sbTry<any[]>(`gb_quotations?company_name=ilike.*Dogfood*&superseded_by=is.null&select=id`, [])
  check('2 Second email joins the request', joined && quotes.length === 1, `${quotes.length} open quote(s) for the client; second email ${joined ? 'noted on it' : 'not joined'}`)

  // ── 3. Broker asks a Tier C insurer ──────────────────────────────────────────────────────────
  if (!quote) throw new Error('No quotation: cannot continue')
  const ask = await askInsurers(quote.id, [uw.contact_id], 'dogfood')
  const [dispatch] = await sbTry<any[]>(`placement_dispatches?placement_id=eq.${ask.placement_id}&select=*`, [])
  const [draft] = dispatch?.ai_draft_id ? await sbTry<any[]>(`ai_drafts?id=eq.${dispatch.ai_draft_id}&select=subject,body,to_email,status`, []) : []
  check('3a Placement and request draft', ask.drafts === 1 && !!dispatch && dispatch.status === 'drafted', `placement ${ask.placement_opened ? 'opened' : 'reused'}, ${ask.drafts} draft to ${draft?.to_email}, status ${dispatch?.status}`)
  check('3b Request carries the requirement and the list, as a first request', /Cover requested/.test(draft?.body ?? '') && /Employee list \(6 lives/.test(draft?.body ?? '') && !/revis/i.test(`${draft?.subject} ${draft?.body}`), `subject "${draft?.subject}"; body ${draft?.body?.length ?? 0} chars`)
  const tierA = await sbTry<any[]>(`placement_quotes?line_id=eq.${ask.line_id}&source=eq.rate_table&status=eq.received&select=insurer_name`, [])
  check('3c Tier A prices on the line', tierA.length === 5, `${tierA.length} engine quotes on the placement line`)

  // ── 4. The request goes out (simulated: nothing is sent) ─────────────────────────────────────
  const t3 = await thread(client.id, draft?.subject ?? 'Quotation request')
  const out = await message(t3, { direction: 'outbound', from: 'operations@trade-risksol.com', subject: draft?.subject ?? 'Quotation request', body: draft?.body ?? '' })
  const [outMsg] = await sbTry<any[]>(`email_messages?id=eq.${out}&select=rfc822_message_id`, [])
  await sb(`placement_dispatches?id=eq.${dispatch.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'sent', sent_at: new Date(Date.now() - 6 * 86_400_000).toISOString(), thread_id: t3, rfc822_message_id: outMsg.rfc822_message_id, sent_subject: draft?.subject, next_chase_at: '2000-01-01T00:00:00Z' }) })

  // ── 5. No reply: the chaser ─────────────────────────────────────────────────────────────────
  const chase = await runChases(new Date('2000-01-02T00:00:00Z'))
  const chaseDrafts = await sbTry<any[]>(`ai_drafts?to_email=eq.uw@dogfood-insurer.invalid&email_type=eq.PLACEMENT_CHASE&select=id,subject,body`, [])
  const anyChase = chaseDrafts[0] ?? (await sbTry<any[]>(`ai_drafts?to_email=eq.uw@dogfood-insurer.invalid&subject=ilike.*Follow-up*&select=id,subject,body,email_type`, []))[0]
  check('5 Chaser drafted', chase.drafted === 1 && !!anyChase, `${chase.drafted} drafted, ${chase.skipped} skipped; "${anyChase?.subject ?? '-'}"`)

  // ── 6. Underwriter asks for documents, on a fresh thread ────────────────────────────────────
  const [pl] = await sbTry<any[]>(`placements?id=eq.${ask.placement_id}&select=ref`, [])
  const t4 = await thread(insurer.id, `RE: ${draft?.subject}`)
  const m4 = await message(t4, { direction: 'inbound', from: 'uw@dogfood-insurer.invalid', subject: `RE: ${draft?.subject}`, inReplyTo: outMsg.rfc822_message_id,
    body: `Dear TRS,\n\nThank you for the request ${pl?.ref ?? ''}. Before we can quote, please send the claims experience for the last 3 years and the current AIA policy schedule.\n\nRegards,\nDana` })
  const r6 = await handleInbound({ message_id: m4, thread_id: t4, gmail_thread_id: null, direction: 'inbound' })
  const [d6] = await sbTry<any[]>(`placement_dispatches?id=eq.${dispatch.id}&select=status,last_inbound_at`, [])
  check('6 Information request matched to the request', d6?.status === 'info_requested', `handled ${JSON.stringify(r6).slice(0, 120)}; dispatch ${d6?.status}`)

  // ── 7. Underwriter quotes, with the quotation attached ──────────────────────────────────────
  const m5 = await message(t3, { direction: 'inbound', from: 'uw@dogfood-insurer.invalid', subject: `RE: ${draft?.subject}`, attachments: true,
    body: 'Dear TRS,\n\nPlease find our quotation attached. Annual premium S$18,600.00 including GST for 6 lives: hospital & surgical private 1-bed, GP and specialist. Valid for 30 days. Subject to a health declaration for the employee aged 51.\n\nRegards,\nDana' })
  const [att] = await sb<{ id: string }[]>('email_attachments', { method: 'POST', body: JSON.stringify({ message_id: m5, thread_id: t3, filename: 'Dogfood Assurance Quotation - TRS Dogfood Client.pdf', mime_type: 'application/pdf', size_bytes: 1200, parsed_text: 'QUOTATION\nGroup Hospital & Surgical\nInsured: TRS Dogfood Client Pte Ltd\nAnnual premium S$18,600.00 including GST\nValid 30 days', parsed_at: new Date().toISOString() }) })
  const r7 = await handleInbound({ message_id: m5, thread_id: t3, gmail_thread_id: null, direction: 'inbound' })
  const insurerQuotes = await sbTry<any[]>(`placement_quotes?line_id=eq.${ask.line_id}&source=eq.insurer&select=insurer_name,premium_amount,premium_text,subjectivities,status`, [])
  check('7a Insurer quote read', insurerQuotes.length === 1 && Math.round(insurerQuotes[0].premium_amount ?? 0) === 18600, `handled ${JSON.stringify(r7).slice(0, 80)}; ${insurerQuotes.map(q => `${q.insurer_name} ${q.premium_text} (${(q.subjectivities ?? []).length} subjectivities)`).join('; ') || 'none'}`)
  const doc = await ingestAttachment(att.id, { file: false })
  check('7b Attachment in the data room, on the policy', !!doc && doc.doc_type === 'quotation' && !!doc.policy_id, doc ? `${doc.doc_type}, policy ${doc.policy_id ? 'linked' : 'not linked'}, company ${doc.company_id === client.id ? 'client' : doc.company_id}` : 'not ingested')

  // ── 8. Documents required for the policy ────────────────────────────────────────────────────
  const [line] = await sbTry<any[]>(`placement_lines?id=eq.${ask.line_id}&select=policy_id`, [])
  const [pol] = await sbTry<any[]>(`policies?id=eq.${line?.policy_id}&select=lifecycle,is_eb,product_line`, [])
  const docs = await docStore.companyDocuments(client.id)
  const st = dataRoomStatus({ lifecycle: pol?.lifecycle, is_eb: pol?.is_eb, product_line: pol?.product_line }, docs.filter(d => d.policy_id === line?.policy_id).map(d => d.doc_type))
  check('8 Documents required', !!pol && st.total > 0 && st.have.includes('quotation'), `policy ${pol?.lifecycle}, EB ${pol?.is_eb}; have ${st.have.join(', ') || 'none'}; missing ${st.missing.map(m => m.label).join(', ')}`)

  // ── 9. Insurer mail filed under the insurer ─────────────────────────────────────────────────
  await sweepInsurerThreads({ since: T0, agentLimit: 5 })
  const filed = await sbTry<any[]>(`thread_insurers?insurer_company_id=eq.${insurer.id}&select=thread_id,policy_id,policy_status,via`, [])
  check('9 Insurer threads filed, request thread on the policy', filed.length >= 1 && filed.some(f => f.policy_status === 'confirmed' && f.policy_id === line?.policy_id), filed.map(f => `${f.via}: policy ${f.policy_status}`).join('; ') || 'none filed')
} catch (e) {
  check('Run', false, e instanceof Error ? `${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}` : String(e))
} finally {
  // ── Clean up everything the run created ─────────────────────────────────────────────────────
  const del = async (path: string) => { try { await sb(path, { method: 'DELETE' }) } catch (e) { console.log('cleanup', path.split('?')[0], String(e).slice(0, 120)) } }
  const ids = (xs: string[]) => xs.map(x => `"${x}"`).join(',')
  const placements = made.companies.length ? await sbTry<{ id: string }[]>(`placements?company_id=in.(${ids(made.companies)})&select=id`, []) : []
  const pIds = placements.map(p => p.id)
  const drafts = [
    ...await sbTry<{ id: string }[]>(`ai_drafts?to_email=in.(uw@dogfood-insurer.invalid,hr@dogfood-client.invalid)&select=id`, []),
    ...(made.threads.length ? await sbTry<{ id: string }[]>(`ai_drafts?thread_id=in.(${ids(made.threads)})&select=id`, []) : []),
  ].map(d => d.id)
  const quotesQ = await sbTry<{ id: string }[]>(`gb_quotations?company_name=ilike.*TRS Dogfood*&select=id`, [])
  if (pIds.length) {
    for (const t of ['placement_quotes', 'placement_dispatches', 'placement_log', 'placement_tiers', 'placement_shares', 'placement_unmatched', 'placement_rounds']) await del(`${t}?placement_id=in.(${ids(pIds)})`)
    await del(`placement_lines?placement_id=in.(${ids(pIds)})`)
    await del(`placements?id=in.(${ids(pIds)})`)
  }
  if (made.companies.length) {
    await del(`policy_documents?company_id=in.(${ids(made.companies)})`)
    await del(`thread_insurers?insurer_company_id=in.(${ids(made.companies)})`)
    await del(`thread_insurers?client_company_id=in.(${ids(made.companies)})`)
    await del(`follow_ups?company_id=in.(${ids(made.companies)})`)
    await del(`policies?company_id=in.(${ids(made.companies)})`)
  }
  if (made.threads.length) {
    await del(`placement_unmatched?thread_id=in.(${ids(made.threads)})`)
    await del(`follow_ups?thread_id=in.(${ids(made.threads)})`)
    await del(`thread_insurers?thread_id=in.(${ids(made.threads)})`)
    await del(`email_attachments?thread_id=in.(${ids(made.threads)})`)
    await del(`email_participants?thread_id=in.(${ids(made.threads)})`)
  }
  if (drafts.length) await del(`ai_drafts?id=in.(${ids([...new Set(drafts)])})`)
  if (made.threads.length) { await del(`email_messages?thread_id=in.(${ids(made.threads)})`); await del(`email_threads?id=in.(${ids(made.threads)})`) }
  if (quotesQ.length) { await del(`gb_quote_lines?quotation_id=in.(${ids(quotesQ.map(q => q.id))})`); await del(`gb_quotations?id=in.(${ids(quotesQ.map(q => q.id))})`) }
  const prods = made.companies.length ? await sbTry<{ id: string }[]>(`insurer_products?insurer_company_id=in.(${ids(made.companies)})&select=id`, []) : []
  if (prods.length) { await del(`insurer_product_contacts?product_id=in.(${ids(prods.map(p => p.id))})`); await del(`insurer_products?id=in.(${ids(prods.map(p => p.id))})`) }
  const people = await sbTry<{ id: string }[]>(`contacts?email=in.(uw@dogfood-insurer.invalid,hr@dogfood-client.invalid)&select=id`, [])
  if (people.length) { await del(`email_participants?contact_id=in.(${ids(people.map(p => p.id))})`); await del(`contacts?id=in.(${ids(people.map(p => p.id))})`) }
  if (made.companies.length) await del(`companies?id=in.(${ids(made.companies)})`)
  const left = [
    ...(await sbTry<any[]>(`companies?company_name=ilike.*Dogfood*&select=id`, [])),
    ...(await sbTry<any[]>(`gb_quotations?company_name=ilike.*TRS Dogfood*&select=id`, [])),
    ...(await sbTry<any[]>(`contacts?email=ilike.*dogfood*&select=id`, [])),
  ]
  console.log(`\nCleanup: ${left.length === 0 ? 'nothing left' : `${left.length} rows left`}`)
  console.log(`\n${results.filter(r => r.ok).length} of ${results.length} passed`)
}
