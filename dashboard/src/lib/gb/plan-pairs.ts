/**
 * Plan rules: which plans go together at an insurer, as the brochures state them (13 Nov 2026):
 * Income FlexCare's extended major medical is part of hospital plans 2 to 5 and priced in them;
 * RCC and Singlife sell major medical as an optional rider on the same plan as the hospital plan;
 * RCC's specialist rider needs its GP rider. Staff keep the rules in Employment Benefits › Plan
 * rules (app_settings `gb_plan_rules`); Compare cover applies them on every change of plan.
 *
 * A rule: at `product`, `cover` goes with `tiedTo`. `match` 'same_plan' allows only the plan with
 * the same plan number ("Plan 2A/2B" carries 2A and 2B), 'any_plan' any plan. `required` takes the
 * cover whenever its partner is taken; without it the cover may be left out. With no partner plan,
 * the cover is none. `premium` 'included': the cover costs nothing on its own; the partner's rate
 * carries it. `source`: where the rule is stated.
 *
 * Pure apart from load/save; safe in the browser. Tested in src/__tests__/gb-plan-pairs.test.ts.
 */
/**
 * `match`: 'same_plan' the same plan number ("Plan 2A/2B" carries 2A and 2B; an A-plan "Plan 1A" also
 * takes plan 1); 'any_plan' any plan; 'not_above' a plan whose sum assured is not above the
 * partner's (RCC critical illness under term life); 'same_or_cap' the same plan, else the highest
 * not above the partner's sum (Singlife: GTL Plan 6 caps critical illness at Plan 5); 'exclusive'
 * never with the partner: the partner already includes it (Singlife and AIA specialist include GP).
 */
export type PlanMatch = 'same_plan' | 'any_plan' | 'not_above' | 'same_or_cap' | 'exclusive'
export type PlanRule = { id: string; product: string; cover: string; tiedTo: string; match: PlanMatch; required: boolean; premium: 'own' | 'included'; source: string }

export const DEFAULT_RULES: PlanRule[] = [
  { id: 'income-mm', product: 'Income FlexCare', cover: 'Major Medical', tiedTo: 'Hospital & Surgical', match: 'same_plan', required: true, premium: 'included', source: 'Employees FlexCare brochure 2026, pages 6 and 8' },
  { id: 'rcc-mm', product: 'RCC Enhanced III', cover: 'Major Medical', tiedTo: 'Hospital & Surgical', match: 'same_plan', required: false, premium: 'own', source: 'RCC Enhanced III brochure, 14 Jul 2025, page 18' },
  { id: 'rcc-sp', product: 'RCC Enhanced III', cover: 'Outpatient Specialist', tiedTo: 'Outpatient GP', match: 'any_plan', required: false, premium: 'own', source: 'RCC Enhanced III brochure, 14 Jul 2025, pages 4 and 18' },
  { id: 'singlife-mm', product: 'Singlife MyBenefits Plus', cover: 'Major Medical', tiedTo: 'Hospital & Surgical', match: 'same_plan', required: false, premium: 'own', source: 'MyBenefits Plus brochure, Jun 2022, page 12' },
  // AIA has no major medical plan of its own: it is in the hospital plan and its premium; plan 4's annual limit follows major medical.
  { id: 'aia-mm', product: 'AIA Flexi Vital Care Plus', cover: 'Major Medical', tiedTo: 'Hospital & Surgical', match: 'any_plan', required: true, premium: 'included', source: 'Client call 19 Nov 2026, note 21; Package Calculator V1.5 Summary!B33, Lists!AI "N/A" (bundled in H&S)' },
  // TRS EB Package Calculator V1.5 rules (eb-rules.md section 3, 20 Nov 2026).
  { id: 'steadfast-mm', product: 'Steadfast MCare+', cover: 'Major Medical', tiedTo: 'Hospital & Surgical', match: 'any_plan', required: true, premium: 'included', source: 'Package Calculator V1.5 Summary!B28; Lists!R "N/A" (bundled in H&S)' },
  { id: 'steadfast-eap', product: 'Steadfast MCare+', cover: 'EAP (add-on)', tiedTo: 'Hospital & Surgical', match: 'any_plan', required: false, premium: 'own', source: 'Steadfast brochure V12 p.16; Calc!AF2 (employees only)' },
  { id: 'singlife-gp', product: 'Singlife MyBenefits Plus', cover: 'Outpatient GP', tiedTo: 'Outpatient Specialist', match: 'exclusive', required: false, premium: 'own', source: 'Package Calculator V1.5 Summary!B35: Specialist = GP + SP + DXL; one or the other' },
  { id: 'aia-gp', product: 'AIA Flexi Vital Care Plus', cover: 'Outpatient GP', tiedTo: 'Outpatient Specialist', match: 'exclusive', required: false, premium: 'own', source: 'Package Calculator V1.5 Summary!B33; AIA brochure p.19 item 1: Specialist is the combined GP and SP rider' },
  { id: 'rcc-ci', product: 'RCC Enhanced III', cover: 'Critical Illness', tiedTo: 'Term Life', match: 'not_above', required: false, premium: 'own', source: 'RCC brochure 14 Jul 2025, p.4 and p.18: GCI sum assured not above GTL' },
  { id: 'income-ci', product: 'Income FlexCare', cover: 'Critical Illness', tiedTo: 'Term Life', match: 'same_plan', required: false, premium: 'own', source: 'Income FlexCare brochure Feb 2026, p.13 a: same plan type as term life' },
  { id: 'singlife-ci', product: 'Singlife MyBenefits Plus', cover: 'Critical Illness', tiedTo: 'Term Life', match: 'same_or_cap', required: false, premium: 'own', source: 'MyBenefits Plus brochure 2022, p.12: same plan; GTL Plan 6 caps critical illness at Plan 5' },
  { id: 'aia-ci', product: 'AIA Flexi Vital Care Plus', cover: 'Critical Illness', tiedTo: 'Term Life', match: 'same_plan', required: false, premium: 'own', source: 'AIA brochure May 2025, p.19 item 5: GACI on the same plan as GTL' },
]

/** The plan AIA's major medical shows: no plan of its own, priced in the hospital premium. */
export const IN_HOSPITAL = 'In hospital premium'

/**
 * Stored rules with any default rule they lack (by product and cover) added at read time, so a
 * default added in code (aia-mm, 20 Nov 2026) reaches a saved rule set without a data write. Pure.
 */
export function withDefaults(rules: PlanRule[]): PlanRule[] {
  const has = new Set(rules.map(r => `${r.product}|${r.cover}`))
  return [...rules, ...DEFAULT_RULES.filter(d => !has.has(`${d.product}|${d.cover}`))]
}

/** The plan numbers a plan name carries: "Plan 2A/2B" → 2a, 2b; "Plan 1 (Private 1-bed)" → 1. */
export const planNumbers = (plan: string): string[] => {
  const head = String(plan ?? '').replace(/\(.*$/, '')
  return [...head.matchAll(/(\d+[a-z]?)/gi)].map(m => m[1].toLowerCase().replace(/^0+(?=\d)/, ''))
}

const sumOf = (plan: string): number | null => {
  const m = String(plan ?? '').match(/\$\s?([\d,.]+)\s*(k|m)?/i)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n * (m[2]?.toLowerCase() === 'k' ? 1000 : m[2]?.toLowerCase() === 'm' ? 1_000_000 : 1) : null
}

/** The plans of `rule.cover` allowed beside `partner`. Empty when none goes with it. An exclusive cover is allowed only without its partner. */
export function allowedPlans(rule: PlanRule, partner: string, options: string[]): string[] {
  if (rule.match === 'exclusive') return partner ? [] : options
  if (!partner) return []
  if (rule.match === 'any_plan') return options
  const capped = () => {
    const cap = sumOf(partner)
    return cap == null ? [] : options.filter(p => (sumOf(p) ?? Infinity) <= cap).sort((a, b) => (sumOf(b) ?? 0) - (sumOf(a) ?? 0))
  }
  if (rule.match === 'not_above') return capped()
  // An A-plan (Singlife "Plan 1A", 20% co-insurance) takes the rider of its plan number too.
  const want = planNumbers(partner).flatMap(n => [n, n.replace(/[a-z]$/, '')])
  const same = options.filter(p => planNumbers(p).some(n => want.includes(n)))
  return same.length || rule.match === 'same_plan' ? same : capped()
}

/**
 * One product's picks with its rules applied. Pure. `changed` is the cover a person just set: then
 * an exclusive pair is left as the person chose (both priced, noted on the page); without it (the
 * Same and Lower tier picks) the exclusive cover gives way to the partner that includes it.
 */
export function applyRules(rules: PlanRule[], product: string, picks: Record<string, string>, options: Record<string, string[]>, changed?: string): Record<string, string> {
  const out = { ...picks }
  for (const r of rules) {
    if (r.product !== product) continue
    // A person may take both, as the workbook allows and prices (Jarod, 20 Nov 2026); the page notes it.
    // Only the tiers' own picks (no `changed`) give way to the partner that includes the cover.
    if (r.match === 'exclusive' && changed) continue
    const allowed = allowedPlans(r, out[r.tiedTo] ?? '', options[r.cover] ?? [])
    const now = out[r.cover] ?? ''
    if (!allowed.length) out[r.cover] = ''
    else if (now && !allowed.includes(now)) out[r.cover] = allowed[0]
    else if (!now && r.required) out[r.cover] = allowed[0]
  }
  return out
}

/**
 * Every hospital plan at a product with each way its tied covers can go with it, for the broker to
 * pick from: "Plan 3" alone and "Plan 3 + major medical Plan 3" where the rider is optional.
 * Pure. `options` per cover; returns picks for the tied covers only.
 */
export function permutations(rules: PlanRule[], product: string, base: string, options: Record<string, string[]>): Record<string, string>[] {
  const mine = rules.filter(r => r.product === product && r.tiedTo === base)
  let out: Record<string, string>[] = (options[base] ?? []).map(p => ({ [base]: p }))
  for (const r of mine) {
    out = out.flatMap(o => {
      const allowed = allowedPlans(r, o[base], options[r.cover] ?? [])
      const withIt = allowed.map(p => ({ ...o, [r.cover]: p }))
      return !allowed.length ? [{ ...o, [r.cover]: '' }] : r.required ? withIt : [{ ...o, [r.cover]: '' }, ...withIt]
    })
  }
  return out
}

/** The rule governing a cover at a product, if any. */
export const ruleFor = (rules: PlanRule[], product: string, cover: string): PlanRule | null => rules.find(r => r.product === product && r.cover === cover) ?? null

/** Bounds rules from a request: known products and covers only, a cover never tied to itself, at most 50. */
export function cleanRules(raw: unknown, products: readonly string[], covers: readonly string[]): PlanRule[] | null {
  if (!Array.isArray(raw)) return null
  const out: PlanRule[] = []
  for (const r of raw.slice(0, 50) as Record<string, unknown>[]) {
    const product = String(r?.product ?? ''), cover = String(r?.cover ?? ''), tiedTo = String(r?.tiedTo ?? '')
    if (!products.includes(product) || !covers.includes(cover) || !covers.includes(tiedTo) || cover === tiedTo) return null
    if (out.some(o => o.product === product && o.cover === cover)) return null
    const match: PlanMatch = (['any_plan', 'not_above', 'same_or_cap', 'exclusive'] as const).find(m => m === r?.match) ?? 'same_plan'
    out.push({ id: String(r?.id ?? '').slice(0, 40) || `${product}|${cover}`, product, cover, tiedTo, match, required: r?.required !== false, premium: r?.premium === 'included' ? 'included' : 'own', source: String(r?.source ?? '').trim().slice(0, 160) })
  }
  return out
}

const KEY = 'gb_plan_rules'
export type StoredRules = { rules: PlanRule[]; updatedBy: string | null; updatedAt: string | null }

export async function loadRules(): Promise<StoredRules> {
  const { sbTry } = await import('@/lib/crm/db')
  const [r] = await sbTry<{ value: string }[]>(`app_settings?key=eq.${KEY}&select=value&limit=1`, [])
  try { if (r?.value) { const v = JSON.parse(r.value) as StoredRules; if (Array.isArray(v.rules)) return { ...v, rules: withDefaults(v.rules.map(x => ({ ...x, premium: x.premium ?? 'own', source: x.source ?? '' }))) } } } catch { /* default below */ }
  return { rules: DEFAULT_RULES, updatedBy: null, updatedAt: null }
}

export async function saveRules(rules: PlanRule[], by: string | null): Promise<StoredRules> {
  const { sb } = await import('@/lib/crm/db')
  const v: StoredRules = { rules, updatedBy: by, updatedAt: new Date().toISOString() }
  await sb('app_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify([{ key: KEY, value: JSON.stringify(v), updated_at: v.updatedAt }]) })
  return v
}
