/**
 * GET  /api/group-benefits/quote/[id]/analysis   → the saved analysis pack and the quotation's header
 * POST /api/group-benefits/quote/[id]/analysis   { run?: true; suggested?: PackageKey; custom?: CustomSpec; current_insurer?; excluded? }
 *   run: prices every package at every insurer again on the quotation's census, in one run.
 *   suggested: moves the suggested rung (the broker's call); the rest of the pack is kept.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sbTry, enc } from '@/lib/crm/db'
import { loadAnalysis, runCurrent, runCustom, runSplit, saveAnalysis } from '@/lib/gb/analysis'
import type { Schedule } from '@/lib/gb/current'
import { sb } from '@/lib/crm/db'
import { packageByKey, type PackageKey } from '@/lib/gb/packages'
import type { CustomSpec } from '@/lib/gb/custom'
import type { Member } from '@/lib/gb-quote'

export const maxDuration = 300

type Q = { id: string; company_name: string | null; effective_date: string | null; basis: string | null; member_count: number; census: Member[] | null; requirement: { current_insurer?: string | null; current_schedule?: Schedule | null } | null }
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
  const counts = new Map<string, number>()
  for (const m of q.census ?? []) if (!/spouse|child|dependa/i.test(m.relationship)) counts.set(m.category || 'Default', (counts.get(m.category || 'Default') ?? 0) + 1)
  const categories = [...counts].map(([name, members]) => ({ name, members })).sort((a, b) => b.members - a.members)
  return NextResponse.json({ quotation: { id: q.id, company_name: q.company_name, effective_date: q.effective_date, basis: q.basis, member_count: q.member_count }, categories, pack })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { run?: boolean; schedule?: Schedule; suggested?: string; custom?: CustomSpec; split?: Record<string, string>; current_insurer?: string | null; excluded?: string[] }
  const [q] = await sbTry<Q[]>(`gb_quotations?id=eq.${enc(id)}&select=${Q_COLS}&limit=1`, [])
  if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
  try {
    if (body.run) {
      if (!q.census?.length || !q.effective_date) return NextResponse.json({ error: 'This quotation has no member list or start date' }, { status: 422 })
      const prev = await loadAnalysis(id)
      const schedule = body.schedule ?? prev?.schedule ?? q.requirement?.current_schedule ?? null
      if (!schedule) return NextResponse.json({ error: 'State the current cover first: what each plan on the census means.', needsSchedule: true }, { status: 422 })
      if (body.schedule) await sb(`gb_quotations?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ requirement: { ...(q.requirement ?? {}), current_schedule: body.schedule, current_insurer: body.current_insurer ?? q.requirement?.current_insurer ?? null } }) })
      const pack = await runCurrent({
        quotationId: id, members: q.census, schedule, effectiveDate: q.effective_date, basis: q.basis === 'renewal' ? 'renewal' : 'new_business',
        currentInsurer: body.current_insurer ?? prev?.currentInsurer ?? q.requirement?.current_insurer ?? null,
        excluded: body.excluded ?? prev?.excluded ?? [], by: user.email ?? null,
      })
      return NextResponse.json({ pack })
    }
    if (body.custom) {
      if (!q.census?.length) return NextResponse.json({ error: 'This quotation has no member list' }, { status: 422 })
      const c = body.custom
      const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null)
      const spec: CustomSpec = {
        hospital: c.hospital === 'government' ? 'government' : 'private', beds: c.beds === 1 || c.beds === 2 ? c.beds : 4,
        limitKind: c.limitKind === 'annual' ? 'annual' : 'per_disability', limit: num(c.limit, 5_000, 1_000_000) ?? 15_000, coins: c.coins === 20 || c.coins === 25 ? c.coins : 0,
        gmm: num(c.gmm, 10_000, 500_000), gpCopay: num(c.gpCopay, 0, 100), spLimit: num(c.spLimit, 100, 50_000), gdLimit: num(c.gdLimit, 100, 10_000),
        gtl: num(c.gtl, 10_000, 5_000_000), gci: num(c.gci, 10_000, 2_000_000), pa: num(c.pa, 10_000, 5_000_000), deps: c.deps === 'none' ? 'none' : 'medical',
      }
      const pack = await runCustom(id, spec, q.census, user.email ?? null)
      return NextResponse.json({ pack })
    }
    if (body.split && typeof body.split === 'object') {
      if (!q.census?.length) return NextResponse.json({ error: 'This quotation has no member list' }, { status: 422 })
      const assignments: Record<string, PackageKey> = {}
      for (const [cat, key] of Object.entries(body.split)) if (typeof cat === 'string' && cat.length <= 80 && packageByKey(key)) assignments[cat] = key as PackageKey
      if (!Object.keys(assignments).length) return NextResponse.json({ error: 'Assign at least one category to a package' }, { status: 400 })
      const pack = await runSplit(id, assignments, q.census, user.email ?? null)
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
