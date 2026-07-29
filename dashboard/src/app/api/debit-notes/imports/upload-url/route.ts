/**
 * POST /api/debit-notes/imports/upload-url   { filename }
 * Signed upload URL for the bulk PDF importer — browser uploads directly to the `debit-notes`
 * bucket (bypasses Vercel's ~4.5MB body limit), same technique as
 * /api/email/attachments/upload-url.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, stH, ensureBucket, BUCKET } from '@/lib/debit-note-storage'
import { randomUUID }                from 'node:crypto'

const sanitise = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150)

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { filename } = await req.json().catch(() => ({})) as { filename?: string }
    const name = sanitise(filename || 'debit-note.pdf')
    await ensureBucket()

    const path = `imports/${randomUUID()}/${name}`
    const res  = await fetch(`${SB_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', headers: stH() })
    if (!res.ok) return NextResponse.json({ error: `Could not create upload URL: ${(await res.text()).slice(0, 200)}` }, { status: 502 })
    const data  = await res.json() as { url?: string }
    const token = new URLSearchParams((data.url ?? '').split('?')[1] ?? '').get('token')
    if (!token) return NextResponse.json({ error: 'No upload token returned' }, { status: 502 })

    return NextResponse.json({ path, token, originalFilename: name })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
