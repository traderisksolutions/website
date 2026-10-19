import { NextResponse } from 'next/server'
import { confirm, getNlSite } from '@/lib/newsletter/store'

// Clicked from the confirmation email. The link carries an HMAC over the subscriber id.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  let site = null
  try { site = await confirm(sp.get('s') ?? '', sp.get('t') ?? '') } catch (e) { console.error('newsletter confirm failed', e instanceof Error ? e.message : e) }
  const base = (site ?? await getNlSite('corpcover').catch(() => null))?.base_url ?? 'https://corpcover.com'
  return NextResponse.redirect(`${base.replace(/\/$/, '')}/subscribed?ok=${site ? 1 : 0}`)
}
