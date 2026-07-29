/**
 * POST /api/companies/[id]/contacts   { email, name?, phone?, role? }
 * The CompanyContactPicker's "+ add new email" step — auto-saves immediately (reuses an
 * existing contact anywhere in the system by email per the cross-link decision, else creates
 * one) and links it to this company. Returns the resolved contact so the picker can select it
 * right away, no extra round trip.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { resolveContact, linkCompanyContact } from '@/lib/debit-note-commit'
import { logActivity }               from '@/lib/log-activity'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json() as { email?: string; name?: string; phone?: string; role?: 'decision_maker' | 'cc' | 'stakeholder' | 'billing' }
    const email = body.email?.trim()
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

    const contactId = await resolveContact({ email, name: body.name ?? null, phone: body.phone ?? null, role: body.role })
    if (!contactId) return NextResponse.json({ error: 'Could not resolve contact' }, { status: 500 })
    await linkCompanyContact(companyId, contactId, body.role ?? 'billing')

    const res = await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${contactId}&select=id,first_name,last_name,email,phone`, { headers: sbH(), cache: 'no-store' })
    const contact = res.ok ? (await res.json())[0] : { id: contactId, email }

    void logActivity({ action: 'company_contact.added', resource_type: 'company', resource_id: companyId, new_value: { contact_id: contactId, email } })
    return NextResponse.json({ contact })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
