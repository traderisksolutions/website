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
 * database. What replaces it compares on facts: the dollar difference, the lines that differ,
 * and the lines where an insurer has nothing on record. The value score and its explanation
 * (../score) are built on this output with the broker's own weights.
 *
 * The canon is what makes this possible at all. Before gb_label_alias existed, AIA's "GHS+EMM",
 * Income's "Group Hospital and Surgical (GHS)" and QBE's "Group Hospital & Surgical (GHS)" were
 * three unrelated strings, so there was nothing to put in one column — which is why the earlier
 * attempt had to hand the whole problem to a model and hope.
 */
import { fetchAllRows } from '../postgrest-all'
import { compare, type Option } from './compare'
import { resolveProduct } from './resolve'
import { verificationOf } from './verification'


const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type CategoryMap = Record<string, Record<string, Record<string, string>>>
type Meta  = { id: string; insurer_name: string; product_code: string; rules: unknown }
type Plan  = { rate_table_id: string; product_code: string; plan_code: string; plan_name: string | null
               hospital_type: string | null; beds: string | null; co_payment: string | null; canon_codes: string[] | null }
type Ben   = { rate_table_id: string; product_code: string | null; plan_code: string | null
               benefit_name: string; value_text: string | null; value_numeric: number | null
               canon_benefit: string | null }
type Result = { rate_table_id?: string; insurer_name: string; total: number; missing?: number }
type QLine = { rate_table_id: string | null; member_index: number; relationship: string | null; plan_code: string | null; product_code: string | null }

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

export class CompareError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

/** Build the comparison for a saved quotation and store it on the row. Used by the route and by
 *  the group benefits agent, which compares its own draft before anyone opens it. */
export async function compareQuotation(id: string, opts: { hideIdentical?: boolean; hideEmpty?: boolean } = {}) {
  const { hideIdentical, hideEmpty } = opts
  const qRes = await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}` +
    `&select=company_name,rate_table_ids,category_map,results&limit=1`, { headers: sbH(), cache: 'no-store' })
  const q = qRes.ok ? (await qRes.json())[0] as
    { company_name: string | null; rate_table_ids: string[] | null; category_map: CategoryMap | null; results: Result[] | null } : null
  if (!q) throw new CompareError('Quotation not found', 404)

  const tableIds = q.rate_table_ids ?? []
  if (!tableIds.length) throw new CompareError('Nothing to compare', 400)
  const catMap = q.category_map ?? {}
  const totals = q.results ?? []

  // Which plan tiers the quote used, per table, as (product label, plan) pairs. A plan code
  // alone is not a tier: "Plan 1" exists under GHS, GP, SP and dental on the same table, and
  // matching on the code alone made Income's specialist plan read as its hospital plan.
  const usedByTable: Record<string, { label: string; plan: string }[]> = {}
  for (const [tid, prods] of Object.entries(catMap)) {
    const seen = new Set<string>(), list: { label: string; plan: string }[] = []
    for (const [label, cats] of Object.entries(prods)) for (const plan of Object.values(cats)) {
      if (plan && !seen.has(`${label}\u0000${plan}`)) { seen.add(`${label}\u0000${plan}`); list.push({ label, plan }) }
    }
    usedByTable[tid] = list
  }

  const ids = tableIds.map(i => `"${i}"`).join(',')
  const [metaRes, plans, bens, qLines] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=in.(${ids})&select=id,insurer_name,product_code,rules&limit=100`, { headers: sbH(), cache: 'no-store' }),
    fetchAllRows<Plan>(`${SB_URL}/rest/v1/gb_plans?rate_table_id=in.(${ids})` +
          `&select=rate_table_id,product_code,plan_code,plan_name,hospital_type,beds,co_payment,canon_codes`, sbH()),
    fetchAllRows<Ben>(`${SB_URL}/rest/v1/gb_benefits?rate_table_id=in.(${ids})` +
          `&select=rate_table_id,product_code,plan_code,benefit_name,value_text,value_numeric,canon_benefit`, sbH()),
    fetchAllRows<QLine>(`${SB_URL}/rest/v1/gb_quote_lines?quotation_id=eq.${id}` +
          `&select=rate_table_id,member_index,relationship,plan_code,product_code`, sbH()),
  ])
  const metas = metaRes.ok  ? await metaRes.json()  as Meta[] : []

  // PEPM is per employee: dependants are priced but are not the denominator. A census with no
  // relationship column counts every member as an employee, which is what it is.
  const everyone = new Set(qLines.map(l => l.member_index))
  const selves = new Set(qLines.filter(l => /^(self|employee|staff|member)$/i.test(l.relationship ?? '')).map(l => l.member_index))
  const employees = selves.size || everyone.size || 0

  /** Members priced on one plan tier of one table. Lines store the plan as quoted ("Plan 1");
   *  the tier may carry the chosen variant ("Plan 1 · Private 1-bedded"). */
  const membersOn = (tableId: string, label: string | null, planCode: string) => {
    const base = planCode.split(' · ')[0]
    return new Set(qLines.filter(l => l.rate_table_id === tableId && (!label || l.product_code === label) &&
      (l.plan_code === planCode || l.plan_code === base)).map(l => l.member_index)).size
  }

  // By rate table first. Matching on the insurer's name alone broke the moment a name was
  // tidied — "QBE Insurance (Singapore) Pte Ltd" to "QBE" — and a quotation lost its total.
  const resultFor = (m: Meta) => totals.find(t => t.rate_table_id === m.id) ?? totals.find(t => t.insurer_name === m.insurer_name)
  const options: Option[] = []

  for (const m of metas) {
    const r = resultFor(m)
    const tablePlans = plans.filter(p => p.rate_table_id === m.id)
    const resolved = (label: string) => resolveProduct(label).codes

    // The tiers to compare: those the quote used, or — for a quote with no category map —
    // every tier on the table.
    const tiers: { label: string | null; plan: string; row: Plan | null }[] = (usedByTable[m.id]?.length
      ? usedByTable[m.id].map(({ label, plan }) => {
          const base = plan.split(' · ')[0]
          const byPlan = tablePlans.filter(p => p.plan_code === plan || p.plan_code === base)
          // The plan row for this product: same label first; else one whose canonical product
          // the label also resolves to (AIA prices "GHS+EMM" against plan rows filed as "GHS").
          const want = resolved(label)
          const row = byPlan.find(p => p.product_code === label)
            ?? byPlan.find(p => (p.canon_codes ?? []).some(c => want.includes(c)))
            ?? null
          return { label, plan, row }
        })
      : tablePlans.map(p => ({ label: p.product_code, plan: p.plan_code, row: p })))

    for (const { label, plan: planCode, row: planRow } of tiers) {
      // A bundled label ("GHS+EMM", "GP + SP") covers every product it names, so both count.
      const productCodes = Array.from(new Set([
        ...(label ? resolved(label) : []),
        ...(planRow?.canon_codes ?? []),
      ]))
      if (!productCodes.length) continue    // unmapped label: quotable, not comparable

      const values: Option['values'] = {}
      // Benefit schedules are read per base plan ("Plan 1"); calculator plan codes carry the
      // variant the broker chose ("Plan 1 · Government 4-bedded"). A schedule row matches either.
      const basePlan = planCode.split(' · ')[0]
      // A row with no plan code applies to every tier on that table. Schedule-wide rows go in
      // FIRST so a tier's own value overrides them: AIA still carries a pre-scan row with no
      // plan code for room & board, and whichever of the two landed last would otherwise win,
      // making the comparison depend on the order PostgREST happened to return. Canonical codes
      // are per product, so another product's "Plan 1" rows land on lines this option never shows.
      for (const pass of [null, basePlan, planCode] as (string | null)[]) {
        for (const b of bens) {
          if (b.rate_table_id !== m.id || !b.canon_benefit) continue
          if ((b.plan_code ?? null) !== pass) continue
          values[b.canon_benefit] = { text: b.value_text, numeric: b.value_numeric }
        }
      }
      // The plan tier's own attributes last. Where they exist they come from the insurer's
      // calculator, which names the exact ward ("Government, 4-Bedded") the premium was priced
      // on — more precise than a brochure's "1 or 4 Bedded" for the same plan. Ward and hospital
      // type belong to hospital cover only; a co-payment goes to whichever product the tier is.
      if (planRow) {
        const fw = productCodes.includes('GHS_FW')
        const hospital = fw || productCodes.includes('GHS')
        for (const attr of PLAN_ATTR_LINES) {
          const v = planRow[attr.field]
          if (typeof v !== 'string' || !v.trim()) continue
          if (hospital) values[fw ? attr.fw : attr.ghs] = { text: v.trim(), numeric: null }
          else if (attr.field === 'co_payment') {
            const p = productCodes.find(c => ['GOPC', 'GOSC', 'GD'].includes(c))
            if (p) values[`${p}_CO_PAYMENT`] = { text: v.trim(), numeric: null }
          }
        }
      }

      options.push({
        key: `${m.id}:${label ?? ''}:${planCode}`,
        insurerName: m.insurer_name,
        planCode,
        planLabel: planRow?.plan_name ?? null,
        productCodes,
        annualTotal: r?.total ?? null,
        pricingGaps: r?.missing ?? 0,
        verification: verificationOf(m.rules).status,
        memberCount: membersOn(m.id, label, planCode),
        values,
      })
    }
  }

  if (!options.length) {
    throw new CompareError('No quoted plan on these tables carries a canonical product. Map the insurer labels first.', 400)
  }

  const comparison = { ...compare(options, { hideIdentical: !!hideIdentical, hideEmpty: hideEmpty !== false }), employees }

  await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}`, {
    method: 'PATCH', headers: sbH(),
    body: JSON.stringify({ benefits_analysis: comparison }),
  }).catch(() => {})
  return { comparison, options }
}
