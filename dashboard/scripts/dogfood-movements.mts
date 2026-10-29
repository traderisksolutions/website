/**
 * End-to-end check of member movements on the live database with test records only (.invalid
 * addresses; nothing is sent; everything created is removed at the end):
 *   client emails a joiner and a leaver with a spreadsheet → movements recorded with the pro-rata
 *   each should cost → request to the insurer drafted (TRS subject, client's file attached) →
 *   marked sent → chaser → insurer's debit note arrives on a fresh thread filed under the insurer →
 *   read, matched to the movements, checked against the estimate → raised for the TRS note →
 *   the Member movements list shows the batch at the right stage.
 *
 *   env GEMINI_API_KEY...=... npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/dogfood-movements.mts
 */
import { sb, sbTry } from '../src/lib/crm/db'
import { createInsurer, createProduct, addProductContact, listProducts } from '../src/lib/insurer-products'
import { handleInbound } from '../src/lib/placement/workflow'
import { markMovementsSent } from '../src/lib/policies/members'
import { runMovementChases, bundleForTransaction } from '../src/lib/policies/movement-flow'
import { GET as listBatches } from '../src/app/api/policies/movements/route'
import { getDriveWriteToken, rootFolderId } from '../src/lib/gdrive-write'

const results: { step: string; ok: boolean; detail: string }[] = []
const check = (step: string, ok: boolean, detail: string) => { results.push({ step, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${step} — ${detail}`) }
const made: { companies: string[]; threads: string[] } = { companies: [], threads: [] }
const POLICY_NO = 'DOGMV-2026-001'

async function thread(companyId: string | null, subject: string) {
  const [t] = await sb<{ id: string }[]>('email_threads', { method: 'POST', body: JSON.stringify({ subject, company_id: companyId, gmail_thread_id: `dogfood-${crypto.randomUUID()}`, last_message_at: new Date().toISOString(), message_count: 1, status: 'open' }) })
  made.threads.push(t.id); return t.id
}
async function message(threadId: string, m: { from: string; subject: string; body: string; attachments?: boolean }) {
  const [row] = await sb<{ id: string }[]>('email_messages', { method: 'POST', body: JSON.stringify({
    thread_id: threadId, gmail_message_id: `dogfood-${crypto.randomUUID()}`, direction: 'inbound', from_address: m.from, subject: m.subject, body_text: m.body,
    sent_at: new Date().toISOString(), has_attachments: !!m.attachments, rfc822_message_id: `<${crypto.randomUUID()}@dogfood.invalid>`,
  }) })
  return row.id
}

try {
  // ── Setup: a client with a live EB policy at a test insurer, five members ───────────────────
  for (const c of await sbTry<{ id: string }[]>(`companies?company_name=ilike.*Dogfood*&select=id`, [])) made.companies.push(c.id)
  const [client] = await sb<{ id: string }[]>('companies', { method: 'POST', body: JSON.stringify({ company_name: 'TRS Dogfood Movers Pte Ltd', kind: 'client', domain: 'dogfood-client.invalid', domains: ['dogfood-client.invalid'], owner_emails: [] }) })
  made.companies.push(client.id)
  const insurer = await createInsurer('Dogfood Assurance', 'dogfood-insurer.invalid')
  if (!made.companies.includes(insurer.id)) made.companies.push(insurer.id)
  const product = (await listProducts({ insurerCompanyId: insurer.id }))[0] ?? await createProduct(insurer.id, { name: 'Employee Benefits Insurance', product_line: 'employee_benefits' }, 'dogfood')
  const uw = (await addProductContact(product.id, { email: 'uw@dogfood-insurer.invalid', name: 'Dana Underwriter' })).contacts[0]
  const [policy] = await sb<{ id: string }[]>('policies', { method: 'POST', body: JSON.stringify({
    company_id: client.id, policy_number: POLICY_NO, insurer: 'Dogfood Assurance', chosen_insurer_company_id: insurer.id, product_line: 'employee_benefits', is_eb: true,
    lifecycle: 'live', label: 'Group Hospital & Surgical', class_of_insurance: 'Group Hospital & Surgical', start_date: '2026-09-01', end_date: '2027-08-31', bound_premium: 10000, currency: 'SGD', status: 'active',
  }) })
  await sb('policy_members', { method: 'POST', body: JSON.stringify(['Alan Tan', 'Bea Lim', 'Chris Ong', 'Dina Koh', 'Eli Ng'].map(n => ({ policy_id: policy.id, company_id: client.id, member_name: n, relationship: 'employee', status: 'active', source: 'census', plan_code: 'Plan 2' }))) })
  check('Setup', !!uw && !!policy, `live policy ${POLICY_NO}, 5 members, underwriter ${uw?.email}`)

  // ── 1. Client emails a joiner and a leaver, list attached ───────────────────────────────────
  const t1 = await thread(client.id, 'Staff movement November 2026')
  const m1 = await message(t1, { from: 'hr@dogfood-client.invalid', subject: 'Staff movement November 2026', attachments: true, body: 'Hi TRS, please update our group insurance with the attached staff movement. Thanks, HR' })
  await sb('email_attachments', { method: 'POST', body: JSON.stringify({ message_id: m1, thread_id: t1, filename: 'Staff Movement Nov 2026.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size_bytes: 900, parsed_at: new Date().toISOString(),
    parsed_text: 'Name,Action,Date of birth,Gender,Plan,Date of employment,Effective date,Last day of service\nFay Goh,Addition,12/03/1992,Female,Plan 2,01/10/2026,01/11/2026,\nBea Lim,Deletion,05/07/1985,Female,Plan 2,,,15/11/2026' }) })
  const r1 = await handleInbound({ message_id: m1, thread_id: t1, gmail_thread_id: null, direction: 'inbound' })
  const mv = await sbTry<any[]>(`policy_movements?policy_id=eq.${policy.id}&select=*&order=kind`, [])
  const join = mv.find(m => m.kind === 'join'), leave = mv.find(m => m.kind === 'leave')
  check('1a Movements read from the attachment', mv.length === 2 && join?.member_name === 'Fay Goh' && leave?.member_name === 'Bea Lim', `handled ${JSON.stringify(r1)}; ${mv.map(m => `${m.kind} ${m.member_name} eff ${m.effective_on} last ${m.last_day ?? '-'}`).join('; ')}`)
  check('1b Leaver dated the day after the last day', leave?.effective_on === '2026-11-16' && leave?.last_day === '2026-11-15', `effective ${leave?.effective_on}, last day ${leave?.last_day}`)
  // 10,000 / 5 members = 2,000 a head; joiner 1 Nov 2026 → 31 Aug 2027 = 304 days: 2,000 × 304/365 = 1,665.75 + 9% GST = 1,815.67
  check('1c Pro-rata expected', Number(join?.estimate_amount) === 1815.67 && Number(leave?.estimate_amount) < 0, `joiner ${join?.estimate_amount} (${join?.estimate_basis}); leaver ${leave?.estimate_amount} (${leave?.estimate_basis})`)
  const [draft] = join?.sent_draft_id ? await sbTry<any[]>(`ai_drafts?id=eq.${join.sent_draft_id}&select=subject,body,to_email,attachments`, []) : []
  check('1d Request drafted to the insurer', draft?.to_email === 'uw@dogfood-insurer.invalid' && /^TRS \(.+\) : TRS Dogfood Movers Pte Ltd Policy No: DOGMV-2026-001 - Member movement \(1 addition, 1 deletion\)$/.test(draft?.subject ?? ''), `"${draft?.subject}"`)
  check('1e Client file attached', (draft?.attachments ?? []).some((a: any) => a.filename === 'Staff Movement Nov 2026.xlsx' && a.storage_url.startsWith('gmail:')), (draft?.attachments ?? []).map((a: any) => `${a.filename} (${a.storage_url.split(':')[0]})`).join('; ') || 'none')

  // ── 2. Sent, then no answer: the chaser ─────────────────────────────────────────────────────
  await markMovementsSent(join.sent_draft_id)
  await sb(`policy_movements?policy_id=eq.${policy.id}`, { method: 'PATCH', body: JSON.stringify({ next_chase_at: '2000-01-01T00:00:00Z' }) })
  const ch = await runMovementChases(new Date('2000-01-02T00:00:00Z'))
  const chaser = (await sbTry<any[]>(`ai_drafts?to_email=eq.uw@dogfood-insurer.invalid&email_type=eq.POLICY_MOVEMENT_CHASE&select=subject,body`, []))[0]
  check('2 Chaser drafted', ch.drafted === 1 && /Fay Goh/.test(chaser?.body ?? ''), `${ch.drafted} drafted; "${chaser?.subject}"`)

  // ── 3. The insurer's debit note, on a fresh thread filed under the insurer ──────────────────
  const t2 = await thread(insurer.id, `RE: ${draft?.subject}`)
  const m2 = await message(t2, { from: 'uw@dogfood-insurer.invalid', subject: `RE: ${draft?.subject}`, attachments: true, body: 'Dear TRS, please find the endorsement and debit note for the addition of Fay Goh. The deletion of Bea Lim will follow on a credit note. Regards, Dana' })
  const [att] = await sb<{ id: string }[]>('email_attachments', { method: 'POST', body: JSON.stringify({ message_id: m2, thread_id: t2, filename: 'Endorsement E001 Debit Note DNE-55821.pdf', mime_type: 'application/pdf', size_bytes: 1100, parsed_at: new Date().toISOString(),
    parsed_text: `DEBIT NOTE DNE-55821\nPolicy ${POLICY_NO}\nInsured: TRS Dogfood Movers Pte Ltd\nEndorsement E001: addition of 1 member (Fay Goh) effective 01/11/2026 to 31/08/2027\nPremium S$1,665.75\nGST 9% S$149.92\nTotal S$1,815.67\nDate of issue: 30/10/2026` }) })
  const r2 = await handleInbound({ message_id: m2, thread_id: t2, gmail_thread_id: null, direction: 'inbound' })
  const [tx] = await sbTry<any[]>(`policy_transactions?policy_id=eq.${policy.id}&select=*`, [])
  const after = await sbTry<any[]>(`policy_movements?policy_id=eq.${policy.id}&select=kind,status,transaction_id,noted_at,annual_rate,rate_source`, [])
  check('3a Insurer note read and routed to the policy', !!tx && tx.kind === 'debit' && Math.round(Number(tx.amount) * 100) === 181567, `handled ${JSON.stringify(r2)}; ${tx ? `${tx.kind} ${tx.note_no} ${tx.amount}` : 'no transaction'}`)
  check('3b Matched to the joiner, checked against the estimate', after.find(m => m.kind === 'join')?.status === 'noted' && tx?.estimate_amount != null && Math.abs(Number(tx.variance_amount)) <= 1 && !tx.needs_review, `joiner ${after.find(m => m.kind === 'join')?.status}, leaver ${after.find(m => m.kind === 'leave')?.status}; expected ${tx?.estimate_amount}, variance ${tx?.variance_amount}`)
  check('3c Insurer rate learned', after.find(m => m.kind === 'join')?.rate_source === 'insurer_note', `annual rate ${after.find(m => m.kind === 'join')?.annual_rate} (${after.find(m => m.kind === 'join')?.rate_source})`)

  // ── 4. Raise the TRS note ───────────────────────────────────────────────────────────────────
  const b = tx ? await bundleForTransaction(tx.id) : null
  const [bundle] = b ? await sbTry<any[]>(`debit_note_bundles?id=eq.${b.bundleId}&select=status,source,suggested_company_id,pdf_import_items(storage_url,original_filename)`, []) : []
  check('4 Insurer note queued for the TRS note', bundle?.source === 'policy_movement' && bundle?.suggested_company_id === client.id && bundle?.pdf_import_items?.[0]?.storage_url === `gmail:${att.id}`, bundle ? `${bundle.status}, ${bundle.pdf_import_items?.[0]?.original_filename}` : 'no bundle')

  // ── 5. The movements list ───────────────────────────────────────────────────────────────────
  const res = await listBatches(new Request('http://local/api/policies/movements', { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` } }) as never)
  const { batches } = await res.json() as { batches: any[] }
  const mine = (batches ?? []).filter(x => x.policy_number === POLICY_NO)
  check('5 Member movements list', mine.some(x => x.stage === 'to_bill' && x.joins === 1) && mine.some(x => x.stage === 'insurer' && x.leaves === 1), mine.map(x => `${x.stage}: +${x.joins} −${x.leaves}, expected ${x.expected}, note ${x.note_amount}`).join('; ') || `status ${res.status}`)
} catch (e) {
  check('Run', false, e instanceof Error ? `${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}` : String(e))
} finally {
  const del = async (path: string) => { try { await sb(path, { method: 'DELETE' }) } catch (e) { console.log('cleanup', path.split('?')[0], String(e).slice(0, 140)) } }
  const ids = (xs: string[]) => xs.map(x => `"${x}"`).join(',')
  if (made.companies.length) {
    const tx = await sbTry<{ id: string; bundle_id: string | null }[]>(`policy_transactions?company_id=in.(${ids(made.companies)})&select=id,bundle_id`, [])
    const bundles = tx.map(t => t.bundle_id).filter(Boolean) as string[]
    await del(`policy_movements?company_id=in.(${ids(made.companies)})`)
    await del(`policy_transactions?company_id=in.(${ids(made.companies)})`)
    if (bundles.length) { await del(`pdf_import_items?bundle_id=in.(${ids(bundles)})`); await del(`debit_note_bundles?id=in.(${ids(bundles)})`) }
    await del(`policy_members?company_id=in.(${ids(made.companies)})`)
    await del(`policy_position_weekly?company_id=in.(${ids(made.companies)})`)
    await del(`placement_log?company_id=in.(${ids(made.companies)})`)
    await del(`policy_documents?company_id=in.(${ids(made.companies)})`)
    await del(`thread_insurers?insurer_company_id=in.(${ids(made.companies)})`)
    await del(`policies?company_id=in.(${ids(made.companies)})`)
  }
  const drafts = (await sbTry<{ id: string }[]>(`ai_drafts?to_email=in.(uw@dogfood-insurer.invalid,hr@dogfood-client.invalid)&select=id`, [])).map(d => d.id)
  if (drafts.length) await del(`ai_drafts?id=in.(${ids(drafts)})`)
  if (made.threads.length) {
    await del(`email_attachments?thread_id=in.(${ids(made.threads)})`)
    await del(`email_messages?thread_id=in.(${ids(made.threads)})`)
    await del(`email_threads?id=in.(${ids(made.threads)})`)
  }
  const prods = made.companies.length ? await sbTry<{ id: string }[]>(`insurer_products?insurer_company_id=in.(${ids(made.companies)})&select=id`, []) : []
  if (prods.length) { await del(`insurer_product_contacts?product_id=in.(${ids(prods.map(p => p.id))})`); await del(`insurer_products?id=in.(${ids(prods.map(p => p.id))})`) }
  const people = await sbTry<{ id: string }[]>(`contacts?email=in.(uw@dogfood-insurer.invalid,hr@dogfood-client.invalid)&select=id`, [])
  if (people.length) { await del(`email_participants?contact_id=in.(${ids(people.map(p => p.id))})`); await del(`contacts?id=in.(${ids(people.map(p => p.id))})`) }
  if (made.companies.length) await del(`companies?id=in.(${ids(made.companies)})`)
  // The insurer sheet went to the client's Drive folder: move the test folder to the bin (recoverable).
  try {
    const token = await getDriveWriteToken()
    const q = encodeURIComponent(`'${rootFolderId()}' in parents and name contains 'Dogfood' and trashed = false`)
    const r = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })).json() as { files?: { id: string }[] }
    for (const f of r.files ?? []) await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) })
  } catch (e) { console.log('cleanup drive', String(e).slice(0, 120)) }
  const left = [...await sbTry<any[]>(`companies?company_name=ilike.*Dogfood*&select=id`, []), ...await sbTry<any[]>(`policies?policy_number=eq.${POLICY_NO}&select=id`, []), ...await sbTry<any[]>(`contacts?email=ilike.*dogfood*&select=id`, [])]
  console.log(`\nCleanup: ${left.length === 0 ? 'nothing left' : `${left.length} rows left`}`)
  console.log(`${results.filter(r => r.ok).length} of ${results.length} passed`)
}
