/**
 * POST /api/group-benefits/quote/[id]/compare-benefits
 *
 * Lines the quoted plans up against each other on the canonical benefit schedule, states the
 * premium difference, and marks where they differ. Deterministic: no model call, no cost, the
 * same quotation always compares the same way.
 *
 * It used to send every benefit line to Opus 4.8 and store the prose that came back — a
 * narrative that weighed price against coverage and steered towards an option. Two problems with
 * that. It asserted a judgement from weights nobody agreed to, hiding the trade-off the broker
 * is paid to make; and it paid a frontier model per quotation to restate figures already in the
 * database. What replaces it compares on facts and stops: the dollar difference, the lines that
 * differ, and the lines where an insurer has nothing on record.
 *
 * The canon is what makes this possible at all. Before gb_label_alias existed, AIA's "GHS+EMM",
 * Income's "Group Hospital and Surgical (GHS)" and QBE's "Group Hospital & Surgical (GHS)" were
 * three unrelated strings, so there was nothing to put in one column — which is why the earlier
 * attempt had to hand the whole problem to a model and hope.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/log-activity'
import { compare, type Option } from '@/lib/gb/compare'
import { resolveProduct } from '@/lib/gb/resolve'

export const maxDuration = 60

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type CategoryMap = Record<string, Record<string, Record<string, string>>>
type Meta  = { id: string; insurer_name: string; product_code: string }
type Plan  = { rate_table_id: string; product_code: string; plan_code: string; plan_name: string | null
               hospital_type: string | null; beds: string | null; co_payment: string | null; canon_codes: string[] | null }
type Ben   = { rate_table_id: string; product_code: string | null; plan_code: string | null
               benefit_name: string; value_text: string | null; value_numeric: number | null
               canon_benefit: string | null }
type Result = { rate_table_id?: string; insurer_name: string; total: number; missing?: number }

/**
 * The plan tier's own attributes ARE canonical benefit lines, so they are read as such rather
 * than shown in a separate box. gb_plans carries a room tier for all 16 plan rows while
 * gb_benefits carries one for three, so for most options this is the only source for the line
 * clients ask about first.
 */
const PLAN_ATTR_LINES: { field: keyof Plan; ghs: string; fw: string }[] = [
  { field: 'hospital_type', ghs: 'GHS_HOSPITAL_TYPE', fw: 'GHS_HOSPITAL_TYPE' },
  { field: 'beds',          ghs: 'GHS_ROOM_BOARD',    fw: 'GHSFW_ROOM_BOARD' },
  { field: 'co_payment',    ghs: 'GHS_CO_PAYMENT',    fw: 'GHSFW_CO_PAYMENT' },
]

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { hideIdentical, hideEmpty } = await req.json().catch(() => ({})) as
      { hideIdentical?: boolean; hideEmpty?: boolean }

    const qRes = await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}` +
      `&select=company_name,rate_table_ids,category_map,results&limit=1`, { headers: sbH(), cache: 'no-store' })
    const q = qRes.ok ? (await qRes.json())[0] as
      { company_name: string | null; rate_table_ids: string[] | null; category_map: CategoryMap | null; results: Result[] | null } : null
    if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

    const tableIds = q.rate_table_ids ?? []
    if (!tableIds.length) return NextResponse.json({ error: 'Nothing to compare' }, { status: 400 })
    const catMap = q.category_map ?? {}
    const totals = q.results ?? []

    // Which plan tiers the quote actually used, per table.
    const usedByTable: Record<string, Set<string>> = {}
    for (const [tid, prods] of Object.entries(catMap)) {
      const set = new Set<string>()
      for (const cats of Object.values(prods)) for (const plan of Object.values(cats)) if (plan) set.add(plan)
      usedByTable[tid] = set
    }

    const ids = tableIds.map(i => `"${i}"`).join(',')
    const [metaRes, plansRes, benRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=in.(${ids})&select=id,insurer_name,product_code&limit=100`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/gb_plans?rate_table_id=in.(${ids})` +
            `&select=rate_table_id,product_code,plan_code,plan_name,hospital_type,beds,co_payment,canon_codes&limit=2000`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/gb_benefits?rate_table_id=in.(${ids})` +
            `&select=rate_table_id,product_code,plan_code,benefit_name,value_text,value_numeric,canon_benefit&limit=8000`, { headers: sbH(), cache: 'no-store' }),
    ])
    const metas = metaRes.ok  ? await metaRes.json()  as Meta[] : []
    const plans = plansRes.ok ? await plansRes.json() as Plan[] : []
    const bens  = benRes.ok   ? await benRes.json()   as Ben[]  : []

    // By rate table first. Matching on the insurer's name alone broke the moment a name was
    // tidied — "QBE Insurance (Singapore) Pte Ltd" to "QBE" — and a quotation lost its total.
    const resultFor = (m: Meta) => totals.find(t => t.rate_table_id === m.id) ?? totals.find(t => t.insurer_name === m.insurer_name)
    const options: Option[] = []

    for (const m of metas) {
      const used = usedByTable[m.id]
      const r = resultFor(m)
      const planRows = plans.filter(p => p.rate_table_id === m.id && (!used || used.size === 0 || used.has(p.plan_code)))
      // A table with no plan-tier rows still has premiums and benefit lines, so it is quoted as
      // one option per used plan code rather than dropped.
      const codes = planRows.length ? planRows.map(p => p.plan_code)
                                    : Array.from(used ?? new Set<string>())
      for (const planCode of Array.from(new Set(codes))) {
        const planRow = planRows.find(p => p.plan_code === planCode) ?? null
        const productCodes = planRow?.canon_codes?.length
          ? planRow.canon_codes
          : resolveProduct(planRow?.product_code ?? m.product_code ?? '').codes
        if (!productCodes.length) continue    // unmapped label: quotable, not comparable

        const values: Option['values'] = {}
        // Benefit schedules are read per base plan ("Plan 1"); calculator plan codes carry the
        // variant the broker chose ("Plan 1 · Government 4-bedded"). A schedule row matches either.
        const basePlan = planCode.split(' · ')[0]
        // A row with no plan code applies to every tier on that table. Schedule-wide rows go in
        // FIRST so a tier's own value overrides them: AIA still carries a pre-scan row with no
        // plan code for room & board, and whichever of the two landed last would otherwise win,
        // making the comparison depend on the order PostgREST happened to return.
        for (const pass of [null, basePlan, planCode] as (string | null)[]) {
          for (const b of bens) {
            if (b.rate_table_id !== m.id || !b.canon_benefit) continue
            if ((b.plan_code ?? null) !== pass) continue
            values[b.canon_benefit] = { text: b.value_text, numeric: b.value_numeric }
          }
        }
        // The plan tier's own attributes last. Where they exist they come from the insurer's
        // calculator, which names the exact ward ("Government, 4-Bedded") the premium was priced
        // on — more precise than a brochure's "1 or 4 Bedded" for the same plan.
        if (planRow) {
          const fw = productCodes.includes('GHS_FW')
          for (const attr of PLAN_ATTR_LINES) {
            const v = planRow[attr.field]
            if (typeof v === 'string' && v.trim()) values[fw ? attr.fw : attr.ghs] = { text: v.trim(), numeric: null }
          }
        }

        options.push({
          key: `${m.id}:${planCode}`,
          insurerName: m.insurer_name,
          planCode,
          planLabel: planRow?.plan_name ?? null,
          productCodes,
          annualTotal: r?.total ?? null,
          pricingGaps: r?.missing ?? 0,
          values,
        })
      }
    }

    if (!options.length) {
      return NextResponse.json({ error: 'No quoted plan on these tables carries a canonical product. Map the insurer labels first.' }, { status: 400 })
    }

    const comparison = compare(options, { hideIdentical: !!hideIdentical, hideEmpty: hideEmpty !== false })

    await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}`, {
      method: 'PATCH', headers: sbH(),
      body: JSON.stringify({ benefits_analysis: comparison }),
    }).catch(() => {})
    void logActivity({ action: 'gb.benefits_compared', resource_type: 'gb_quotation', resource_id: id,
                       new_value: { options: options.length, lines: comparison.coverage.linesCompared } })
    return NextResponse.json({ comparison })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
