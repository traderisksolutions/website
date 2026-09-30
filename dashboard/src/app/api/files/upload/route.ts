import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { putObject } from '@/lib/storage/drive-store'

export const maxDuration = 120

/**
 * Browser file upload. Supabase issued a signed URL and the browser PUT straight to storage;
 * Drive has no equivalent, so the bytes come here and the server writes them.
 */
export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const path = req.nextUrl.searchParams.get('path')
  if (!path || path.includes('..')) return NextResponse.json({ error: 'bad path' }, { status: 400 })

  const mime = req.headers.get('content-type') ?? 'application/octet-stream'
  const bytes = Buffer.from(await req.arrayBuffer())
  if (bytes.length === 0) return NextResponse.json({ error: 'empty body' }, { status: 400 })

  try {
    const id = await putObject(path, bytes, mime)
    return NextResponse.json({ path, driveFileId: id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'upload failed' }, { status: 502 })
  }
}
