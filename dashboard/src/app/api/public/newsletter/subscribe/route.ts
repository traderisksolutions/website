import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { subscribe } from '@/lib/newsletter/store'

// The sites post newsletter sign-ups here, server to server. Header x-api-key: SITE_INTAKE_KEY.
// Body { site, email, source_url }. Double opt-in: the row starts pending and a confirmation
// email goes out once the site's sender is set up.
export const dynamic = 'force-dynamic'

function authorised(req: Request): boolean {
  const want = process.env.SITE_INTAKE_KEY ?? ''
  const got = req.headers.get('x-api-key') ?? ''
  if (want.length < 32 || got.length !== want.length) return false
  return timingSafeEqual(Buffer.from(got), Buffer.from(want))
}

export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const text = await req.text()
  if (text.length > 5_000) return NextResponse.json({ error: 'Body too large' }, { status: 413 })
  let body: Record<string, unknown>
  try { body = JSON.parse(text) } catch { return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 }) }
  try {
    const r = await subscribe(body?.site, body?.email, body?.source_url)
    if ('error' in r) return NextResponse.json(r, { status: 422 })
    return NextResponse.json({ ok: true, status: r.status })
  } catch (e) {
    console.error('newsletter subscribe failed', e instanceof Error ? e.message.slice(0, 300) : e)
    return NextResponse.json({ error: 'Could not subscribe' }, { status: 500 })
  }
}
