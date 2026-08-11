import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

// GET /api/engagement/chat-learnings?limit=50
// Pooled Nexus chat learnings (across all cases) for the /analytics/eval dashboard's Chat
// Learnings tab — read-only visibility into what the nightly extraction cron
// (src/app/api/cron/nexus-chat-learnings/route.ts) has captured. Joined with case names so
// each row is legible without a second round-trip from the client.
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 200)

    const res = await fetch(
      `${SB_URL}/rest/v1/nexus_chat_learnings?order=created_at.desc&limit=${limit}&select=id,case_id,email_type,question,answer,created_at`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const rows: { id: string; case_id: string; email_type: string | null; question: string; answer: string; created_at: string }[] =
      res.ok ? await res.json() : []
    const learnings = Array.isArray(rows) ? rows : []

    const caseIds = Array.from(new Set(learnings.map(r => r.case_id)))
    let caseNames: Record<string, string> = {}
    if (caseIds.length > 0) {
      const casesRes = await fetch(
        `${SB_URL}/rest/v1/cases?id=in.(${caseIds.join(',')})&select=id,name`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      const cases: { id: string; name: string }[] = casesRes.ok ? await casesRes.json() : []
      caseNames = Object.fromEntries((Array.isArray(cases) ? cases : []).map(c => [c.id, c.name]))
    }

    const countRes = await fetch(
      `${SB_URL}/rest/v1/nexus_chat_learnings?select=id`,
      { headers: { ...sbHeaders('count=exact'), Range: '0-0' }, cache: 'no-store' }
    )
    const totalHeader = countRes.headers.get('content-range') // "0-0/123"
    const total = totalHeader ? parseInt(totalHeader.split('/')[1] ?? '0', 10) : learnings.length

    return NextResponse.json({
      learnings: learnings.map(r => ({ ...r, case_name: caseNames[r.case_id] ?? null })),
      total,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
