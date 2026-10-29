/**
 * GET  /api/group-benefits/insurer-contacts → { insurers, contacts }
 *        insurers: every insurer company (the one insurer list); contacts: everyone on an
 *        employee-benefits or group-health product, one row per insurer and person.
 * POST   { insurer_company_id, name?, email } → adds the person to that insurer's employee-benefits
 *        product, creating the product when the insurer has none.
 * PATCH  { contact_id, name?, email? } → corrects the person's name or email (the contact record itself).
 * DELETE { insurer, contact_id } → takes the person off that insurer's employee-benefits products.
 *
 * Reads and writes insurer_products, the same records the Insurers page and placement routing use,
 * so a contact added here is the contact Tier C emails. The old insurer_contacts list is no longer read.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { SB_URL, sbH } from '@/lib/debit-note-storage'
import { listInsurerCompanies, normInsurer } from '@/lib/insurers'
import { addProductContact, createProduct, listProducts, removeProductContact } from '@/lib/insurer-products'
import { logActivity } from '@/lib/log-activity'

const EB_LINES = ['employee_benefits', 'group_health']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const [insurers, products] = await Promise.all([listInsurerCompanies(), listProducts({ productLines: EB_LINES })])
    const seen = new Set<string>()
    const contacts = products.flatMap(p => p.contacts.flatMap(c => {
      const key = `${p.insurer_company_id}|${c.contact_id}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ insurer: p.insurer_name, insurer_company_id: p.insurer_company_id, contact_id: c.contact_id, name: c.name, email: c.email }]
    }))
    const ebSeen = new Set<string>()
    const eb_insurers = products.filter(p => p.status === 'active' && !ebSeen.has(p.insurer_company_id) && ebSeen.add(p.insurer_company_id)).map(p => ({ insurer: p.insurer_name, insurer_company_id: p.insurer_company_id }))
    return NextResponse.json({ insurers, contacts, eb_insurers })
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
    const insurer = (await listInsurerCompanies()).find(i => i.id === b.insurer_company_id)
    if (!insurer) return NextResponse.json({ error: 'Insurer not found' }, { status: 404 })
    let product = (await listProducts({ productLines: ['employee_benefits'], insurerCompanyId: insurer.id }))[0]
    if (!product) product = await createProduct(insurer.id, { name: 'Employee Benefits Insurance', product_line: 'employee_benefits' }, 'gb.insurer-contacts')
    const updated = await addProductContact(product.id, { email, name: b.name?.trim() || null })
    const contact = updated.contacts.find(c => c.email === email)
    void logActivity({ action: 'gb.insurer_contact_added', resource_type: 'company', resource_id: insurer.id, new_value: { insurer: insurer.name, email } })
    return NextResponse.json({ ok: true, contact_id: contact?.contact_id ?? null, insurer: insurer.name })
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
    const want = normInsurer(b.insurer)
    const products = (await listProducts({ productLines: EB_LINES })).filter(p => normInsurer(p.insurer_name) === want && p.contacts.some(c => c.contact_id === b.contact_id))
    if (!products.length) return NextResponse.json({ error: 'That person is not on this insurer’s employee-benefits list' }, { status: 404 })
    for (const p of products) await removeProductContact(p.id, b.contact_id)
    void logActivity({ action: 'gb.insurer_contact_removed', resource_type: 'contact', resource_id: b.contact_id, new_value: { insurer: b.insurer } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
