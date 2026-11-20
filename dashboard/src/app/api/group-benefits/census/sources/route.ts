/**
 * GET /api/group-benefits/census/sources?thread=<id>&company=<id>
 *   → the spreadsheets on that thread, or on the company's threads in the last 18 months, newest
 *     first, one per file; the PDFs and images that look like last year's policy (schedule,
 *     endorsement, debit note, invoice); PDFs named like a census or member listing among the census
 *     files; `schedules`, the files that look like an insurer's quotation or pricing (Insurer pricing
 *     on /eb); and the current-cover schedule last confirmed for the company, so a renewal starts
 *     from what was set last year. The data room's typed documents for the company join each list
 *     (a member list, schedule, debit note or quotation by type, not only by name), and `optional`
 *     lists its billing and claims files.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enc, sbTry } from '@/lib/crm/db'
import { db, rows } from '@/lib/db/client'
import { companyKey } from '@/lib/format'
import type { Schedule } from '@/lib/gb/current'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { currentUserEmail } from '@/lib/crm/auth'

type Att = { id: string; filename: string; size_bytes: number | null; created_at: string; message_id: string; thread_id: string }

// Data-room types (src/lib/documents/taxonomy.ts) each column offers.
const TYPED_CENSUS = ['member_list', 'member_movement']
const TYPED_POLICY = ['policy_schedule', 'endorsement', 'insurer_debit_note', 'renewal_notice', 'benefit_summary', 'cover_note', 'certificate']
const TYPED_QUOTE = ['quotation']
const TYPED_OPTIONAL: Record<string, string> = { credit_note: 'Billing', payment_advice: 'Billing', trs_debit_note: 'Billing', claim: 'Claims', claims_history: 'Claims', contract_requirements: 'Other' }
export type CensusSource = { attachment_id: string; filename: string; size: number | null; at: string; subject: string | null; thread_id: string }

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const p = new URL(req.url).searchParams
  const thread = p.get('thread'), company = p.get('company')
  let threadIds: string[] = []
  let companyId = company
  if (thread) {
    threadIds = [thread]
    const [t] = await sbTry<{ company_id: string | null }[]>(`email_threads?id=eq.${enc(thread)}&select=company_id&limit=1`, [])
    const [ti] = await sbTry<{ client_company_id: string | null }[]>(`thread_insurers?thread_id=eq.${enc(thread)}&client_company_id=not.is.null&select=client_company_id&limit=1`, [])
    companyId = companyId ?? ti?.client_company_id ?? t?.company_id ?? null
  }
  if (companyId) {
    const since = new Date(Date.now() - 548 * 86_400_000).toISOString()
    const own = await sbTry<{ id: string }[]>(`email_threads?company_id=eq.${enc(companyId)}&deleted_at=is.null&last_message_at=gte.${enc(since)}&select=id&limit=300`, [])
    const filed = await sbTry<{ thread_id: string }[]>(`thread_insurers?client_company_id=eq.${enc(companyId)}&select=thread_id&limit=300`, [])
    threadIds = [...new Set([...threadIds, ...own.map(x => x.id), ...filed.map(x => x.thread_id)])]
  }
  // Only threads the person may see (src/lib/mail/visibility.ts): never a colleague's private thread.
  if (threadIds.length) { const ok = await visibleThreadIds(threadIds, (await currentUserEmail()) ?? ''); threadIds = threadIds.filter(id => ok.has(id)) }
  const atts: Att[] = [], docs: Att[] = []
  for (let i = 0; i < threadIds.length; i += 80) {
    const ids = threadIds.slice(i, i + 80).join(',')
    atts.push(...await sbTry<Att[]>(`email_attachments?thread_id=in.(${ids})&or=(filename.ilike.*.xlsx,filename.ilike.*.xls,filename.ilike.*.xlsm,filename.ilike.*.csv)&select=id,filename,size_bytes,created_at,message_id,thread_id&order=created_at.desc&limit=200`, []))
    docs.push(...await sbTry<Att[]>(`email_attachments?thread_id=in.(${ids})&or=(filename.ilike.*.pdf,filename.ilike.*.png,filename.ilike.*.jpg,filename.ilike.*.jpeg)&select=id,filename,size_bytes,created_at,message_id,thread_id&order=created_at.desc&limit=300`, []))
  }
  const subjects = new Map<string, string | null>()
  for (let i = 0; i < threadIds.length; i += 80) for (const t of await sbTry<{ id: string; subject: string | null }[]>(`email_threads?id=in.(${threadIds.slice(i, i + 80).join(',')})&select=id,subject`, [])) subjects.set(t.id, t.subject)
  const seen = new Set<string>()
  const sources: CensusSource[] = atts.sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter(a => { const k = `${a.filename.toLowerCase().replace(/\s*\(\d+\)(?=\.)/, '')}|${a.size_bytes ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, 30)
    .map(a => ({ attachment_id: a.id, filename: a.filename, size: a.size_bytes, at: a.created_at, subject: subjects.get(a.thread_id) ?? null, thread_id: a.thread_id }))

  // A census sent as a PDF (call note 19): named like a census or member listing.
  const CENSUS_PDF = /census|member|listing|staff\s*list|employee\s*list|headcount|nominal\s*roll/i
  const seenCensusPdf = new Set<string>()
  const censusPdfs: CensusSource[] = docs.filter(a => /\.pdf$/i.test(a.filename) && CENSUS_PDF.test(a.filename)).sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter(a => { const k = `${a.filename.toLowerCase()}|${a.size_bytes ?? ''}`; if (seenCensusPdf.has(k)) return false; seenCensusPdf.add(k); return true })
    .slice(0, 10)
    .map(a => ({ attachment_id: a.id, filename: a.filename, size: a.size_bytes, at: a.created_at, subject: subjects.get(a.thread_id) ?? null, thread_id: a.thread_id }))

  sources.push(...censusPdfs)

  // Insurer pricing schedules: quotations and pricing from the insurers, as spreadsheets or PDFs.
  const QUOTE_DOC = /quot|pricing|price|premium|proposal|renewal\s*terms|\bterms\b|indication|\boffer\b/i
  const seenQuote = new Set<string>()
  const schedules: CensusSource[] = [...atts, ...docs.filter(a => /\.pdf$/i.test(a.filename))].filter(a => QUOTE_DOC.test(a.filename) && !CENSUS_PDF.test(a.filename))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter(a => { const k = `${a.filename.toLowerCase()}|${a.size_bytes ?? ''}`; if (seenQuote.has(k)) return false; seenQuote.add(k); return true })
    .slice(0, 20)
    .map(a => ({ attachment_id: a.id, filename: a.filename, size: a.size_bytes, at: a.created_at, subject: subjects.get(a.thread_id) ?? null, thread_id: a.thread_id }))

  // Last year's policy: documents named like a schedule, endorsement, debit note or invoice.
  const POLICY_DOC = /schedule|endorse|debit|invoice|policy|renewal|benefit|summary|\bdn\b|certificate|premium/i
  const seenDoc = new Set<string>()
  const documents: CensusSource[] = docs.filter(a => POLICY_DOC.test(a.filename)).sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter(a => { const k = `${a.filename.toLowerCase()}|${a.size_bytes ?? ''}`; if (seenDoc.has(k)) return false; seenDoc.add(k); return true })
    .slice(0, 20)
    .map(a => ({ attachment_id: a.id, filename: a.filename, size: a.size_bytes, at: a.created_at, subject: subjects.get(a.thread_id) ?? null, thread_id: a.thread_id }))

  // The data room's typed documents for the company (docs/filing.md): a member list, schedule, debit
  // note or quotation found by type, not only by file name (EB v2 gap G1). Billing and claims files
  // are listed as optional. Only threads the person may see.
  const optional: (CensusSource & { kind: string })[] = []
  if (companyId) {
    const since3y = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString()
    const typed = await rows('EB typed documents', db().from('policy_documents')
      .select('email_attachment_id,filename,doc_type,received_at,created_at,thread_id')
      .eq('company_id', companyId).not('email_attachment_id', 'is', null).neq('status', 'ignored')
      .in('doc_type', [...TYPED_CENSUS, ...TYPED_POLICY, ...TYPED_QUOTE, ...Object.keys(TYPED_OPTIONAL)])
      .or(`received_at.gte.${since3y},received_at.is.null`)
      .order('received_at', { ascending: false, nullsFirst: false }).limit(300)) as { email_attachment_id: string; filename: string; doc_type: string; received_at: string | null; created_at: string; thread_id: string | null }[]
    const tids = [...new Set(typed.map(d => d.thread_id).filter((x): x is string => !!x))]
    const ok = tids.length ? await visibleThreadIds(tids, (await currentUserEmail()) ?? '') : new Set<string>()
    for (const t of tids.filter(id => ok.has(id) && !subjects.has(id))) subjects.set(t, null)
    const as = (d: (typeof typed)[number]): CensusSource => ({ attachment_id: d.email_attachment_id, filename: d.filename, size: null, at: d.received_at ?? d.created_at, subject: d.thread_id ? subjects.get(d.thread_id) ?? null : null, thread_id: d.thread_id ?? '' })
    const merge = (list: CensusSource[], add: CensusSource[], cap: number) => {
      const have = new Set(list.map(x => x.attachment_id)), names = new Set(list.map(x => x.filename.toLowerCase()))
      for (const a of add) if (!have.has(a.attachment_id) && !names.has(a.filename.toLowerCase())) { list.push(a); have.add(a.attachment_id); names.add(a.filename.toLowerCase()) }
      list.sort((a, b) => b.at.localeCompare(a.at)); list.splice(cap)
    }
    const seenOk = typed.filter(d => !d.thread_id || ok.has(d.thread_id))
    merge(sources, seenOk.filter(d => TYPED_CENSUS.includes(d.doc_type) && /\.(xlsx|xls|xlsm|csv|pdf)$/i.test(d.filename)).map(as), 40)
    merge(documents, seenOk.filter(d => TYPED_POLICY.includes(d.doc_type)).map(as), 30)
    merge(schedules, seenOk.filter(d => TYPED_QUOTE.includes(d.doc_type)).map(as), 30)
    const seenOpt = new Set<string>()
    for (const d of seenOk) if (TYPED_OPTIONAL[d.doc_type] && !seenOpt.has(d.filename.toLowerCase()) && optional.length < 20) { seenOpt.add(d.filename.toLowerCase()); optional.push({ ...as(d), kind: TYPED_OPTIONAL[d.doc_type] }) }
  }

  // The schedule last confirmed for this company.
  let schedule: Schedule | null = null, companyName: string | null = null, currentInsurer: string | null = null
  if (companyId) {
    const [c] = await sbTry<{ company_name: string }[]>(`companies?id=eq.${enc(companyId)}&select=company_name&limit=1`, [])
    companyName = c?.company_name ?? null
    if (companyName) {
      const qs = await sbTry<{ company_name: string | null; requirement: { current_schedule?: Schedule; current_insurer?: string | null } | null }[]>(`gb_quotations?requirement->current_schedule=not.is.null&select=company_name,requirement&order=updated_at.desc.nullslast&limit=200`, [])
      const hit = qs.find(q => companyKey(q.company_name) === companyKey(companyName))
      schedule = hit?.requirement?.current_schedule ?? null
      currentInsurer = hit?.requirement?.current_insurer ?? null
    }
  }
  return NextResponse.json({ sources: sources.sort((a, b) => b.at.localeCompare(a.at)), documents, schedules, optional, threads: threadIds.length, companyId, companyName, schedule, currentInsurer })
}
