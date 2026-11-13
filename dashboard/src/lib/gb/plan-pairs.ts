/**
 * Plan rules: which plans go together at an insurer. Income FlexCare's major medical plan is tied
 * to its hospital plan: Plan 3 hospital takes Plan 3 major medical, and one is not sold without the
 * other (Ernest, 13 Nov 2026). Staff keep the rules in Settings › Plan rules (app_settings
 * `gb_plan_rules`); Compare cover applies them on every change of plan.
 *
 * A rule: at `product`, `cover` goes with `tiedTo`. `match` 'same_plan' allows only the plan with
 * the same plan number ("Plan 2A/2B" carries 2A and 2B), 'any_plan' any plan. `required` takes the
 * cover whenever its partner is taken; without it the cover may be left out. With no partner plan,
 * the cover is none.
 *
 * Pure apart from load/save; safe in the browser. Tested in src/__tests__/gb-plan-pairs.test.ts.
 */
export type PlanRule = { id: string; product: string; cover: string; tiedTo: string; match: 'same_plan' | 'any_plan'; required: boolean }

export const DEFAULT_RULES: PlanRule[] = [
  { id: 'income-mm', product: 'Income FlexCare', cover: 'Major Medical', tiedTo: 'Hospital & Surgical', match: 'same_plan', required: true },
]

/** The plan numbers a plan name carries: "Plan 2A/2B" → 2a, 2b; "Plan 1 (Private 1-bed)" → 1. */
export const planNumbers = (plan: string): string[] => {
  const head = String(plan ?? '').replace(/\(.*$/, '')
  return [...head.matchAll(/(\d+[a-z]?)/gi)].map(m => m[1].toLowerCase().replace(/^0+(?=\d)/, ''))
}

/** The plans of `rule.cover` allowed beside `partner`. Empty when none goes with it. */
export function allowedPlans(rule: PlanRule, partner: string, options: string[]): string[] {
  if (!partner) return []
  if (rule.match === 'any_plan') return options
  const want = planNumbers(partner)
  return options.filter(p => planNumbers(p).some(n => want.includes(n)))
}

/** One product's picks with its rules applied. Pure. */
export function applyRules(rules: PlanRule[], product: string, picks: Record<string, string>, options: Record<string, string[]>): Record<string, string> {
  const out = { ...picks }
  for (const r of rules) {
    if (r.product !== product) continue
    const allowed = allowedPlans(r, out[r.tiedTo] ?? '', options[r.cover] ?? [])
    const now = out[r.cover] ?? ''
    if (!allowed.length) out[r.cover] = ''
    else if (now && !allowed.includes(now)) out[r.cover] = allowed[0]
    else if (!now && r.required) out[r.cover] = allowed[0]
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
    out.push({ id: String(r?.id ?? '').slice(0, 40) || `${product}|${cover}`, product, cover, tiedTo, match: r?.match === 'any_plan' ? 'any_plan' : 'same_plan', required: r?.required !== false })
  }
  return out
}

const KEY = 'gb_plan_rules'
export type StoredRules = { rules: PlanRule[]; updatedBy: string | null; updatedAt: string | null }

export async function loadRules(): Promise<StoredRules> {
  const { sbTry } = await import('@/lib/crm/db')
  const [r] = await sbTry<{ value: string }[]>(`app_settings?key=eq.${KEY}&select=value&limit=1`, [])
  try { if (r?.value) { const v = JSON.parse(r.value) as StoredRules; if (Array.isArray(v.rules)) return v } } catch { /* default below */ }
  return { rules: DEFAULT_RULES, updatedBy: null, updatedAt: null }
}

export async function saveRules(rules: PlanRule[], by: string | null): Promise<StoredRules> {
  const { sb } = await import('@/lib/crm/db')
  const v: StoredRules = { rules, updatedBy: by, updatedAt: new Date().toISOString() }
  await sb('app_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify([{ key: KEY, value: JSON.stringify(v), updated_at: v.updatedAt }]) })
  return v
}
