/**
 * POST /api/group-benefits/builder
 *   { action: 'price', members, categories, effective_date, basis?, tier_b? }  → live prices, no write
 *   { action: 'save', quotation_id, ...the same, employee_categories?, budget? } → writes the quotation
 * Returns { insurers, grids, tables, employees, dependants }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { priceBuilder, saveBuilder, type BuilderInput } from '@/lib/gb/builder'
import { DEFAULT_REQUIREMENT, type CategoryInput, type Requirement } from '@/lib/gb/ladder'
import type { Member } from '@/lib/gb-quote'
import { logActivity } from '@/lib/log-activity'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ISO = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f-]{36}$/i
const WARDS = ['G4', 'G1', 'P4', 'P2', 'P1']
const LEVELS = ['entry', 'top']
const sum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 5_000_000 ? v : null)

function cleanRequirement(r: unknown): Requirement {
  const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
  const pick = <T,>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d)
  return {
    ward: x.ward === null ? null : pick(x.ward, WARDS, DEFAULT_REQUIREMENT.ward) as Requirement['ward'],
    wardLevel: pick(x.wardLevel, LEVELS, 'entry') as Requirement['wardLevel'],
    gmm: x.gmm === true,
    gp: x.gp === null ? null : pick(x.gp, ['nil', 'copay'], null) as Requirement['gp'],
    sp: x.sp === null ? null : pick(x.sp, LEVELS, null) as Requirement['sp'],
    dental: x.dental === null ? null : pick(x.dental, LEVELS, null) as Requirement['dental'],
    pa: sum(x.pa), gtl: sum(x.gtl), gci: sum(x.gci),
    deps: x.deps === 'none' ? 'none' : 'medical',
  }
}

function parse(b: Record<string, unknown>): BuilderInput | string {
  if (!Array.isArray(b.members) || b.members.length === 0) return 'The employee list is empty'
  if (b.members.length > 2000) return 'Up to 2,000 lives per quotation'
  if (typeof b.effective_date !== 'string' || !ISO.test(b.effective_date)) return 'Effective date is required'
  if (!Array.isArray(b.categories) || b.categories.length === 0 || b.categories.length > 10) return 'Between 1 and 10 categories'
  const categories: CategoryInput[] = (b.categories as Record<string, unknown>[]).map(c => ({
    name: String(c?.name ?? '').trim().slice(0, 60) || 'Staff',
    requirement: cleanRequirement(c?.requirement),
    overrides: c?.overrides && typeof c.overrides === 'object' ? Object.fromEntries(Object.entries(c.overrides as Record<string, unknown>).filter(([k, v]) => k.length < 120 && typeof v === 'string' && v.length < 120)) as Record<string, string> : {},
  }))
  if (new Set(categories.map(c => c.name)).size !== categories.length) return 'Category names must differ'
  const names = new Set(categories.map(c => c.name))
  const members: Member[] = (b.members as Record<string, unknown>[]).map((m, i) => ({
    name: String(m?.name ?? `Life ${i + 1}`).slice(0, 120),
    category: names.has(String(m?.category)) ? String(m.category) : categories[0].name,
    relationship: /spouse|child/i.test(String(m?.relationship)) ? String(m.relationship).toLowerCase() : 'self',
    dob: typeof m?.dob === 'string' ? m.dob : null,
    age: typeof m?.age === 'number' ? m.age : null,
    occupation_class: m?.occupation_class == null ? '1' : String(m.occupation_class),
    work_pass: typeof m?.work_pass === 'string' ? m.work_pass : null,
  }))
  return { members, categories, effective_date: b.effective_date, basis: b.basis === 'renewal' ? 'renewal' : 'new_business', tier_b: b.tier_b === true }
}

export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  const input = parse(b)
  if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 })
  try {
    if (b.action === 'save') {
      if (typeof b.quotation_id !== 'string' || !UUID.test(b.quotation_id)) return NextResponse.json({ error: 'Quotation id is not valid' }, { status: 400 })
      const budget = typeof b.budget === 'number' && b.budget > 0 ? b.budget : null
      const employee_categories = b.employee_categories && typeof b.employee_categories === 'object' ? b.employee_categories as Record<string, string> : {}
      const out = await saveBuilder({ ...input, quotation_id: b.quotation_id, budget, employee_categories })
      void logActivity({ action: 'gb.quote_built', resource_type: 'gb_quotation', resource_id: b.quotation_id, new_value: { categories: input.categories.map(c => c.name), tier_b: input.tier_b, insurers: out.insurers.length } })
      return NextResponse.json(out)
    }
    const { result: _r, categoryMap: _c, ...out } = await priceBuilder(input)
    return NextResponse.json(out)
  } catch (e) {
    console.error('[gb/builder]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not price' }, { status: 500 })
  }
}
