/**
 * The product library, first cut (docs/eb-v2.md section 6, P3; decision D3: Nathan's workbook is the
 * source of truth). The house workbook prices /eb; the rate tables (gb_rate_tables, gb_rates) price
 * placements and analysis. This compares them rate by rate, so every difference is listed for
 * Nathan to settle, never silently overwritten. Pure; tested in gb-library.test.ts.
 *
 * A rate is keyed by product, cover, plan (number, ward and beds, co-pay), life (employee or
 * dependant), occupation class and basis; the workbook's age band is matched to the table row whose
 * band holds its first age. Equal within 1 cent or 0.5%; the workbook's net plus 9% GST to the cent
 * is counted apart (the same price stated with tax). A rate with no key on the other side is
 * counted as only on that side, never dropped quietly.
 */
import type { WbRate } from './workbook'

const GST = 0.09

/** The workbook product a rate table belongs to, by its insurer. */
export function productOfTable(insurerName: string | null | undefined): string | null {
  const n = (insurerName ?? '').toLowerCase()
  if (/\bqbe\b|steadfast/.test(n)) return 'Steadfast MCare+'
  if (/raffles|\brcc\b/.test(n)) return 'RCC Enhanced III'
  if (/\bincome\b/.test(n)) return 'Income FlexCare'
  if (/singapore life|singlife/.test(n)) return 'Singlife MyBenefits Plus'
  if (/\baia\b/.test(n)) return 'AIA Flexi Vital Care Plus'
  return null
}

/** The workbook cover a rate table's product code names; null when it bundles covers the workbook prices apart. */
export function coverOfCode(code: string | null | undefined): string | null {
  const c = (code ?? '').toLowerCase()
  if (/\+\s*(gaci|sp)\b|copay|co-pay/.test(c)) return null
  if (/ghs\+emm/.test(c)) return 'Hospital & Surgical'
  if (/hospital|\bghs\b/.test(c)) return 'Hospital & Surgical'
  if (/major medical|\bemm\b|\bgmm\b/.test(c)) return 'Major Medical'
  if (/specialist|\bgosc\b/.test(c)) return 'Outpatient Specialist'
  if (/outpatient gp|primary care|\bgopc\b|^gp$|\(gp\)/.test(c)) return 'Outpatient GP'
  if (/dental|\bgd\b/.test(c)) return 'Dental'
  if (/critical illness|\bgci\b/.test(c)) return 'Critical Illness'
  if (/term life|\bgtl\b/.test(c)) return 'Term Life'
  if (/personal accident|\bgpa\b|\bgadd\b/.test(c)) return 'Personal Accident'
  return null
}

/** "Plan 1 · Private 1-bed · 20%", "PLAN 1", "Plan 1 (PTE 1-bed)" → "1|pte1|20". */
export function planKey(plan: string | null | undefined): string {
  const p = (plan ?? '').toLowerCase()
  const num = /plan\s*([a-z]?\d+[a-z]?)/.exec(p)?.[1] ?? p.replace(/[^a-z0-9]+/g, '').slice(0, 12)
  const ward = /private|\bpte\b/.test(p) ? 'pte' : /government|\bgovt?\b/.test(p) ? 'gov' : ''
  const beds = /\b(1|4)[\s-]*bed/.exec(p)?.[1] ?? ''
  const copay = /20\s*%/.test(p) ? '20' : '0'
  return `${num}|${ward}${beds}|${copay}`
}

export type TableRate = {
  rate_table_id: string; product_code: string; plan_code: string; age_min: number | null; age_max: number | null
  member_type: string | null; premium: number; renewal_only: boolean | null; dimensions: { occupation_class?: unknown } | null
}

const lifeOf = (t: string | null | undefined): 'EE' | 'Dep' | null => (/^emp/i.test(t ?? '') ? 'EE' : /^dep/i.test(t ?? '') ? 'Dep' : null)
const clsOf = (v: unknown): string => (v == null || v === '' || v === '—' ? '' : String(v).replace(/^class\s*/i, '').trim())

export type Difference = { cover: string; plan: string; ages: string; life: string; cls: string; renewal: boolean; workbook: number; table: number; pct: number }
/** gst: the table's figure is the workbook's net plus 9% GST, the same price stated with tax. */
export type Comparison = { compared: number; equal: number; gst: number; differ: Difference[]; workbookOnly: number; tableOnly: number }

const keyOf = (cover: string, plan: string, life: 'EE' | 'Dep' | null, cls: string, renewal: boolean) => `${cover}|${planKey(plan)}|${life ?? ''}|${cls}|${renewal ? 'R' : 'N'}`

/** One workbook product against one rate table. */
export function compareRates(product: string, wb: readonly WbRate[], table: readonly TableRate[]): Comparison {
  const mine = wb.filter(r => r.insurer === product)
  const theirs = new Map<string, TableRate[]>()
  for (const t of table) {
    const cover = coverOfCode(t.product_code)
    if (!cover) continue
    const k = keyOf(cover, t.plan_code, lifeOf(t.member_type), clsOf(t.dimensions?.occupation_class), !!t.renewal_only)
    theirs.set(k, [...(theirs.get(k) ?? []), t])
  }
  const used = new Set<TableRate>()
  const out: Comparison = { compared: 0, equal: 0, gst: 0, differ: [], workbookOnly: 0, tableOnly: 0 }
  for (const r of mine) {
    // A workbook rate for every life matches the table's employee rate when the table splits them.
    const keys = [keyOf(r.cover, r.plan, r.life, clsOf(r.cls), r.renewalOnly), ...(r.life ? [] : [keyOf(r.cover, r.plan, 'EE', clsOf(r.cls), r.renewalOnly)])]
    const rows = keys.map(k => theirs.get(k)).find(x => x?.length) ?? []
    const hit = rows.find(t => (t.age_min ?? 0) <= r.from && (t.age_max == null || t.age_max >= r.from))
    if (!hit) { out.workbookOnly++; continue }
    used.add(hit)
    out.compared++
    const diff = Math.abs(hit.premium - r.net)
    const pct = r.net ? (hit.premium - r.net) / r.net : 0
    if (diff <= 0.01 || Math.abs(pct) <= 0.005) { out.equal++; continue }
    if (Math.abs(hit.premium - r.net * (1 + GST)) <= 0.011) { out.gst++; continue }
    out.differ.push({ cover: r.cover, plan: r.plan, ages: `${r.from}–${r.to}`, life: r.life ?? 'All', cls: clsOf(r.cls) || '–', renewal: r.renewalOnly, workbook: r.net, table: hit.premium, pct })
  }
  for (const rows of theirs.values()) for (const t of rows) if (!used.has(t)) out.tableOnly++
  out.differ.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
  return out
}
