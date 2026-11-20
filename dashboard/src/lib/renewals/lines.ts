/**
 * TRS lines of business for renewals (docs/renewals.md). One fixed list; every policy maps to one
 * line. A person confirms a spelling's line on Renewals › To fix before it is written
 * (policy_line_aliases, policies.line_code).
 *
 *   lineFor(spelling)   the line a free-text class of insurance names, by rules; 'other' when none
 *   lineOfPolicy(p)     a policy's suggested line: Employment Benefits flag, then the spelling, then the product line slug
 *   spellingKey(s)      the alias key: lower case, single spaces, trimmed
 *
 * Rules: every rule is tried and the one whose match starts earliest in the text wins, so a
 * combined cover ("Contractors' All Risks, Project Employer's Liability") takes its first-named
 * line. Ties go to the rule listed first. Pure and browser-safe; tested against the real spellings
 * in __tests__/fixtures/line-spellings.json (person names removed).
 */

export type LineCode =
  | 'eb' | 'fwm' | 'wica' | 'gpa' | 'group_travel' | 'pl' | 'pi' | 'do' | 'cyber' | 'property' | 'car'
  | 'marine' | 'motor' | 'bonds' | 'trade_credit' | 'business_package' | 'domestic_helper' | 'travel' | 'other'

export type Line = { code: LineCode; name: string; sort: number }

/** Seeded by supabase/migrations/20261120_renewals.sql in the same order. */
export const LINES: readonly Line[] = [
  { code: 'eb', name: 'Employment Benefits', sort: 10 },
  { code: 'fwm', name: 'Foreign Worker Medical', sort: 20 },
  { code: 'wica', name: 'WICA', sort: 30 },
  { code: 'gpa', name: 'Group Personal Accident', sort: 40 },
  { code: 'group_travel', name: 'Group Travel', sort: 50 },
  { code: 'pl', name: 'Public Liability', sort: 60 },
  { code: 'pi', name: 'Professional Indemnity', sort: 70 },
  { code: 'do', name: 'Directors & Officers', sort: 80 },
  { code: 'cyber', name: 'Cyber', sort: 90 },
  { code: 'property', name: 'Property / Fire / IAR', sort: 100 },
  { code: 'car', name: 'Contractors’ All Risks', sort: 110 },
  { code: 'marine', name: 'Marine Cargo', sort: 120 },
  { code: 'motor', name: 'Motor', sort: 130 },
  { code: 'bonds', name: 'Bonds', sort: 140 },
  { code: 'trade_credit', name: 'Trade Credit', sort: 150 },
  { code: 'business_package', name: 'Business Package', sort: 160 },
  { code: 'domestic_helper', name: 'Domestic Helper', sort: 170 },
  { code: 'travel', name: 'Travel', sort: 180 },
  { code: 'other', name: 'Other', sort: 999 },
]

const NAME = new Map<string, string>(LINES.map(l => [l.code, l.name]))
export const isLineCode = (v: unknown): v is LineCode => typeof v === 'string' && NAME.has(v)
export const lineName = (code: string | null | undefined): string | null => (code ? NAME.get(code) ?? null : null)

/** Apostrophes of every kind read as none, so "Contractors' / Contractor's / Contractors’" match one rule. */
const clean = (s: string) => s.toLowerCase().replace(/[’'`]/g, '').replace(/\s+/g, ' ').trim()

const RULES: readonly [LineCode, RegExp][] = [
  ['eb', /employ(ee|ment) benefit|group (medical|health|hospital|term life)|\bghs\b|\bgtl\b|\bgmm\b|hospital(isation)? (&|and) surgical|basic medical|outpatient|comprehensive group medical/],
  ['fwm', /foreign workers? medical|\bfwmi?\b/],
  ['wica', /work(er|men)?s? injury|workmens comp|\bwica\b|\bwic\b|employers? liability/],
  ['gpa', /group personal accident|\bgpa\b|personal accident/],
  ['group_travel', /group (business )?travel/],
  ['pl', /public liab|general (comprehensive )?liability|event liability|\bpl\b/],
  ['pi', /professional indemnity|\bpi\b|investment management|asset manage(r|ment) liability|\bimi\b|medical malpractice/],
  ['do', /directors? (&|and) officers|\bd ?& ?[o0]\b/],
  ['cyber', /cyber/],
  ['property', /industrial all risks?|\biar\b|\bfire\b|commercial all risk|machinery|electronic equipment|business interruption|home insurance/],
  ['car', /contractors? all risks?|construction all risks?|erection all risks?|\bcar\b|contractors? renovation|contractor suite/],
  ['marine', /marine|cargo|transit|stock throughput|freight forwarder/],
  ['motor', /motor|fleet|commercial vehicle/],
  ['bonds', /\bbond\b|surety/],
  ['trade_credit', /trade credit/],
  ['business_package', /office ?care|shop ?care|clinic ?care|cafe ?care|biz ?sup|business supreme|bizflexi|business (insurance|package)|office (standard|package)|sme insurance|food stall|f&b all risks/],
  ['domestic_helper', /domestic helper|\bmaid\b/],
  ['travel', /travel/],
]

/** The product line slugs (src/lib/product-lines.ts) a policy may already carry. */
const SLUG: Record<string, LineCode> = {
  employee_benefits: 'eb', group_health: 'eb', foreign_worker_medical: 'fwm', wica: 'wica', group_personal_accident: 'gpa',
  group_travel: 'group_travel', general_liability: 'pl', environmental_liability: 'pl', professional_indemnity: 'pi', imi: 'pi',
  medical_malpractice: 'pi', do: 'do', cyber: 'cyber', iar_fire: 'property', business_interruption: 'property',
  machinery_breakdown: 'property', electronic_equipment: 'property', construction_car: 'car', commercial_vehicle: 'motor',
  marine_cargo: 'marine', stock_throughput: 'marine', inland_transit: 'marine', trade_credit: 'trade_credit',
  surety_bonds: 'bonds', foreign_worker_bond: 'bonds',
}

export function lineFor(spelling: string | null | undefined): LineCode {
  const text = clean(spelling ?? '')
  if (!text) return 'other'
  let best: { code: LineCode; at: number } | null = null
  for (const [code, rule] of RULES) {
    const m = rule.exec(text)
    if (m && (!best || m.index < best.at)) best = { code, at: m.index }
  }
  return best?.code ?? 'other'
}

export type LinePolicy = { class_of_insurance?: string | null; product_line?: string | null; is_eb?: boolean | null }

/** What a policy is filed as, in words: its class of insurance, else its product line. */
export const spellingOf = (p: LinePolicy): string => (p.class_of_insurance ?? '').replace(/\s+/g, ' ').trim() || (p.product_line ?? '').trim()

export const spellingKey = (s: string | null | undefined): string => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

export function lineOfPolicy(p: LinePolicy): LineCode {
  if (p.is_eb) return 'eb'
  const byText = lineFor(p.class_of_insurance)
  if (byText !== 'other') return byText
  return (p.product_line && SLUG[p.product_line]) || lineFor(p.product_line?.replace(/_/g, ' '))
}

/** The Employment Benefits line opens its renewal earlier (rules.ts). */
export const isEbLine = (p: LinePolicy & { line_code?: string | null }): boolean => !!p.is_eb || (p.line_code ?? lineOfPolicy(p)) === 'eb'
