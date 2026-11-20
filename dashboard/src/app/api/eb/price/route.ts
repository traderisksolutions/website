/**
 * POST /api/eb/price
 *   { effective_date, basis, current_insurer, categories: [{ name, members, design, today }] }
 *   → every product priced for every category from the house workbook (src/lib/gb/eb-quote.ts).
 *
 * Code prices; no model is called. Nothing is saved.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Member } from '@/lib/gb-quote'
import { MAX_CATEGORIES, TIERS, type Design } from '@/lib/gb/eb-quote'
import { priceDesign } from '@/lib/gb/eb-price'

export const maxDuration = 60

const ISO = /^\d{4}-\d{2}-\d{2}$/
const designOf = (raw: unknown): Partial<Design> => {
  const out: Partial<Design> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const t of TIERS) { const v = (raw as Record<string, unknown>)[t.key]; if (Number.isInteger(v) && (v as number) >= 0 && (v as number) < t.tiers.length) out[t.key] = v as number }
  return out
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { effective_date?: string; basis?: string; current_insurer?: string | null; categories?: { name?: string; members?: Member[]; design?: unknown; today?: unknown }[] }
  const cats = Array.isArray(body.categories) ? body.categories : []
  if (!cats.length) return NextResponse.json({ error: 'Choose at least one category.' }, { status: 400 })
  if (cats.length > MAX_CATEGORIES) return NextResponse.json({ error: `Up to ${MAX_CATEGORIES} categories.` }, { status: 400 })
  if (cats.some(c => !Array.isArray(c.members) || !c.members.length || c.members.length > 5000)) return NextResponse.json({ error: 'Each category needs the people from the census.' }, { status: 400 })
  const effectiveDate = body.effective_date && ISO.test(body.effective_date) ? body.effective_date : null
  if (!effectiveDate) return NextResponse.json({ error: 'Set the policy start date.' }, { status: 400 })

  const { freshWorkbook } = await import('@/lib/gb/workbook')
  const { loadRules } = await import('@/lib/gb/plan-pairs')
  const wb = await freshWorkbook()
  if (!wb) return NextResponse.json({ error: 'The house workbook is not loaded. Reload it on Quotation register › Insurers.' }, { status: 503 })
  const { rules } = await loadRules()

  const priced = priceDesign({
    wb, rules, effectiveDate, basis: body.basis === 'new_business' ? 'new_business' : 'renewal', currentInsurer: body.current_insurer?.trim() || null,
    categories: cats.map(c => ({ name: String(c.name ?? 'Category').slice(0, 80), members: c.members!, design: designOf(c.design), today: designOf(c.today) })),
  })
  return NextResponse.json(priced)
}
