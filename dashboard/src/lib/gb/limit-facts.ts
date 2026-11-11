/**
 * Limit facts: what each plan actually gives, as numbers, one row per plan, read from the plan
 * table (hospital type, ward, co-payment) and the benefit table (limits). The customiser resolves
 * a client's numbers to the plan at each insurer that meets them (src/lib/gb/custom.ts).
 *
 * Parsing is by code from the schedule wording the benefit table holds; the parsers are pure and
 * tested. A figure that cannot be read is null and the resolver says so, never guesses.
 */
import { sbTry } from '@/lib/crm/db'

export type GhsPlanFacts = {
  plan: string
  hospital: 'private' | 'government' | null
  beds: 1 | 2 | 4 | null
  /** Co-insurance on the base plan, percent. */
  coins: number
  kind: 'annual' | 'per_disability' | null
  /** The annual limit, or the per-disability limit for other hospital services, in S$. */
  limit: number | null
}
export type PlanLimit = { plan: string; limit: number | null }
export type LimitFacts = {
  table: string
  ghs: GhsPlanFacts[]
  emm: PlanLimit[]
  gosc: PlanLimit[]
  gd: PlanLimit[]
  /** Co-pay per GP visit in S$ (0 = none). */
  gopc: { plan: string; copay: number | null }[]
  gtl: PlanLimit[]
}

export const dollars = (s: string | null | undefined): number | null => {
  const m = String(s ?? '').match(/\$\s?([\d,]+(?:\.\d+)?)/)
  return m ? Number(m[1].replace(/,/g, '')) : null
}
export const hospitalOf = (s: string | null | undefined): GhsPlanFacts['hospital'] => /gov|restruct|grh/i.test(String(s ?? '')) ? 'government' : /priv|pte/i.test(String(s ?? '')) ? 'private' : null
export const bedsOf = (s: string | null | undefined): GhsPlanFacts['beds'] => { const m = String(s ?? '').match(/\b([124])\b/); return m ? Number(m[1]) as 1 | 2 | 4 : null }
export const coinsOf = (s: string | null | undefined): number => { const t = String(s ?? '').trim(); if (/^(nil|none|no\b|0\s*%)/i.test(t)) return 0; const m = t.match(/(\d+)\s*%/); return m ? Number(m[1]) : 0 }
/** "$300,000 annual policy limit" → annual 300000; "Not applicable; $25,000 per disability" → per_disability 25000 (misc fills it when the limit cell names none). */
export function ghsLimitOf(annualText: string | null | undefined, miscText: string | null | undefined): { kind: GhsPlanFacts['kind']; limit: number | null } {
  const a = String(annualText ?? '')
  if (/annual policy limit|overall annual limit|per policy year/i.test(a) && dollars(a) != null && !/not applicable/i.test(a.split(';')[0])) return { kind: 'annual', limit: dollars(a) }
  if (/per disability/i.test(a) && dollars(a) != null) return { kind: 'per_disability', limit: dollars(a) }
  const m = dollars(miscText)
  if (m != null) return { kind: 'per_disability', limit: m }
  if (/no overall limit|per disability/i.test(a)) return { kind: 'per_disability', limit: null }
  return { kind: null, limit: null }
}
export const copayOf = (s: string | null | undefined): number | null => { const t = String(s ?? ''); if (/not applicable|nil|none|no co-?pay/i.test(t)) return 0; return dollars(t) }

type PlanRow = { rate_table_id: string; product_code: string; plan_code: string; hospital_type: string | null; beds: string | null; co_payment: string | null }
type FactRow = { rate_table_id: string; product_code: string; plan_code: string; canon_benefit: string; value_text: string | null; value_numeric: number | null }

const isGhs = (code: string) => /hospital|\bGHS\b/i.test(code) && !/FW|foreign|inpatient — /i.test(code) || /^GHS\+EMM$/i.test(code)

/** The facts for every approved table in `tableIds`, keyed by table id. */
export async function loadLimitFacts(tableIds: string[]): Promise<Map<string, LimitFacts>> {
  const out = new Map<string, LimitFacts>()
  if (!tableIds.length) return out
  const ids = tableIds.join(',')
  const [plans, facts] = await Promise.all([
    sbTry<PlanRow[]>(`gb_plans?rate_table_id=in.(${ids})&select=rate_table_id,product_code,plan_code,hospital_type,beds,co_payment&limit=2000`, []),
    sbTry<FactRow[]>(`gb_benefits?rate_table_id=in.(${ids})&canon_benefit=in.(GHS_ANNUAL_LIMIT,GHS_HOSP_MISC,EMM_ANNUAL_LIMIT,GOSC_ANNUAL_LIMIT,GD_ANNUAL_LIMIT,GOPC_CO_PAYMENT,GTL_SUM_ASSURED)&select=rate_table_id,product_code,plan_code,canon_benefit,value_text,value_numeric&limit=5000`, []),
  ])
  const fact = (t: string, plan: string, canon: string) => facts.find(f => f.rate_table_id === t && f.plan_code === plan && f.canon_benefit === canon)
  const text = (f: FactRow | undefined) => f ? (f.value_text ?? (f.value_numeric != null ? `$${f.value_numeric}` : null)) : null
  for (const t of tableIds) {
    const mine = plans.filter(p => p.rate_table_id === t)
    const lf: LimitFacts = { table: t, ghs: [], emm: [], gosc: [], gd: [], gopc: [], gtl: [] }
    const seen = new Set<string>()
    for (const p of mine) {
      const key = `${p.product_code}|${p.plan_code}`
      if (seen.has(key)) continue
      seen.add(key)
      const code = p.product_code
      if (isGhs(code)) {
        const lim = ghsLimitOf(text(fact(t, p.plan_code, 'GHS_ANNUAL_LIMIT')), text(fact(t, p.plan_code, 'GHS_HOSP_MISC')))
        lf.ghs.push({ plan: p.plan_code, hospital: hospitalOf(p.hospital_type), beds: bedsOf(p.beds), coins: coinsOf(p.co_payment) || coinsOf(p.plan_code), ...lim })
      } else if (/major medical|\bEMM\b/i.test(code)) lf.emm.push({ plan: p.plan_code, limit: dollars(text(fact(t, p.plan_code, 'EMM_ANNUAL_LIMIT'))) })
      else if (/specialist|GOSC|\bSP\b/i.test(code)) lf.gosc.push({ plan: p.plan_code, limit: dollars(text(fact(t, p.plan_code, 'GOSC_ANNUAL_LIMIT'))) })
      else if (/dental|\bGD\b/i.test(code)) lf.gd.push({ plan: p.plan_code, limit: dollars(text(fact(t, p.plan_code, 'GD_ANNUAL_LIMIT'))) })
      else if (/outpatient gp|primary care|GOPC|\bGP\b/i.test(code) && !/specialist|SP/i.test(code)) lf.gopc.push({ plan: p.plan_code, copay: copayOf(text(fact(t, p.plan_code, 'GOPC_CO_PAYMENT'))) })
      else if (/term life|\bGTL\b/i.test(code)) lf.gtl.push({ plan: p.plan_code, limit: dollars(text(fact(t, p.plan_code, 'GTL_SUM_ASSURED'))) ?? dollars(p.plan_code) })
    }
    out.set(t, lf)
  }
  return out
}
