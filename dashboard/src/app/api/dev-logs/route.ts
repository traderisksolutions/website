import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export interface DevLogEntry {
  id:           string
  session_date: string   // ISO date "YYYY-MM-DD"
  title:        string
  project:      string
  changes:      string[]
  tags:         string[] | null
  created_at:   string
}

// ── GET /api/dev-logs ─────────────────────────────────────────────────────────
// Returns all log entries ordered by session_date DESC, created_at DESC

export async function GET() {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/dev_logs?select=*&order=session_date.desc,created_at.desc`,
      { headers: sbHeaders(), cache: 'no-store' },
    )
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }
    const rows: DevLogEntry[] = await res.json()
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── POST /api/dev-logs ────────────────────────────────────────────────────────
// Inserts a new log entry.
// Requires: Authorization: Bearer <SUPABASE_SERVICE_KEY>
// Body: { session_date, title, project, changes, tags? }

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.replace(/^Bearer\s+/i, '').trim()
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? ''

  if (!token || token !== serviceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    session_date?: string
    title?:        string
    project?:      string
    changes?:      string[]
    tags?:         string[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { session_date, title, project = 'trs-dashboard', changes, tags } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: 'changes must be a non-empty array' }, { status: 400 })
  }

  const payload: Record<string, unknown> = {
    title:   title.trim(),
    project: project.trim(),
    changes,
  }
  if (session_date) payload.session_date = session_date
  if (tags?.length)  payload.tags = tags

  try {
    const res = await fetch(`${SB_URL}/rest/v1/dev_logs`, {
      method:  'POST',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body:    JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }
    const rows = await res.json()
    return NextResponse.json(rows[0] ?? {}, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
