/**
 * GET /api/group-benefits/quote/:id/compare → CompareData: today's plan beside the five products,
 *   every plan of every cover priced per category on the quotation's census (src/lib/gb/compare-cover.ts).
 * PUT { picks: { product: { category: { cover: plan } } } } → saves the broker's choices.
 *
 * Prices are computed from the stored workbook in milliseconds, so they are not cached; the picks
 * are saved in app_settings `gb_compare:<id>` and read by the email draft.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadCompare, savePicks, type Picks } from '@/lib/gb/compare-cover'

export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const d = await loadCompare(id)
  if ('error' in d) return NextResponse.json({ error: d.error }, { status: d.status })
  return NextResponse.json(d)
}

/** Bounded: product → category → cover → plan, strings only. */
function cleanPicks(picks: unknown): Record<string, Picks> | null {
  if (!picks || typeof picks !== 'object') return null
  const clean: Record<string, Picks> = {}
  for (const [p, cats] of Object.entries(picks as Record<string, unknown>).slice(0, 8)) {
    clean[p] = {}
    for (const [c, covers] of Object.entries((cats ?? {}) as Record<string, unknown>).slice(0, 40)) {
      clean[p][c] = {}
      for (const [cv, plan] of Object.entries((covers ?? {}) as Record<string, unknown>).slice(0, 10)) if (typeof plan === 'string') clean[p][c][cv] = plan.slice(0, 120)
    }
  }
  return clean
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => null) as { picks?: unknown } | null
  const clean = cleanPicks(body?.picks)
  if (!clean) return NextResponse.json({ error: 'picks required' }, { status: 400 })
  await savePicks(id, clean)
  return NextResponse.json({ ok: true })
}
