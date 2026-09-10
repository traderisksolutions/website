/**
 * POST /api/companies/from-lead   { leadId, name?, stage? }
 * Turns an inbound lead into a company at stage "lead" (or the given stage), creates or links
 * the contact, stamps inbound_leads.company_id and links any thread the lead already has.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { sb, sbTry, enc, emailDomain } from '@/lib/crm/db'
import { createClientCompany, linkThreadToCompany } from '@/lib/crm/triage'
import { isStage }                   from '@/lib/crm/stage'
import { currentUserEmail }          from '@/lib/crm/auth'
import { logActivity }               from '@/lib/log-activity'

type Lead = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; company: string | null; contact_id: string | null; thread_id: string | null; company_id: string | null }

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { leadId, name, stage } = await req.json() as { leadId?: string; name?: string; stage?: string }
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })
    const leads = await sbTry<Lead[]>(`inbound_leads?id=eq.${enc(leadId)}&select=id,first_name,last_name,email,phone,company,contact_id,thread_id,company_id&limit=1`, [])
    const lead = leads[0]
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    if (lead.company_id) return NextResponse.json({ id: lead.company_id, existing: true })

    const companyName = (name ?? lead.company ?? '').trim() || [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim()
    if (!companyName) return NextResponse.json({ error: 'A company name is needed.' }, { status: 400 })
    const user = await currentUserEmail()
    const companyId = await createClientCompany({ name: companyName, domain: emailDomain(lead.email), stage: isStage(stage) ? stage : 'lead', source: 'inbound_lead', ownerEmail: user })

    // Contact: reuse the lead's contact, else find by email, else create.
    let contactId = lead.contact_id
    if (!contactId && lead.email) {
      const ex = await sbTry<{ id: string }[]>(`contacts?email=ilike.${enc(lead.email)}&select=id&limit=1`, [])
      contactId = ex[0]?.id ?? null
      if (!contactId) {
        const created = await sbTry<{ id: string }[]>('contacts', [], { method: 'POST', body: JSON.stringify({ first_name: lead.first_name, last_name: lead.last_name, email: lead.email.toLowerCase(), phone: lead.phone, company: lead.company, company_id: companyId, source: 'website', engagement_stage: 'engaged', inbound_lead_id: lead.id }) })
        contactId = created[0]?.id ?? null
      }
    }
    if (contactId) await sbTry(`contacts?id=eq.${enc(contactId)}&company_id=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })

    await sb(`inbound_leads?id=eq.${enc(leadId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId, ...(contactId && !lead.contact_id ? { contact_id: contactId } : {}) }) })
    if (lead.thread_id) await linkThreadToCompany(lead.thread_id, companyId, { contactId, contactEmail: lead.email })

    void logActivity({ action: 'company.from_lead', resource_type: 'company', resource_id: companyId, new_value: { lead_id: leadId, name: companyName } })
    return NextResponse.json({ id: companyId, existing: false })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
