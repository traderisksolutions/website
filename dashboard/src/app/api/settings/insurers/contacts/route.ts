import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { isValidProductLine }        from '@/lib/product-lines'
import { logActivity }               from '@/lib/log-activity'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

function normEmail(e: string) { return e.trim().toLowerCase() }

// POST /api/settings/insurers/contacts
// Body: { insurer_id, product_line, contact_email, contact_name?, notes? }
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { insurer_id, product_line, contact_email, contact_name, notes } =
      await req.json() as {
        insurer_id?: string; product_line?: string; contact_email?: string
        contact_name?: string; notes?: string
      }

    if (!insurer_id)                       return NextResponse.json({ error: 'insurer_id required' }, { status: 400 })
    if (!product_line || !isValidProductLine(product_line))
                                           return NextResponse.json({ error: 'valid product_line required' }, { status: 400 })
    if (!contact_email?.includes('@'))     return NextResponse.json({ error: 'valid contact_email required' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/insurer_contacts?on_conflict=insurer_id,product_line,contact_email`, {
      method:  'POST',
      headers: sbHeaders('return=representation,resolution=merge-duplicates'),
      body: JSON.stringify({
        insurer_id,
        product_line,
        contact_email: normEmail(contact_email),
        contact_name:  contact_name?.trim() || null,
        notes:         notes?.trim() || null,
        updated_by:    user.id,
        updated_at:    new Date().toISOString(),
      }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    const rows = await res.json()
    const row  = Array.isArray(rows) ? rows[0] : rows
    void logActivity({ action: 'insurer_contact.created', resource_type: 'insurer_contact', resource_id: row?.id, new_value: { insurer_id, product_line, contact_email: normEmail(contact_email) } })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/settings/insurers/contacts
// Body: { id, product_line?, contact_email?, contact_name?, notes? }
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { id, product_line, contact_email, contact_name, notes } =
      await req.json() as {
        id?: string; product_line?: string; contact_email?: string
        contact_name?: string; notes?: string
      }
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const patch: Record<string, unknown> = { updated_by: user.id, updated_at: new Date().toISOString() }
    if (product_line !== undefined) {
      if (!isValidProductLine(product_line)) return NextResponse.json({ error: 'invalid product_line' }, { status: 400 })
      patch.product_line = product_line
    }
    if (contact_email !== undefined) {
      if (!contact_email.includes('@')) return NextResponse.json({ error: 'invalid contact_email' }, { status: 400 })
      patch.contact_email = normEmail(contact_email)
    }
    if (contact_name !== undefined) patch.contact_name = contact_name.trim() || null
    if (notes        !== undefined) patch.notes        = notes.trim() || null

    const res = await fetch(`${SB_URL}/rest/v1/insurer_contacts?id=eq.${id}`, {
      method:  'PATCH',
      headers: sbHeaders(),
      body:    JSON.stringify(patch),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    const rows = await res.json()
    void logActivity({ action: 'insurer_contact.updated', resource_type: 'insurer_contact', resource_id: id, new_value: patch })
    return NextResponse.json(Array.isArray(rows) ? rows[0] : rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/settings/insurers/contacts?id=X
export async function DELETE(req: NextRequest) {
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/insurer_contacts?id=eq.${id}`, {
      method:  'DELETE',
      headers: sbHeaders('return=minimal'),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    void logActivity({ action: 'insurer_contact.deleted', resource_type: 'insurer_contact', resource_id: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
