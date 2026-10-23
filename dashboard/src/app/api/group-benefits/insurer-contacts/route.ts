/**
 * GET  /api/group-benefits/insurer-contacts → { insurers, contacts }
 *        insurers: every insurer company (the picker list); contacts: everyone on file for
 *        employee benefits or group health, one row per insurer and person.
 * POST   { insurer_company_id, name?, email } → adds an employee-benefits contact for that insurer.
 * PATCH  { contact_id, name?, email? } → corrects the person's name or email (the contact record itself).
 * DELETE { insurer, contact_id } → takes the person off that insurer's employee-benefits list; the
 *        contact record and any other product lines stay.
 *
 * insurer_contacts still keys on the hidden insurers table (see src/lib/insurers.ts);
 * resolveInsurerKey maps the picked company onto it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { SB_URL, sbH } from '@/lib/debit-note-storage'
import { resolveContact } from '@/lib/debit-note-commit'
import { listInsurerCompanies, resolveInsurerKey } from '@/lib/insurers'
import { logActivity } from '@/lib/log-activity'

const EB_LINES = ['employee_benefits', 'group_health']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Row = { insurers: { name: string } | null; contacts: { id: string; email: string | null; first_name: string | null; last_name: string | null } | null }

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const [insurers, res] = await Promise.all([
      listInsurerCompanies(),
      fetch(`${SB_URL}/rest/v1/insurer_contacts?product_line=in.(${EB_LINES.join(',')})&select=insurers(name),contacts(id,email,first_name,last_name)`, { headers: sbH(), cache: 'no-store' }),
    ])
    if (!res.ok) return NextResponse.json({ error: (await res.text()).slice(0, 200) }, { status: 502 })
    const seen = new Set<string>()
    const contacts = (await res.json() as Row[]).flatMap(r => {
      if (!r.insurers || !r.contacts?.email) return []
      const key = `${r.insurers.name}|${r.contacts.id}`
      if (seen.has(key)) return []
      seen.add(key)
      const name = [r.contacts.first_name, r.contacts.last_name].filter(Boolean).join(' ').replace(/,/g, '').trim()
      return [{ insurer: r.insurers.name, contact_id: r.contacts.id, name: name || null, email: r.contacts.email }]
    })
    return NextResponse.json({ insurers, contacts })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const b = await req.json().catch(() => ({})) as { insurer_company_id?: string; name?: string; email?: string }
    const email = (b.email ?? '').trim().toLowerCase()
    if (!b.insurer_company_id) return NextResponse.json({ error: 'Insurer is required' }, { status: 400 })
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Email is not valid' }, { status: 400 })

    const key = await resolveInsurerKey({ companyId: b.insurer_company_id })
    if (!key) return NextResponse.json({ error: 'Insurer not found' }, { status: 404 })
    const contactId = await resolveContact({ email, name: b.name?.trim() || null })
    if (!contactId) return NextResponse.json({ error: 'Could not save the contact' }, { status: 500 })

    const existing = await fetch(`${SB_URL}/rest/v1/insurer_contacts?insurer_id=eq.${key.key}&contact_id=eq.${contactId}&product_line=eq.employee_benefits&select=id&limit=1`, { headers: sbH(), cache: 'no-store' })
    if (!existing.ok || (await existing.json() as unknown[]).length === 0) {
      const ins = await fetch(`${SB_URL}/rest/v1/insurer_contacts`, {
        method: 'POST', headers: sbH('return=minimal'),
        body: JSON.stringify({ insurer_id: key.key, contact_id: contactId, product_line: 'employee_benefits' }),
      })
      if (!ins.ok) return NextResponse.json({ error: (await ins.text()).slice(0, 200) }, { status: 502 })
    }
    void logActivity({ action: 'gb.insurer_contact_added', resource_type: 'company', resource_id: b.insurer_company_id, new_value: { insurer: key.company.name, email } })
    return NextResponse.json({ ok: true, contact_id: contactId, insurer: key.company.name })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const b = await req.json().catch(() => ({})) as { contact_id?: string; name?: string; email?: string }
    if (!b.contact_id) return NextResponse.json({ error: 'Contact is required' }, { status: 400 })
    const patch: Record<string, string | null> = {}
    if (typeof b.email === 'string') {
      const email = b.email.trim().toLowerCase()
      if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Email is not valid' }, { status: 400 })
      patch.email = email
    }
    if (typeof b.name === 'string') {
      const [first, ...rest] = b.name.trim().split(/\s+/).filter(Boolean)
      patch.first_name = first ?? null
      patch.last_name = rest.join(' ') || null
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
    const res = await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${encodeURIComponent(b.contact_id)}`, {
      method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const t = await res.text()
      return NextResponse.json({ error: /duplicate|unique/i.test(t) ? 'Another contact already uses that email' : t.slice(0, 200) }, { status: res.status === 409 ? 409 : 502 })
    }
    void logActivity({ action: 'gb.insurer_contact_edited', resource_type: 'contact', resource_id: b.contact_id, new_value: patch })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const b = await req.json().catch(() => ({})) as { insurer?: string; contact_id?: string }
    if (!b.insurer || !b.contact_id) return NextResponse.json({ error: 'Insurer and contact are required' }, { status: 400 })
    const key = await resolveInsurerKey({ name: b.insurer })
    if (!key) return NextResponse.json({ error: 'Insurer not found' }, { status: 404 })
    const res = await fetch(`${SB_URL}/rest/v1/insurer_contacts?insurer_id=eq.${key.key}&contact_id=eq.${encodeURIComponent(b.contact_id)}&product_line=in.(${EB_LINES.join(',')})`, {
      method: 'DELETE', headers: sbH('return=minimal'),
    })
    if (!res.ok) return NextResponse.json({ error: (await res.text()).slice(0, 200) }, { status: 502 })
    void logActivity({ action: 'gb.insurer_contact_removed', resource_type: 'contact', resource_id: b.contact_id, new_value: { insurer: key.company.name } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
