/**
 * GET /api/companies/[id]
 * Full company detail: the company row, its linked contacts (for the CompanyContactPicker's
 * "pick an email" dropdown and the Companies-tab drill-down), its policies, and recent debit
 * notes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'

type Json = Record<string, unknown>

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const [companyRes, contactsRes, customersRes, debitNotesRes] = await Promise.all([
      // The live table's name column is "company_name" — aliased to "name" for callers.
      fetch(`${SB_URL}/rest/v1/companies?id=eq.${id}&select=id,name:company_name,domain,type,industry,address,notes,created_at,updated_at&limit=1`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/company_contacts?company_id=eq.${id}&select=id,role,is_primary,contacts(id,first_name,last_name,email,phone)`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/customers?company_id=eq.${id}&select=id,policies(id,policy_number,insurer,class_of_insurance,broker,currency,start_date,end_date,status)`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/debit_notes?company_id=eq.${id}&select=*&order=issue_date.desc&limit=50`, { headers: sbH(), cache: 'no-store' }),
    ])

    const company = companyRes.ok ? (await companyRes.json())[0] : null
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const contacts = contactsRes.ok ? await contactsRes.json() : []
    const customers = customersRes.ok ? await customersRes.json() as { policies: Json[] }[] : []
    const policies = customers.flatMap(c => c.policies ?? [])
    const debitNotes = debitNotesRes.ok ? await debitNotesRes.json() : []

    return NextResponse.json({ company, contacts, policies, debitNotes })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
