/**
 * GET  /api/group-benefits/quote/[id]/analysis   → the saved analysis pack and the quotation's header
 * POST /api/group-benefits/quote/[id]/analysis   { run?: true; suggested?: PackageKey; current_insurer?; excluded? }
 *   run: prices every package at every insurer again on the quotation's census, in one run.
 *   suggested: moves the suggested rung (the broker's call); the rest of the pack is kept.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sbTry, enc } from '@/lib/crm/db'
import { loadAnalysis, runAnalysis, saveAnalysis } from '@/lib/gb/analysis'
import { packageByKey } from '@/lib/gb/packages'
import type { Member } from '@/lib/gb-quote'

export const maxDuration = 300

type Q = { id: string; company_name: string | null; effective_date: string | null; basis: string | null; member_count: number; census: Member[] | null; requirement: { current_insurer?: string | null } | null }
const Q_COLS = 'id,company_name,effective_date,basis,member_count,census,requirement'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const [q] = await sbTry<Q[]>(`gb_quotations?id=eq.${enc(id)}&select=${Q_COLS}&limit=1`, [])
  if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
  const pack = await loadAnalysis(id)
  return NextResponse.json({ quotation: { id: q.id, company_name: q.company_name, effective_date: q.effective_date, basis: q.basis, member_count: q.member_count }, pack })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { run?: boolean; suggested?: string; current_insurer?: string | null; excluded?: string[] }
  const [q] = await sbTry<Q[]>(`gb_quotations?id=eq.${enc(id)}&select=${Q_COLS}&limit=1`, [])
  if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
  try {
    if (body.run) {
      if (!q.census?.length || !q.effective_date) return NextResponse.json({ error: 'This quotation has no member list or start date' }, { status: 422 })
      const prev = await loadAnalysis(id)
      const pack = await runAnalysis({
        quotationId: id, members: q.census, effectiveDate: q.effective_date, basis: q.basis === 'renewal' ? 'renewal' : 'new_business',
        currentInsurer: body.current_insurer ?? prev?.currentInsurer ?? q.requirement?.current_insurer ?? null,
        excluded: body.excluded ?? prev?.excluded ?? [], suggested: prev?.suggested ?? null, by: user.email ?? null,
      })
      return NextResponse.json({ pack })
    }
    if (body.suggested) {
      const pack = await loadAnalysis(id)
      if (!pack) return NextResponse.json({ error: 'No analysis yet' }, { status: 404 })
      if (!packageByKey(body.suggested)) return NextResponse.json({ error: 'Unknown package' }, { status: 400 })
      const next = { ...pack, suggested: body.suggested as typeof pack.suggested, because: `chosen by ${user.email ?? 'the broker'}` }
      await saveAnalysis(next)
      return NextResponse.json({ pack: next })
    }
    return NextResponse.json({ error: 'Nothing to do' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
