import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@supabase/ssr'
import { cookies }                   from 'next/headers'
import { runRagIndex, getRagIndexStatus } from '@/lib/rag-index'

const TRS_DOMAIN = 'trade-risksol.com'

function cronAuthOk(req: NextRequest): boolean {
  const bearer = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET ?? ''}`
  const token  = req.nextUrl.searchParams.get('token') === process.env.CRON_SECRET
  return bearer || token
}

async function dashboardAuthOk(): Promise<boolean> {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return !!user && !!user.email?.toLowerCase().endsWith(`@${TRS_DOMAIN}`)
}

// GET — returns current index status (used by analytics page + Vercel cron)
export async function GET(req: NextRequest) {
  // Vercel cron calls GET with Authorization header — treat as a re-index trigger
  if (cronAuthOk(req) && req.nextUrl.searchParams.get('reindex') === '1') {
    try {
      const result = await runRagIndex()
      return NextResponse.json({ ok: true, ...result })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  // Otherwise return status (no auth needed for read)
  try {
    const status = await getRagIndexStatus()
    return NextResponse.json(status)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST — triggers re-index (cron secret OR logged-in TRS dashboard user)
export async function POST(req: NextRequest) {
  if (!cronAuthOk(req) && !(await dashboardAuthOk())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body   = await req.json().catch(() => ({}))
    const force  = body?.force === true
    const folder = typeof body?.folder === 'string' ? body.folder : undefined
    const result = await runRagIndex(force, folder)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
