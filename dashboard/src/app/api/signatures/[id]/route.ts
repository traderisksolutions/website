import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:         prefer,
  }
}

const EDITABLE_FIELDS = new Set(['name', 'title', 'phone', 'email', 'company_tagline', 'is_active', 'sending_email'])

async function getSignatureAndProfile(sigId: string, userId: string) {
  const k = process.env.SUPABASE_SERVICE_KEY!
  const h = { apikey: k, Authorization: `Bearer ${k}` }

  const [sigRes, profRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/user_signatures?id=eq.${sigId}&deleted_at=is.null&select=id,owner_user_id&limit=1`, { headers: h, cache: 'no-store' }),
    fetch(`${SB_URL}/rest/v1/employee_profiles?user_id=eq.${userId}&select=is_admin&limit=1`, { headers: h, cache: 'no-store' }),
  ])

  const sigs  = sigRes.ok  ? await sigRes.json()  : []
  const profs = profRes.ok ? await profRes.json() : []
  const sig   = Array.isArray(sigs)  ? (sigs[0]  ?? null) : null
  const prof  = Array.isArray(profs) ? (profs[0] ?? null) : null

  return { sig, isAdmin: prof?.is_admin === true }
}

function canEdit(sig: { owner_user_id: string | null } | null, userId: string, isAdmin: boolean): boolean {
  if (!sig) return false
  if (isAdmin) return true
  // Non-admin can only edit their own personal signature
  return sig.owner_user_id === userId
}

// PATCH /api/signatures/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { sig, isAdmin } = await getSignatureAndProfile(id, user.id)
    if (!canEdit(sig, user.id, isAdmin)) {
      return NextResponse.json({ error: 'Not authorised to edit this signature' }, { status: 403 })
    }

    const body = await req.json() as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (EDITABLE_FIELDS.has(k)) patch[k] = v
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    const res  = await fetch(`${SB_URL}/rest/v1/user_signatures?id=eq.${id}`, {
      method:  'PATCH',
      headers: sbHeaders(),
      body:    JSON.stringify(patch),
    })

    if (!res.ok) {
      const errText = await res.text()
      if (errText.includes('user_signatures_sending_email_uq') || errText.includes('duplicate')) {
        return NextResponse.json({ error: 'A signature for this address already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data[0] : data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// DELETE /api/signatures/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { sig, isAdmin } = await getSignatureAndProfile(id, user.id)
    if (!canEdit(sig, user.id, isAdmin)) {
      return NextResponse.json({ error: 'Not authorised to delete this signature' }, { status: 403 })
    }

    await fetch(`${SB_URL}/rest/v1/user_signatures?id=eq.${id}`, {
      method:  'PATCH',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify({ deleted_at: new Date().toISOString() }),
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
