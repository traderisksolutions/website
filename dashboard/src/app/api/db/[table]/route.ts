import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

/**
 * Narrow server proxy for the few tables the chat dock reads and writes from the browser.
 *
 * The browser can no longer talk to the database directly: the anon key holds no table rights,
 * deliberately. This forwards with the service key, but ONLY for the tables listed here, and
 * only for a caller holding a valid session. Anything else is refused, so a compromised page
 * cannot turn this into a general-purpose database gateway.
 */
const ALLOWED = new Set(['chat_threads', 'chat_messages', 'chat_ui_state', 'chat_drafts'])

const sbH = (prefer?: string) => {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  const h: Record<string, string> = { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
  if (prefer) h.Prefer = prefer
  return h
}

async function guard(table: string) {
  if (!ALLOWED.has(table)) return NextResponse.json({ error: 'table not permitted' }, { status: 403 })
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return null
}

async function forward(req: NextRequest, table: string, method: string) {
  const bad = await guard(table)
  if (bad) return bad
  const qs = req.nextUrl.search.replace(/^\?/, '')
  const prefer = req.headers.get('x-prefer') ?? (method === 'GET' ? undefined : 'return=representation')
  const body = method === 'GET' || method === 'DELETE' ? undefined : await req.text()
  const res = await fetch(`${SB_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`, {
    method, headers: sbH(prefer), body, cache: 'no-store',
  })
  const text = await res.text()
  return new NextResponse(text || '[]', {
    status: res.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

type Ctx = { params: Promise<{ table: string }> }
export async function GET(req: NextRequest, ctx: Ctx)    { return forward(req, (await ctx.params).table, 'GET') }
export async function POST(req: NextRequest, ctx: Ctx)   { return forward(req, (await ctx.params).table, 'POST') }
export async function PATCH(req: NextRequest, ctx: Ctx)  { return forward(req, (await ctx.params).table, 'PATCH') }
export async function DELETE(req: NextRequest, ctx: Ctx) { return forward(req, (await ctx.params).table, 'DELETE') }
