/**
 * GET /api/companies/[id]
 * Full company detail: the company row, its linked contacts (for the CompanyContactPicker's
 * "pick an email" dropdown and the Companies-tab drill-down), its policies, recent debit notes,
 * and a small summary block for the company page's Overview tab.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { sbHeaders }                 from '@/lib/sb'

type Json = Record<string, unknown>
type JunctionContact = { id: string; role: string; is_primary: boolean; contacts: Json | null }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const [companyRes, junctionContactsRes, directContactsRes, customersRes, debitNotesRes] = await Promise.all([
      // The live table's name column is "company_name" — aliased to "name" for callers.
      fetch(`${SB_URL}/rest/v1/companies?id=eq.${id}&select=id,name:company_name,domain,type,industry,address,notes,created_at,updated_at&limit=1`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/company_contacts?company_id=eq.${id}&select=id,role,is_primary,contacts(id,first_name,last_name,email,phone)`, { headers: sbH(), cache: 'no-store' }),
      // Direct contacts.company_id FK (added 20260819) — a contact linked only this way never
      // got a company_contacts row, so the junction fetch above alone would miss them.
      fetch(`${SB_URL}/rest/v1/contacts?company_id=eq.${id}&select=id,first_name,last_name,email,phone`, { headers: sbHeaders(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/customers?company_id=eq.${id}&select=id,status,policies(id,policy_number,insurer,class_of_insurance,broker,currency,start_date,end_date,status)`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/debit_notes?company_id=eq.${id}&select=*&order=issue_date.desc&limit=50`, { headers: sbH(), cache: 'no-store' }),
    ])

    const company = companyRes.ok ? (await companyRes.json())[0] : null
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const junctionContacts: JunctionContact[] = junctionContactsRes.ok ? await junctionContactsRes.json() : []
    const directContacts: Json[] = directContactsRes.ok ? await directContactsRes.json() : []
    const junctionContactIds = new Set(junctionContacts.map(cc => (cc.contacts as Json | null)?.id).filter(Boolean))
    const extraContacts: JunctionContact[] = directContacts
      .filter(c => !junctionContactIds.has(c.id))
      .map(c => ({ id: `direct-${c.id}`, role: 'stakeholder', is_primary: false, contacts: c }))
    const contacts = [...junctionContacts, ...extraContacts]

    const customers = customersRes.ok ? await customersRes.json() as { status: string | null; policies: Json[] }[] : []
    const policies = customers.flatMap(c => c.policies ?? [])
    const debitNotes: { status: string; payment_due_date: string | null }[] = debitNotesRes.ok ? await debitNotesRes.json() : []

    const activePolicyEndDates = policies
      .filter((p): p is Json & { status: string; end_date: string } => p.status === 'active' && typeof p.end_date === 'string')
      .map(p => p.end_date)
      .sort()
    const summary = {
      contactCount: contacts.length,
      nextRenewalDate: activePolicyEndDates[0] ?? null,
      openDebitNoteCount: debitNotes.filter(d => d.status === 'unpaid' || d.status === 'partially_paid').length,
    }

    return NextResponse.json({ company, contacts, policies, debitNotes, summary })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/companies/[id]   { notes: string }
// Staff-editable notes layer for the Engagement customer profile (see
// src/lib/customer-profile.ts) — auto-saved from EngagementProfileTab's notes editor.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { notes } = await req.json() as { notes?: string }
    if (notes === undefined) return NextResponse.json({ error: 'notes required' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/companies?id=eq.${id}`, {
      method: 'PATCH', headers: sbH('return=minimal'),
      body: JSON.stringify({ notes, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
