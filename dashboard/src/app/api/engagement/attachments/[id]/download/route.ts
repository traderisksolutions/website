/**
 * GET /api/engagement/attachments/[id]/download → redirects to a short-lived signed URL for an
 * email attachment stored in the email-attachments bucket. Mirrors
 * src/app/api/debit-notes/[id]/pdf/route.ts's sign-and-redirect pattern.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'

const SB_URL  = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const BUCKET  = 'email-attachments'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  const { id } = await params
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/email_attachments?id=eq.${encodeURIComponent(id)}&select=storage_url&limit=1`,
      { headers: sbHeaders() }
    )
    const row = res.ok ? (await res.json())[0] : null
    if (!row?.storage_url) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

    const signRes = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${row.storage_url}`, {
      method: 'POST', headers: sbHeaders(), body: JSON.stringify({ expiresIn: 3600 }),
    })
    if (!signRes.ok) return NextResponse.json({ error: await signRes.text() }, { status: 502 })
    const { signedURL } = await signRes.json() as { signedURL?: string }
    if (!signedURL) return NextResponse.json({ error: 'Could not sign attachment URL' }, { status: 502 })

    return NextResponse.redirect(`${SB_URL}/storage/v1${signedURL}`)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
