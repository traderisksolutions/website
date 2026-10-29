/**
 * GET /api/group-benefits/quote/[id]/insurer-form?insurer=income|rcc → the insurer's own member
 * file for this quotation (Income BIX upload rows; RCC enrolment listing), as an .xlsx download.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/postgrest-all'
import { incomeUploadXlsx, rccEnrolmentXlsx, type FormLine, type FormMember } from '@/lib/gb/insurer-forms'
import { insurerKey } from '@/lib/gb/ladder'

export const dynamic = 'force-dynamic'
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const sbH = () => ({ apikey: process.env.SUPABASE_SERVICE_KEY ?? '', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY ?? ''}` })

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Quotation id is not valid' }, { status: 400 })
  const which = req.nextUrl.searchParams.get('insurer')
  if (which !== 'income' && which !== 'rcc') return NextResponse.json({ error: 'insurer must be income or rcc' }, { status: 400 })
  const qRes = await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}&select=company_name,effective_date,census,rate_table_ids&limit=1`, { headers: sbH(), cache: 'no-store' })
  const q = qRes.ok ? (await qRes.json() as { company_name: string | null; effective_date: string | null; census: FormMember[] | null; rate_table_ids: string[] | null }[])[0] : null
  if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
  const tRes = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=in.(${(q.rate_table_ids ?? []).join(',')})&select=id,insurer_name`, { headers: sbH(), cache: 'no-store' })
  const table = (tRes.ok ? await tRes.json() as { id: string; insurer_name: string }[] : []).find(t => insurerKey(t.insurer_name) === which)
  if (!table) return NextResponse.json({ error: `This quotation has no ${which === 'income' ? 'Income' : 'RCC'} prices` }, { status: 404 })
  const lines = await fetchAllRows<FormLine>(`${SB_URL}/rest/v1/gb_quote_lines?quotation_id=eq.${id}&rate_table_id=eq.${table.id}&select=member_index,product_code,plan_code,premium`, sbH())
  const members = q.census ?? []
  const company = q.company_name ?? 'Company'
  const buf = which === 'income' ? await incomeUploadXlsx(members, lines) : await rccEnrolmentXlsx(members, lines, q.effective_date, company)
  const stem = `${company.replace(/[^A-Za-z0-9]+/g, ' ').trim()} ${which === 'income' ? 'Income FlexCare upload' : 'RCC enrolment listing'}`
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${stem}.xlsx"` } })
}
