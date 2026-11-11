/**
 * GET /api/today/eb-renewals → every employee-benefits policy ending between 30 days ago and 120
 * days out, one row each, with the client's latest quotation that carries a census (the analysis
 * runs on it) and whether an analysis already exists. The renewals queue on Today.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sbTry, enc } from '@/lib/crm/db'
import { normCompany } from '@/lib/gb/intake'

type Policy = { id: string; company_id: string | null; insurer: string | null; class_of_insurance: string | null; label: string | null; policy_number: string | null; end_date: string | null; is_eb: boolean | null }
type Quotation = { id: string; company_name: string | null; member_count: number; created_at: string }

export type EbRenewalRow = {
  policy_id: string; company_id: string | null; company: string; insurer: string | null; policy: string; policy_number: string | null
  end_date: string; days: number; quotation_id: string | null; members: number | null; analysed: boolean
}

const EB = /benefit|medical|hospital|\bghs\b|\bgtl\b|dental|\beb\b|group life|critical illness/i

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const to = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10)
  const policies = await sbTry<Policy[]>(`policies?status=eq.active&end_date=gte.${from}&end_date=lte.${to}&select=id,company_id,insurer,class_of_insurance,label,policy_number,end_date,is_eb&order=end_date.asc&limit=500`, [])
  const eb = policies.filter(p => p.is_eb || EB.test(`${p.class_of_insurance ?? ''} ${p.label ?? ''}`))
  const ids = [...new Set(eb.map(p => p.company_id).filter((x): x is string => !!x))]
  const names = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 100) for (const c of await sbTry<{ id: string; company_name: string }[]>(`companies?id=in.(${ids.slice(i, i + 100).join(',')})&select=id,company_name`, [])) names.set(c.id, c.company_name)
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString()
  const quotations = await sbTry<Quotation[]>(`gb_quotations?member_count=gt.0&created_at=gte.${enc(since)}&select=id,company_name,member_count,created_at&order=created_at.desc&limit=500`, [])
  const packs = new Set((await sbTry<{ key: string }[]>(`app_settings?key=like.gb_analysis:*&select=key&limit=2000`, [])).map(r => r.key.slice('gb_analysis:'.length)))
  const rows: EbRenewalRow[] = eb.map(p => {
    const company = (p.company_id && names.get(p.company_id)) || 'Unfiled'
    const key = normCompany(company)
    const q = key.length >= 3 ? quotations.find(x => normCompany(x.company_name) === key) ?? null : null
    const days = Math.round((Date.parse(p.end_date! + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000)
    return {
      policy_id: p.id, company_id: p.company_id, company, insurer: p.insurer, policy: p.label ?? p.class_of_insurance ?? 'Employee benefits', policy_number: p.policy_number,
      end_date: p.end_date!, days, quotation_id: q?.id ?? null, members: q?.member_count ?? null, analysed: !!q && packs.has(q.id),
    }
  })
  return NextResponse.json({ rows, today })
}
