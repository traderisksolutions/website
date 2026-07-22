/**
 * POST /api/pricing-matrix/quote/[id]/recommend   { priorities? }
 * Runs Opus over the stored comparison + plan selections (weighted by the client's priorities) and
 * stores a context-aware recommendation on the quotation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { recommend }                 from '@/lib/pm-recommend'
import type { QuoteResult, Selection } from '@/lib/pm-quote'

export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { priorities } = await req.json().catch(() => ({})) as { priorities?: string }

    const row = await fetch(`${SB_URL}/rest/v1/pm_quotations?id=eq.${id}&select=results,selections&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null) as { results: QuoteResult | null; selections: Record<string, Selection> } | null
    if (!row?.results) return NextResponse.json({ error: 'Quote has no results' }, { status: 400 })

    const { recommendation, error } = await recommend(row.results, row.selections ?? {}, priorities)
    if (!recommendation) return NextResponse.json({ error: error ?? 'recommendation failed' }, { status: 502 })

    await fetch(`${SB_URL}/rest/v1/pm_quotations?id=eq.${id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ priorities: priorities || null, recommendation }) })
    void logActivity({ action: 'pm.quote_recommended', resource_type: 'pm_quotation', resource_id: id })
    return NextResponse.json({ ok: true, recommendation })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
