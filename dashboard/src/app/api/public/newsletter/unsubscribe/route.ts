import { NextResponse } from 'next/server'
import { getNlSite, unsubscribe } from '@/lib/newsletter/store'

// One-click unsubscribe: GET from the footer link, POST from mail clients honouring
// List-Unsubscribe-Post (RFC 8058). The link carries an HMAC over the subscriber id.
export const dynamic = 'force-dynamic'

async function run(req: Request) {
  const sp = new URL(req.url).searchParams
  try { return await unsubscribe(sp.get('s') ?? '', sp.get('t') ?? '') }
  catch (e) { console.error('newsletter unsubscribe failed', e instanceof Error ? e.message : e); return null }
}

export async function GET(req: Request) {
  const site = await run(req)
  const base = (site ?? await getNlSite('corpcover').catch(() => null))?.base_url ?? 'https://corpcover.com'
  return NextResponse.redirect(`${base.replace(/\/$/, '')}/unsubscribed?ok=${site ? 1 : 0}`)
}

export async function POST(req: Request) {
  return new NextResponse(null, { status: (await run(req)) ? 200 : 400 })
}
