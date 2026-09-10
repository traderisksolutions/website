/**
 * POST /api/companies/from-lead   { leadId, origin?: 'inbound' | 'outbound', name?, stage? }
 * Moves a lead into Sales: creates (or reuses) the company at stage "prospect" unless told
 * otherwise, creates or links the contact, and marks the lead as converted so it leaves Start.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { sb, sbTry, enc, emailDomain } from '@/lib/crm/db'
import { createClientCompany, linkThreadToCompany } from '@/lib/crm/triage'
import { isStage }                   from '@/lib/crm/stage'
import { currentUserEmail }          from '@/lib/crm/auth'
import { logActivity }               from '@/lib/log-activity'

type InboundLead = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; company: string | null; contact_id: string | null; thread_id: string | null; company_id: string | null }
type OutboundLead = { id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null; current_company: string | null; website: string | null; status: string }

async function ensureContact(input: { email: string | null; first: string | null; last: string | null; phone?: string | null; company: string | null; companyId: string; source: string; inboundLeadId?: string; outboundLeadId?: string }): Promise<string | null> {
  if (!input.email) return null
  const email = input.email.toLowerCase()
  const ex = await sbTry<{ id: string; company_id: string | null }[]>(`contacts?email=ilike.${enc(email)}&select=id,company_id&limit=1`, [])
  if (ex[0]) {
    if (!ex[0].company_id) await sbTry(`contacts?id=eq.${ex[0].id}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: input.companyId }) })
    return ex[0].id
  }
  const created = await sbTry<{ id: string }[]>('contacts', [], { method: 'POST', body: JSON.stringify({ first_name: input.first, last_name: input.last, email, phone: input.phone ?? null, company: input.company, company_id: input.companyId, source: input.source, engagement_stage: 'engaged', inbound_lead_id: input.inboundLeadId ?? null, outbound_lead_id: input.outboundLeadId ?? null }) })
  return created[0]?.id ?? null
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { leadId, origin, name, stage } = await req.json() as { leadId?: string; origin?: 'inbound' | 'outbound'; name?: string; stage?: string }
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })
    const user = await currentUserEmail()
    const targetStage = isStage(stage) ? stage : 'prospect'

    if (origin === 'outbound') {
      const rows = await sbTry<OutboundLead[]>(`outbound_leads?id=eq.${enc(leadId)}&select=id,full_name,first_name,last_name,email,current_company,website,status&limit=1`, [])
      const lead = rows[0]
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
      const companyName = (name ?? lead.current_company ?? '').trim() || lead.full_name?.trim() || ''
      if (!companyName) return NextResponse.json({ error: 'A company name is needed.' }, { status: 400 })
      const domain = emailDomain(lead.email) || (lead.website ? lead.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase() : null)
      const companyId = await createClientCompany({ name: companyName, domain, stage: targetStage, source: 'outbound_lead', ownerEmail: user })
      const [first, ...rest] = (lead.full_name ?? '').split(/\s+/).filter(Boolean)
      await ensureContact({ email: lead.email, first: lead.first_name ?? first ?? null, last: lead.last_name ?? (rest.join(' ') || null), company: lead.current_company, companyId, source: 'outbound', outboundLeadId: lead.id })
      await sb(`outbound_leads?id=eq.${enc(leadId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'converted' }) })
      void logActivity({ action: 'company.from_lead', resource_type: 'company', resource_id: companyId, new_value: { lead_id: leadId, origin: 'outbound', name: companyName } })
      return NextResponse.json({ id: companyId, existing: false })
    }

    const leads = await sbTry<InboundLead[]>(`inbound_leads?id=eq.${enc(leadId)}&select=id,first_name,last_name,email,phone,company,contact_id,thread_id,company_id&limit=1`, [])
    const lead = leads[0]
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    if (lead.company_id) return NextResponse.json({ id: lead.company_id, existing: true })

    const companyName = (name ?? lead.company ?? '').trim() || [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim()
    if (!companyName) return NextResponse.json({ error: 'A company name is needed.' }, { status: 400 })
    const companyId = await createClientCompany({ name: companyName, domain: emailDomain(lead.email), stage: targetStage, source: 'inbound_lead', ownerEmail: user })

    let contactId = lead.contact_id
    if (!contactId) contactId = await ensureContact({ email: lead.email, first: lead.first_name, last: lead.last_name, phone: lead.phone, company: lead.company, companyId, source: 'website', inboundLeadId: lead.id })
    else await sbTry(`contacts?id=eq.${enc(contactId)}&company_id=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId }) })

    await sb(`inbound_leads?id=eq.${enc(leadId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: companyId, ...(contactId && !lead.contact_id ? { contact_id: contactId } : {}) }) })
    if (lead.thread_id) await linkThreadToCompany(lead.thread_id, companyId, { contactId, contactEmail: lead.email })

    void logActivity({ action: 'company.from_lead', resource_type: 'company', resource_id: companyId, new_value: { lead_id: leadId, origin: 'inbound', name: companyName } })
    return NextResponse.json({ id: companyId, existing: false })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
