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

// POST /api/settings/insurers/contacts
// Body: { insurer_id, contact_id, product_lines: string[], role_title?, notes? }
// Links an EXISTING Active-Contacts person to an insurer across one or more lines.
// People are created on the Active Contacts page — never here.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { insurer_id, contact_id, product_lines, role_title, notes } =
      await req.json() as {
        insurer_id?: string; contact_id?: string; product_lines?: string[]
        role_title?: string; notes?: string
      }

    if (!insurer_id) return NextResponse.json({ error: 'insurer_id required' }, { status: 400 })
    if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 })
    const lines = (product_lines ?? []).filter(l => isValidProductLine(l))
    if (lines.length === 0) return NextResponse.json({ error: 'at least one valid product_line required' }, { status: 400 })

    // Confirm the contact exists (FK safety + clear error).
    const cRes = await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${contact_id}&select=id&limit=1`, { headers: sbHeaders(), cache: 'no-store' })
    const found = cRes.ok ? (await cRes.json())[0] : null
    if (!found) return NextResponse.json({ error: 'contact not found in Active Contacts' }, { status: 404 })

    const now  = new Date().toISOString()
    const body = lines.map(product_line => ({
      insurer_id, product_line, contact_id,
      role_title: role_title?.trim() || null,
      notes:      notes?.trim() || null,
      updated_by: user.id,
      updated_at: now,
    }))

    const res = await fetch(`${SB_URL}/rest/v1/insurer_contacts?on_conflict=insurer_id,product_line,contact_id`, {
      method:  'POST',
      headers: sbHeaders('return=representation,resolution=merge-duplicates'),
      body:    JSON.stringify(body),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    const rows = await res.json()
    void logActivity({ action: 'insurer_contact.created', resource_type: 'insurer_contact', resource_id: insurer_id, new_value: { insurer_id, contact_id, product_lines: lines } })
    return NextResponse.json(Array.isArray(rows) ? rows : [rows])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/settings/insurers/contacts — edits the LINK only (role_title, notes,
// product_line). The person's name/email live in Active Contacts.
// Body: { id, product_line?, role_title?, notes? }
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { id, product_line, role_title, notes } =
      await req.json() as { id?: string; product_line?: string; role_title?: string; notes?: string }
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const patch: Record<string, unknown> = { updated_by: user.id, updated_at: new Date().toISOString() }
    if (product_line !== undefined) {
      if (!isValidProductLine(product_line)) return NextResponse.json({ error: 'invalid product_line' }, { status: 400 })
      patch.product_line = product_line
    }
    if (role_title !== undefined) patch.role_title = role_title.trim() || null
    if (notes      !== undefined) patch.notes      = notes.trim() || null

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
