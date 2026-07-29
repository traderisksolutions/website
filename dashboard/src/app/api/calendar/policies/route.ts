/**
 * GET /api/calendar/policies?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Policies whose renewal date (end_date — per the calendar-shows-renewal-only decision) falls
 * in the visible month. Refetches only when the visible month changes (caller's job).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'

type Row = {
  id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null
  currency: string | null; premium: number | null; end_date: string
  customers: { company_id: string | null; companies: { id: string; name: string } | null } | null
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const from = req.nextUrl.searchParams.get('from')
    const to   = req.nextUrl.searchParams.get('to')
    if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

    const select = 'id,policy_number,insurer,class_of_insurance,currency,premium,end_date,customers(company_id,companies(id,name:company_name))'
    const url = `${SB_URL}/rest/v1/policies?end_date=gte.${from}&end_date=lte.${to}&status=eq.active&select=${select}&order=end_date.asc`
    const res = await fetch(url, { headers: sbH(), cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
    const rows = await res.json() as Row[]

    const out = rows.map(r => ({
      id: r.id, policyNumber: r.policy_number, insurer: r.insurer, classOfInsurance: r.class_of_insurance,
      currency: r.currency ?? 'SGD', premium: r.premium, endDate: r.end_date,
      companyId: r.customers?.companies?.id ?? null, companyName: r.customers?.companies?.name ?? null,
    }))
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
