/**
 * GET   /api/group-benefits/rate-tables/[id]/rich-rules
 *   Returns the draft/approved gb_computation_rules row PLUS a live verification run: a small
 *   synthetic census priced through BOTH the current AppliedRules path and the draft richRules
 *   path (reusing gb-quote.ts's real computeQuote() for both — zero duplicated pricing logic,
 *   so the comparison can't drift from what production actually does), so a reviewer sees a real
 *   premium delta before approving, not just the rule steps in the abstract.
 * PATCH /api/group-benefits/rate-tables/[id]/rich-rules   { rules?, approved? }
 *   approved=true RECOMPUTES verification server-side (same runVerification() the GET above
 *   uses) against the exact rules being approved, and stores that as the durable audit record —
 *   never trusts a client-submitted verification object, which would let a caller approve with a
 *   fabricated/stale one (e.g. rules edited in the same request as approval, "verified" against
 *   whatever was reviewed a minute ago rather than what's actually being saved). Sales Loop v2,
 *   Phase 6d: "this is the one sub-phase that touches money."
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { computeQuote }              from '@/lib/gb-quote'
import type { RateTableInfo, CategoryMap, Member } from '@/lib/gb-quote'
import type { RuleStep }             from '@/lib/pm-rules-extract'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const TEST_AGES = [30, 45, 60]
const TEST_CATEGORY = 'Sample'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}
async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

type RateRow = { product_code: string; member_type: string | null; plan_code: string; band_label: string; age_min: number | null; age_max: number | null; premium: number; renewal_only?: boolean }

/** Prices a small synthetic census (3 sample ages × every product this table rates) through
 *  computeQuote() twice — once with richRules, once without — so the comparison is exactly what
 *  production would compute, not a hand-rolled re-implementation that could drift from it. */
function runVerification(table: Omit<RateTableInfo, 'richRules'>, rates: RateRow[], richRules: RuleStep[]) {
  const products = Array.from(new Set(rates.map(r => r.product_code)))
  if (products.length === 0) return { samples: [], maxAbsDelta: 0 }

  const planFor: Record<string, string> = {}
  for (const p of products) planFor[p] = rates.find(r => r.product_code === p)?.plan_code ?? ''
  const categoryMap: CategoryMap = { [table.rate_table_id]: Object.fromEntries(products.map(p => [p, { [TEST_CATEGORY]: planFor[p] }])) }
  const members: Member[] = TEST_AGES.map(age => ({ name: `Sample ${age}`, category: TEST_CATEGORY, relationship: 'self', age }))

  const before = computeQuote(members, [{ ...table, richRules: null }], categoryMap, products, 0.09, new Date().toISOString().slice(0, 10))
  const after  = computeQuote(members, [{ ...table, richRules }],      categoryMap, products, 0.09, new Date().toISOString().slice(0, 10))

  const beforeByKey = new Map(before.lines.map(l => [`${l.member_index}|${l.product_code}`, l.premium]))
  const samples = after.lines.map(l => {
    const oldPremium = beforeByKey.get(`${l.member_index}|${l.product_code}`) ?? null
    const newPremium = l.premium
    const delta = oldPremium != null && newPremium != null ? Math.round((newPremium - oldPremium) * 100) / 100 : null
    return { product_code: l.product_code, plan_code: l.plan_code, age: l.age, oldPremium, newPremium, delta }
  })
  const maxAbsDelta = samples.reduce((m, s) => Math.max(m, Math.abs(s.delta ?? 0)), 0)
  return { samples, maxAbsDelta }
}

async function loadTableAndRates(id: string) {
  const [tRes, rRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}&select=id,insurer_id,insurer_name,age_basis,rules&limit=1`, { headers: sbH(), cache: 'no-store' }),
    fetch(`${SB_URL}/rest/v1/gb_rates?rate_table_id=eq.${id}&select=product_code,member_type,plan_code,band_label,age_min,age_max,premium,renewal_only`, { headers: sbH(), cache: 'no-store' }),
  ])
  const t = tRes.ok ? (await tRes.json())[0] : null
  const rates: RateRow[] = rRes.ok ? await rRes.json() : []
  return { t, rates }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const [{ t, rates }, ruleRes] = await Promise.all([
      loadTableAndRates(id),
      fetch(`${SB_URL}/rest/v1/gb_computation_rules?rate_table_id=eq.${id}&limit=1`, { headers: sbH(), cache: 'no-store' }).then(r => r.ok ? r.json() : []),
    ])
    if (!t) return NextResponse.json({ error: 'Rate table not found' }, { status: 404 })
    const row = Array.isArray(ruleRes) ? ruleRes[0] : null
    if (!row?.rules?.length) return NextResponse.json({ row: row ?? null, verification: null })

    const table: Omit<RateTableInfo, 'richRules'> = {
      rate_table_id: t.id, insurer_id: t.insurer_id, insurer_name: t.insurer_name,
      age_basis: t.age_basis === 'last_birthday' ? 'last_birthday' : 'next_birthday', rates, rules: t.rules ?? null,
    }
    const verification = runVerification(table, rates, row.rules as RuleStep[])
    return NextResponse.json({ row, verification })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { rules, approved } = await req.json() as { rules?: RuleStep[]; approved?: boolean }
    const body: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (rules) body.rules = rules

    if (approved === true) {
      let effectiveRules: RuleStep[] | undefined = rules
      if (!effectiveRules) {
        const existingRes  = await fetch(`${SB_URL}/rest/v1/gb_computation_rules?rate_table_id=eq.${id}&select=rules&limit=1`, { headers: sbH(), cache: 'no-store' })
        const existingRows = existingRes.ok ? await existingRes.json() : []
        effectiveRules = Array.isArray(existingRows) ? existingRows[0]?.rules : undefined
      }
      if (!Array.isArray(effectiveRules) || effectiveRules.length === 0) {
        return NextResponse.json({ error: 'No rules to approve' }, { status: 400 })
      }

      const { t, rates } = await loadTableAndRates(id)
      if (!t) return NextResponse.json({ error: 'Rate table not found' }, { status: 404 })
      const table: Omit<RateTableInfo, 'richRules'> = {
        rate_table_id: t.id, insurer_id: t.insurer_id, insurer_name: t.insurer_name,
        age_basis: t.age_basis === 'last_birthday' ? 'last_birthday' : 'next_birthday', rates, rules: t.rules ?? null,
      }

      body.status = 'approved'
      body.verification = runVerification(table, rates, effectiveRules)
      body.reviewed_by = user.id
      body.reviewed_at = new Date().toISOString()
    } else if (approved === false) {
      body.status = 'draft'
    }

    await fetch(`${SB_URL}/rest/v1/gb_computation_rules?rate_table_id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify(body) })
    void logActivity({ action: approved ? 'gb.rich_rules_approved' : 'gb.rich_rules_saved', resource_type: 'gb_rate_table', resource_id: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
