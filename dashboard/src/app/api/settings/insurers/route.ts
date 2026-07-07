import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

// Any authenticated employee may read/edit the directory (per product decision:
// "for employees to edit"). Edits are only reachable through the Settings UI.
async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// GET /api/settings/insurers → all insurers with their nested contacts
export async function GET() {
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const res = await fetch(
      `${SB_URL}/rest/v1/insurers?select=id,name,status,insurer_contacts(id,product_line,role_title,notes,updated_at,contacts(id,first_name,last_name,email))&order=name.asc`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const rows = res.ok ? await res.json() : []
    // Flatten the linked contact onto each directory row so the UI keeps a stable
    // shape (name/email now come from Active Contacts — the single source of truth).
    const insurers = (Array.isArray(rows) ? rows : []).map((ins: Record<string, unknown>) => ({
      ...ins,
      insurer_contacts: ((ins.insurer_contacts as Record<string, unknown>[] | undefined) ?? []).map(c => {
        const contact = c.contacts as { id?: string; first_name?: string | null; last_name?: string | null; email?: string | null } | null
        const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || null
        return {
          id:            c.id,
          product_line:  c.product_line,
          role_title:    c.role_title ?? null,
          notes:         c.notes ?? null,
          updated_at:    c.updated_at,
          contact_id:    contact?.id ?? null,
          contact_name:  name,
          contact_email: contact?.email ?? null,
        }
      }),
    }))
    return NextResponse.json(insurers)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/settings/insurers  → { name } create an insurer
export async function POST(req: NextRequest) {
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { name } = await req.json() as { name?: string }
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/insurers?on_conflict=name`, {
      method:  'POST',
      headers: sbHeaders('return=representation,resolution=merge-duplicates'),
      body:    JSON.stringify({ name: name.trim() }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    const rows = await res.json()
    const row  = Array.isArray(rows) ? rows[0] : rows
    void logActivity({ action: 'insurer.created', resource_type: 'insurer', resource_id: row?.id, new_value: { name: name.trim() } })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/settings/insurers → { id, name?, status? }
export async function PATCH(req: NextRequest) {
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { id, name, status } = await req.json() as { id?: string; name?: string; status?: string }
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name?.trim()) patch.name   = name.trim()
    if (status)       patch.status = status

    const res = await fetch(`${SB_URL}/rest/v1/insurers?id=eq.${id}`, {
      method:  'PATCH',
      headers: sbHeaders(),
      body:    JSON.stringify(patch),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    const rows = await res.json()
    void logActivity({ action: 'insurer.updated', resource_type: 'insurer', resource_id: id, new_value: patch })
    return NextResponse.json(Array.isArray(rows) ? rows[0] : rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/settings/insurers?id=X  → removes insurer + its contacts (cascade)
export async function DELETE(req: NextRequest) {
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/insurers?id=eq.${id}`, {
      method:  'DELETE',
      headers: sbHeaders('return=minimal'),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    void logActivity({ action: 'insurer.deleted', resource_type: 'insurer', resource_id: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
