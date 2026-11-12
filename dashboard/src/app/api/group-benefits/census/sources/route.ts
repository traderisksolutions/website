/**
 * GET /api/group-benefits/census/sources?thread=<id>&company=<id>
 *   → the spreadsheets on that thread, or on the company's threads in the last 18 months, newest
 *     first, one per file; the PDFs and images that look like last year's policy (schedule,
 *     endorsement, debit note, invoice); and the current-cover schedule last confirmed for the
 *     company, so a renewal starts from what was set last year.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enc, sbTry } from '@/lib/crm/db'
import { companyKey } from '@/lib/format'
import type { Schedule } from '@/lib/gb/current'

type Att = { id: string; filename: string; size_bytes: number | null; created_at: string; message_id: string; thread_id: string }
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

  // Last year's policy: documents named like a schedule, endorsement, debit note or invoice.
  const POLICY_DOC = /schedule|endorse|debit|invoice|policy|renewal|benefit|summary|\bdn\b|certificate|premium/i
  const seenDoc = new Set<string>()
  const documents: CensusSource[] = docs.filter(a => POLICY_DOC.test(a.filename)).sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter(a => { const k = `${a.filename.toLowerCase()}|${a.size_bytes ?? ''}`; if (seenDoc.has(k)) return false; seenDoc.add(k); return true })
    .slice(0, 20)
    .map(a => ({ attachment_id: a.id, filename: a.filename, size: a.size_bytes, at: a.created_at, subject: subjects.get(a.thread_id) ?? null, thread_id: a.thread_id }))

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
  return NextResponse.json({ sources, documents, companyId, companyName, schedule, currentInsurer })
}
