import { NextRequest, NextResponse } from 'next/server'
import { withStaff } from '@/lib/auth/guard'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const sbH = () => {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

/**
 * Messages on a chat thread. The dock used to read chat_messages straight from the browser and
 * receive realtime inserts; neither is possible now, so it polls this instead. Server-side, so
 * the service key stays here and the session cookie is what authorises the caller.
 */
export const GET = withStaff(async (req: NextRequest) => {
  const threadId = req.nextUrl.searchParams.get('thread_id')
  if (!threadId) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

  const res = await fetch(
    `${SB_URL}/rest/v1/chat_messages?thread_id=eq.${encodeURIComponent(threadId)}&order=created_at.asc&select=*`,
    { headers: sbH(), cache: 'no-store' },
  )
  if (!res.ok) return NextResponse.json({ error: 'load failed' }, { status: 502 })
  return NextResponse.json(await res.json(), { headers: { 'Cache-Control': 'no-store' } })
}, { error: 'Not authenticated' })
