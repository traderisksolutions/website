/**
 * GET /api/companies/[id]/cases
 * Every Nexus case belonging to a company, for the company page's Nexus tab. Same
 * thread_count/last_activity enrichment as GET /api/nexus/cases, just pre-filtered to one
 * company instead of listing every case in the system.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'

type CaseRow = { id: string; name: string; description: string | null; status: string; created_at: string; updated_at: string }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const casesRes = await fetch(`${SB_URL}/rest/v1/cases?company_id=eq.${id}&order=updated_at.desc&select=*`, { headers: sbH(), cache: 'no-store' })
    const cases: CaseRow[] = casesRes.ok ? await casesRes.json() : []
    if (!Array.isArray(cases) || cases.length === 0) return NextResponse.json({ cases: [] })

    const enriched = await Promise.all(cases.map(async c => {
      const ctRes = await fetch(`${SB_URL}/rest/v1/case_threads?case_id=eq.${c.id}&select=thread_id`, { headers: sbH(), cache: 'no-store' })
      const ctRows: { thread_id: string }[] = ctRes.ok ? await ctRes.json() : []
      const threadIds = ctRows.map(r => r.thread_id)

      let last_activity: string | null = null
      if (threadIds.length > 0) {
        const tRes = await fetch(`${SB_URL}/rest/v1/email_threads?id=in.(${threadIds.join(',')})&select=last_message_at&order=last_message_at.desc&limit=1`, { headers: sbH(), cache: 'no-store' })
        const tRows: { last_message_at: string | null }[] = tRes.ok ? await tRes.json() : []
        last_activity = tRows[0]?.last_message_at ?? null
      }

      return { ...c, thread_count: threadIds.length, last_activity }
    }))

    return NextResponse.json({ cases: enriched })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
