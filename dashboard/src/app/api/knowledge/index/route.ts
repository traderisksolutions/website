import { NextRequest, NextResponse } from 'next/server'
import { runRagIndex, getRagIndexStatus } from '@/lib/rag-index'

function authOk(req: NextRequest): boolean {
  const bearer = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET ?? ''}`
  const token  = req.nextUrl.searchParams.get('token') === process.env.CRON_SECRET
  return bearer || token
}

// GET — returns current index status (used by analytics page + Vercel cron)
export async function GET(req: NextRequest) {
  // Vercel cron calls GET with Authorization header — treat as a re-index trigger
  if (authOk(req) && req.nextUrl.searchParams.get('reindex') === '1') {
    try {
      const result = await runRagIndex()
      return NextResponse.json({ ok: true, ...result })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  // Otherwise just return status (no auth needed for read)
  try {
    const status = await getRagIndexStatus()
    return NextResponse.json(status)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST — triggers re-index (requires CRON_SECRET)
export async function POST(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body  = await req.json().catch(() => ({}))
    const force = body?.force === true
    const result = await runRagIndex(force)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
