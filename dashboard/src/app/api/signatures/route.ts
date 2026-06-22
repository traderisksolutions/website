import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const MAX_SHARED_ALIASES = 10

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

async function getProfile(userId: string): Promise<{ is_admin: boolean }> {
  const k = process.env.SUPABASE_SERVICE_KEY!
  const res = await fetch(
    `${SB_URL}/rest/v1/employee_profiles?user_id=eq.${userId}&select=is_admin&limit=1`,
    { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' }
  )
  const rows = res.ok ? await res.json() : []
  return { is_admin: Array.isArray(rows) && rows[0]?.is_admin === true }
}

// GET /api/signatures
// Admin sees all; non-admin sees only their own (owner_user_id = their id) + shared (owner_user_id is null).
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { is_admin } = await getProfile(user.id)

    // Admin: all non-deleted. Non-admin: own + shared.
    const filter = is_admin
      ? `deleted_at=is.null`
      : `deleted_at=is.null&or=(owner_user_id.is.null,owner_user_id.eq.${user.id})`

    const res  = await fetch(
      `${SB_URL}/rest/v1/user_signatures?${filter}&select=id,name,title,phone,email,company_tagline,is_active,sending_email,owner_user_id&order=created_at.asc`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const rows = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(rows) ? rows : [])
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/signatures — create a signature for a specific sending address.
// - sending_email required
// - For a shared alias (not the user's own Gmail): admin only
// - Shared aliases capped at MAX_SHARED_ALIASES org-wide
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { is_admin } = await getProfile(user.id)

    const { name, title, phone, email, company_tagline, sending_email } =
      await req.json() as {
        name?: string; title?: string; phone?: string; email?: string
        company_tagline?: string; sending_email?: string
      }

    if (!name?.trim())          return NextResponse.json({ error: 'name required' }, { status: 400 })
    if (!sending_email?.trim()) return NextResponse.json({ error: 'sending_email required' }, { status: 400 })

    const normalizedSendingEmail = sending_email.trim().toLowerCase()

    // Get the user's connected Gmail to decide if this is personal or shared
    const k = process.env.SUPABASE_SERVICE_KEY!
    const profileRes = await fetch(
      `${SB_URL}/rest/v1/employee_profiles?user_id=eq.${user.id}&select=gmail_email&limit=1`,
      { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' }
    )
    const profiles = profileRes.ok ? await profileRes.json() : []
    const gmailEmail = Array.isArray(profiles) ? (profiles[0]?.gmail_email as string | null) : null

    const isPersonalAddress = gmailEmail?.toLowerCase() === normalizedSendingEmail
    const ownerUserId: string | null = isPersonalAddress ? user.id : null

    // Only admin can create signatures for shared aliases
    if (!isPersonalAddress && !is_admin) {
      return NextResponse.json({ error: 'Admin access required for shared alias signatures' }, { status: 403 })
    }

    // Check org-wide cap on shared aliases
    if (!isPersonalAddress) {
      const countRes = await fetch(
        `${SB_URL}/rest/v1/user_signatures?deleted_at=is.null&owner_user_id=is.null&select=id`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      const existing = countRes.ok ? await countRes.json() : []
      if (Array.isArray(existing) && existing.length >= MAX_SHARED_ALIASES) {
        return NextResponse.json(
          { error: `Maximum of ${MAX_SHARED_ALIASES} shared signatures reached` },
          { status: 422 }
        )
      }
    }

    const res = await fetch(`${SB_URL}/rest/v1/user_signatures`, {
      method:  'POST',
      headers: sbHeaders(),
      body:    JSON.stringify({
        name:            name.trim(),
        title:           title?.trim()           || null,
        phone:           phone?.trim()           || null,
        email:           email?.trim()           || null,
        company_tagline: company_tagline?.trim() || null,
        sending_email:   normalizedSendingEmail,
        owner_user_id:   ownerUserId,
        is_active:       true,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      // Unique violation on sending_email → friendly message
      if (errText.includes('user_signatures_sending_email_uq') || errText.includes('duplicate')) {
        return NextResponse.json({ error: 'A signature for this address already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create signature' }, { status: 500 })
    }

    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data[0] : data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
