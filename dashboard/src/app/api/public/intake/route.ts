import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { saveIntake } from '@/lib/intake/store'

// The business's websites post buyer submissions here, server to server (corpcover.com Find first).
// Header x-api-key: SITE_INTAKE_KEY (32+ characters, constant-time compare). Body: see saveIntake.
// The same submission id is posted on every step, so a partial form is still a lead.
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
  if (text.length > 200_000) return NextResponse.json({ error: 'Body over 200 KB' }, { status: 413 })
  let body: Record<string, unknown>
  try { body = JSON.parse(text) } catch { return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Body must be an object' }, { status: 400 })
  try {
    const err = await saveIntake(body, { userAgent: req.headers.get('x-forwarded-user-agent') })
    if (err) return NextResponse.json({ error: err }, { status: 422 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('site intake failed', e instanceof Error ? e.message.slice(0, 300) : e)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }
}
