/**
 * Group Benefits — resolve an insurer's own wording to the canonical codes.
 *
 * Deterministic first, and in practice that is nearly all of it: insurers print their product
 * names with the abbreviation attached ("Group Outpatient Specialist Care (GOSC)"), so a pattern
 * per canonical product resolves the real labels without a model call. A model is worth paying
 * for only on wording no pattern recognises, and even then its answer is a suggestion that a
 * human approves into gb_label_alias — after which it is deterministic forever.
 *
 * The part that defeated the earlier attempt is that a label often names SEVERAL products. AIA
 * prices "GHS+EMM" and "GTL + GACI" as single premiums covering two canonical covers each, and
 * "GP COPAY S$0 + SP" is primary and specialist care together at a stated co-payment. So this
 * returns an array, and the qualifiers that are not part of the product identity — the co-pay
 * level, a foreign-worker scope — come back separately as a variant.
 *
 * Pure and synchronous. No I/O, no model, no database.
 */
import { PRODUCTS, BENEFITS, type CanonBenefit } from './canon'

/** Lower-case, and collapse every run of punctuation to one space so word boundaries survive.
 *  "GTL + GACI" becomes "gtl gaci", not "gtlgaci" — which would destroy every \b in the
 *  patterns below and was the trap in the original normaliser. */
export const norm = (s: unknown): string =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export type Variant = {
  co_payment?: string
  member_scope?: 'foreign_worker'
  accelerated?: boolean
}

export type ProductMatch = {
  codes: string[]
  variant: Variant
  /** 'rule' when every code came from a pattern here; 'partial' when the label had leftover
   *  words no pattern claimed, which is the signal to ask a human or a model about it. */
  via: 'rule' | 'partial' | 'none'
  unclaimed: string
}

type ProductRule = {
  code: string
  patterns: RegExp[]
  /** Codes this rule outranks when both match. GHS-FW is a specialisation of GHS, so a
   *  foreign-worker label must not also report plain GHS. */
  supersedes?: string[]
}

/** Matched against the NORMALISED label, so patterns are lower-case and space-separated. */
const PRODUCT_RULES: ProductRule[] = [
  { code: 'GHS_FW', supersedes: ['GHS'],
    patterns: [/\bghs\s*fw\b/, /\bfw\b/, /foreign\s*worker/, /work\s*permit/, /\bmom\b.*medical/] },
  { code: 'EMM',
    patterns: [/\bemm\b/, /extended\s*major\s*medical/, /major\s*medical/] },
  { code: 'GHS',
    patterns: [/\bghs\b/, /hospital\s*(and|&)?\s*surgical/, /hospital\s*surgical/, /\bgms\b/] },
  { code: 'GCI',
    patterns: [/\bgaci\b/, /\bgci\b/, /critical\s*illness/] },
  { code: 'GTL',
    patterns: [/\bgtl\b/, /\bgtli\b/, /group\s*term\s*life/, /\bterm\s*life\b/] },
  { code: 'GADD',
    patterns: [/\bgadd\b/, /accidental\s*death\s*(and|&)?\s*dismember/, /\badd\b/] },
  { code: 'GPA',
    patterns: [/\bgpa\b/, /personal\s*accident/] },
  { code: 'GOSC',
    patterns: [/\bgosc\b/, /\bgos\b/, /\bsp\b/, /specialist\s*care/, /outpatient\s*specialist/] },
  { code: 'GOPC',
    patterns: [/\bgopc\b/, /\bgp\b/, /primary\s*care/, /outpatient\s*(general|primary)/, /general\s*practitioner/] },
  { code: 'GD',
    patterns: [/\bgd\b/, /\bdental\b/] },
]

/** Words that carry no product identity, so their presence must not make a label look partial. */
const FILLER = new Set([
  'group', 'plan', 'plans', 'and', 'the', 'for', 'insurance', 'cover', 'coverage', 'benefit',
  'benefits', 'copay', 'co', 'payment', 'accelerated', 'rider', 's', 'employee', 'employees',
  'dependant', 'dependent', 'dependants', 'scheme', 'basic', 'standard', 'enhanced', 'option',
])

function variantFrom(raw: string, normalised: string): Variant {
  const v: Variant = {}
  // "GP COPAY S$0 + SP" / "GP COPAY S$5 + SP" — the co-pay is a tier qualifier, not a product.
  const copay = raw.match(/co-?pay(?:ment)?\s*(?:of\s*)?(s?\$?\s?\d+(?:\.\d+)?%?)/i)
  if (copay) v.co_payment = copay[1].replace(/\s+/g, '').toUpperCase()
  else {
    const pct = raw.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*co-?(?:pay|insurance)/i)
    if (pct) v.co_payment = `${pct[1]}%`
  }
  if (/\bfw\b|foreign\s*worker|work\s*permit/.test(normalised)) v.member_scope = 'foreign_worker'
  if (/\baccelerated\b/.test(normalised)) v.accelerated = true
  return v
}

/**
 * Every canonical product a label names. An empty result is not a failure to be papered over —
 * it means nobody has taught the system this wording yet, and the row stays visible and
 * unmapped rather than being guessed into the wrong column.
 */
/** List separators insurers use between products in one label. Deliberately excludes "+", "&"
 *  and dashes, which join words INSIDE a product name ("GHS+EMM", "Hospital & Surgical",
 *  "Group Hospital & Surgical — Foreign Worker"). */
const ITEM_SPLIT = /[·•|;\n]+|\s{3,}/

/** One list item. Superseding applies here, where a specialisation and its general product
 *  really are describing the same cover. */
function resolveOne(rawItem: string): { codes: string[]; claimed: Set<string> } {
  const n = norm(rawItem)
  if (!n) return { codes: [], claimed: new Set() }

  const hits: { code: string; matched: string[] }[] = []
  for (const rule of PRODUCT_RULES) {
    const matched = rule.patterns.map(p => n.match(p)?.[0]).filter((m): m is string => !!m)
    if (matched.length) hits.push({ code: rule.code, matched })
  }
  const superseded = new Set(
    hits.flatMap(h => PRODUCT_RULES.find(r => r.code === h.code)?.supersedes ?? []))
  const kept = hits.filter(h => !superseded.has(h.code))
  return {
    codes: kept.map(h => h.code),
    claimed: new Set(kept.flatMap(h => h.matched).flatMap(m => m.split(' '))),
  }
}

/**
 * Every canonical product a label names. An empty result is not a failure to be papered over —
 * it means nobody has taught the system this wording yet, and the row stays visible and
 * unmapped rather than being guessed into the wrong column.
 *
 * The label is split into list items first, because one rate table can cover a whole brochure:
 * AIA's is labelled "GTL · GHS+EMM · GHS-FW · GTL + GACI · GP · ... · DENTAL", nine products in
 * one string. Superseding then applies within an item rather than across the label — otherwise
 * the GHS-FW item strips GHS out of the GHS+EMM item, which is how the annual scan came to run
 * against AIA's brochure with no hospital & surgical lines in its prompt.
 */
export function resolveProduct(rawLabel: string): ProductMatch {
  const n = norm(rawLabel)
  if (!n) return { codes: [], variant: {}, via: 'none', unclaimed: '' }

  const items = rawLabel.split(ITEM_SPLIT).map(i => i.trim()).filter(Boolean)
  const codes = new Set<string>()
  const claimed = new Set<string>()
  for (const item of items.length ? items : [rawLabel]) {
    const r = resolveOne(item)
    for (const c of r.codes) codes.add(c)
    for (const w of Array.from(r.claimed)) claimed.add(w)
  }

  const variant = variantFrom(rawLabel, n)
  if (!codes.size) return { codes: [], variant, via: 'none', unclaimed: n }

  // Whatever words no pattern and no filler list claimed. A non-empty remainder means the label
  // says something more than the codes capture, which is worth a human's attention.
  const unclaimed = n.split(' ')
    .filter(w => w && !claimed.has(w) && !FILLER.has(w) && !/^\d+$/.test(w))
    .join(' ')

  const order = new Map(PRODUCTS.map((p, i) => [p.code, i]))
  const sorted = Array.from(codes).sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
  return { codes: sorted, variant, via: unclaimed ? 'partial' : 'rule', unclaimed }
}

// ── Benefit lines ───────────────────────────────────────────────────────────────

/** Patterns per canonical benefit, matched against the normalised category + name together. */
const BENEFIT_RULES: { code: string; patterns: RegExp[] }[] = [
  // GHS
  { code: 'GHS_HOSPITAL_TYPE', patterns: [/hospital\s*type/, /choice\s*of\s*hospital/, /\b(private|restructured|government)\s*hospital\b/] },
  { code: 'GHS_ROOM_BOARD',    patterns: [/room\s*(and|&)?\s*board/, /\bward\s*(class|entitle)/, /\bbed\s*(class|entitle)/, /\bconfinement\b/, /\bhospitalisation\s*benefit\b/] },
  { code: 'GHS_ANNUAL_LIMIT',  patterns: [/overall\s*annual\s*limit/, /annual\s*(policy\s*)?limit/, /\bapl\b/, /policy\s*year\s*limit/, /maximum\s*(annual\s*)?(limit|benefit)/] },
  { code: 'GHS_CO_PAYMENT',    patterns: [/co-?payment/, /co-?insurance/, /\bdeductible\b.*ghs/] },
  { code: 'GHS_ICU',           patterns: [/intensive\s*care/, /\bicu\b/, /high\s*dependency/] },
  { code: 'GHS_HOSP_MISC',     patterns: [/(hospital|other)\s*misc/, /miscellaneous\s*(hospital\s*)?(services|charges|expenses)/] },
  { code: 'GHS_SURGICAL',      patterns: [/surgical\s*(benefit|fee|expense)/, /\bsurgeon\s*fee/, /operating\s*theatre/] },
  { code: 'GHS_INHOSP_DOCTOR', patterns: [/in\s*hospital\s*(doctor|physician|medical)/, /daily\s*(doctor|physician)/, /attending\s*(doctor|physician)/] },
  { code: 'GHS_PRE_HOSP',      patterns: [/pre\s*hospital/, /pre\s*(admission|confinement)/, /specialist\s*consultation.*pre/] },
  { code: 'GHS_POST_HOSP',     patterns: [/post\s*hospital/, /post\s*(discharge|confinement)/] },
  { code: 'GHS_DAY_SURGERY',   patterns: [/day\s*surgery/, /day\s*(care|patient)\s*surgical/] },
  { code: 'GHS_EMERG_ACC_OP',  patterns: [/emergency\s*accidental\s*out\s*patient/, /emergency\s*(accident|outpatient)/, /accidental\s*out\s*patient/] },
  { code: 'GHS_EMERG_DENTAL',  patterns: [/(emergency|accidental).*dental/, /out\s*patient\s*dental/] },
  { code: 'GHS_OP_KIDNEY',     patterns: [/kidney\s*dialysis/, /\brenal\s*dialysis/] },
  { code: 'GHS_OP_CANCER',     patterns: [/(out\s*patient\s*)?cancer\s*treatment/, /chemotherapy/, /radiotherapy/] },
  { code: 'GHS_IMPLANTS',      patterns: [/surgical\s*implant/, /\bimplant\b/, /prosthes/] },
  { code: 'GHS_PSYCH',         patterns: [/psychiatric/, /mental\s*health/] },
  { code: 'GHS_HOME_NURSING',  patterns: [/home\s*nursing/, /\bhome\s*care\b/] },
  { code: 'GHS_REHAB',         patterns: [/rehabilitation/, /\brehab\b/, /physiotherapy/] },
  { code: 'GHS_MISCARRIAGE',   patterns: [/miscarriage/] },
  { code: 'GHS_MATERNITY',     patterns: [/maternity/, /\bchildbirth\b/, /\bdelivery\b.*benefit/] },
  { code: 'GHS_DEATH',         patterns: [/death\s*benefit/] },
  { code: 'GHS_AMBULANCE',     patterns: [/ambulance/] },
  { code: 'GHS_SHORT_STAY',    patterns: [/short\s*stay\s*ward/] },
  { code: 'GHS_PARENT_ACCOM',  patterns: [/parent\s*accommodat/, /companion\s*bed/] },
  { code: 'GHS_MEDICAL_REPORT',patterns: [/medical\s*report/] },
  // "Confinement Benefit" is a daily cash payment, not room & board, so it must win over the
  // bare /confinement/ pattern there. Longest-match does that: "confinement benefit" is longer.
  { code: 'GHS_CONFINEMENT_CASH', patterns: [/confinement\s*benefit/, /daily\s*(hospital\s*)?cash/, /hospital\s*income\s*benefit/] },
  { code: 'GHS_CASH_DOWNGRADE',patterns: [/cash\s*downgrade/, /downgrade\s*benefit/, /ward\s*downgrade/] },
  { code: 'GHS_DREAD_DISEASE', patterns: [/dread\s*disease/, /recuperation/] },
  { code: 'GHS_EMERG_ASSIST',  patterns: [/emergency\s*assistance/, /medical\s*evacuation/, /repatriation/] },
  { code: 'GHS_PER_DISABILITY',patterns: [/(maximum\s*)?limit\s*per\s*disability/, /per\s*disability\s*limit/] },
  { code: 'GHS_OVERSEAS',      patterns: [/overseas\s*(hospitalisation|hospitalization|treatment)/] },
  { code: 'GHS_REPATRIATION',  patterns: [/repatriation/, /mortal\s*remains/] },
  { code: 'GHS_GEO_SCOPE',     patterns: [/geographic/, /\bterritorial\b/, /\bworldwide\b.*(cover|scope)/, /overseas\s*(treatment|cover)/] },
  { code: 'GHS_PRE_EXISTING',  patterns: [/pre\s*existing/, /\bpre\s*ex\b/] },
  { code: 'GHS_PANEL',         patterns: [/panel\s*(requirement|clinic|hospital|doctor)/, /\bnon\s*panel\b/] },
  // EMM
  { code: 'EMM_ANNUAL_LIMIT',  patterns: [/(emm|extended\s*major\s*medical).*(annual\s*)?limit/, /extended\s*major\s*medical\b/] },
  { code: 'EMM_CO_INSURANCE',  patterns: [/(emm|extended\s*major).*co-?insurance/] },
  { code: 'EMM_DEDUCTIBLE',    patterns: [/(emm|extended\s*major).*deductible/] },
  { code: 'EMM_PER_DISABILITY',patterns: [/(emm|extended\s*major\s*medical).*(limit\s*per\s*disability|per\s*disability)/] },
  // GTL
  { code: 'GTL_SUM_ASSURED',   patterns: [/sum\s*assured/, /amount\s*insured/, /\bcapital\s*sum\b/] },
  { code: 'GTL_DEATH',         patterns: [/^death$/, /\bdeath\b(?!.*accident)/] },
  { code: 'GTL_TPD',           patterns: [/total\s*(and|&)?\s*permanent\s*disab/, /\btpd\b/] },
  { code: 'GTL_TERMINAL',      patterns: [/terminal\s*illness/] },
  { code: 'GTL_COMPASSIONATE', patterns: [/compassionate/, /funeral\s*(expense|benefit)/, /bereavement/] },
  { code: 'GTL_FREE_COVER',    patterns: [/free\s*cover/, /\bfcl\b/, /no\s*evidence\s*limit/] },
  // GCI
  { code: 'GCI_SUM_ASSURED',   patterns: [/critical\s*illness.*(sum|amount)/, /\bci\s*sum\b/, /critical\s*illness\s*benefit/] },
  { code: 'GCI_CONDITIONS',    patterns: [/\d+\s*critical\s*illness/, /conditions\s*covered/, /number\s*of\s*(critical\s*)?illness/] },
  { code: 'GCI_ACCELERATED',   patterns: [/accelerated/, /additional\s*critical/] },
  { code: 'GCI_ANGIOPLASTY',   patterns: [/angioplasty/] },
  { code: 'GCI_SURVIVAL',      patterns: [/survival\s*period/] },
  // GPA / GADD
  { code: 'GPA_AD',            patterns: [/accidental\s*death(?!.*dismember)/] },
  { code: 'GPA_PTD',           patterns: [/permanent\s*total\s*disab/, /\bptd\b/] },
  { code: 'GPA_PPD',           patterns: [/permanent\s*partial\s*disab/, /\bppd\b/] },
  { code: 'GPA_MEDICAL_EXP',   patterns: [/accidental\s*medical\s*(expense|reimburse)/, /medical\s*expenses?\s*(due\s*to\s*)?accident/] },
  { code: 'GPA_WEEKLY_INCOME', patterns: [/temporary\s*(total\s*)?disab/, /weekly\s*(income|indemnity|benefit)/] },
  { code: 'GPA_COMMON_CARRIER',patterns: [/common\s*carrier/] },
  { code: 'GPA_SCOPE',         patterns: [/24\s*hour/, /occupational\s*only/, /cover\s*scope/] },
  { code: 'GADD_AD',           patterns: [/accidental\s*death\s*(and|&)?\s*dismember/] },
  { code: 'GADD_DISMEMBER',    patterns: [/dismember/, /\bscale\s*of\s*(benefit|compensation)/] },
  { code: 'GADD_MAJOR_BURNS',  patterns: [/\bburns?\b/] },
  { code: 'GADD_EDUCATION',    patterns: [/education\s*(fund|benefit|grant)/] },
  { code: 'GADD_COMA',         patterns: [/comatose/, /\bcoma\b/] },
  { code: 'GADD_MOBILITY_AID', patterns: [/mobility\s*aid/, /prosthetic\s*(limb|appliance)/] },
  // Outpatient + dental
  { code: 'GOPC_PANEL_VISIT',  patterns: [/panel\s*(gp|clinic|general)/, /\bgp\s*visit/, /general\s*practitioner/] },
  { code: 'GOPC_NONPANEL',     patterns: [/non\s*panel/] },
  { code: 'GOPC_CO_PAYMENT',   patterns: [/co-?pay.*(visit|consult)/] },
  { code: 'GOPC_VISIT_LIMIT',  patterns: [/(visits?|consultations?)\s*per\s*(year|annum|policy)/, /maximum\s*(number\s*of\s*)?visits/] },
  { code: 'GOPC_POLYCLINIC',   patterns: [/polyclinic/] },
  { code: 'GOPC_TELEMEDICINE', patterns: [/telemedicine/, /teleconsult/] },
  { code: 'GOPC_TCM',          patterns: [/traditional\s*chinese/, /\btcm\b/, /chinese\s*physician/, /acupunctur/] },
  { code: 'GOPC_XRAY_LAB',     patterns: [/x\s*ray\s*(and|&)?\s*lab/, /laboratory\s*test/] },
  { code: 'GOPC_AE_VISIT',     patterns: [/accident(al)?\s*(and|&)?\s*emergency\s*department/, /\ba\s*e\s*department\b/] },
  { code: 'GOPC_ANNUAL_LIMIT', patterns: [/(gp|primary\s*care).*annual\s*limit/] },
  { code: 'GOSC_SPEC_VISIT',   patterns: [/specialist\s*consultation/, /specialist\s*visit/] },
  { code: 'GOSC_DIAGNOSTIC',   patterns: [/diagnostic/, /\blaboratory\b/, /\bx\s*ray\b/] },
  { code: 'GOSC_REFERRAL',     patterns: [/referral/] },
  { code: 'GOSC_NONPANEL',     patterns: [/non\s*panel\s*specialist/] },
  { code: 'GOSC_PHYSIO',       patterns: [/chiropract/, /occupational\s*therapy/, /\bphysiotherapy\b/] },
  { code: 'GOSC_PSYCH',        patterns: [/out\s*patient\s*psychiatric/] },
  { code: 'GOSC_ANNUAL_LIMIT', patterns: [/(specialist|gosc).*annual\s*limit/] },
  { code: 'GD_ANNUAL_LIMIT',   patterns: [/dental.*(annual\s*)?limit/] },
  { code: 'GD_PANEL',          patterns: [/dental.*panel/] },
  { code: 'GD_CO_PAYMENT',     patterns: [/dental.*co-?pay/] },
  { code: 'GD_SCALING',        patterns: [/scaling/, /\bpolishing\b/] },
]

const BENEFIT_INDEX = new Map(BENEFITS.map(b => [b.code, b]))

export type BenefitMatch = { code: string | null; benefit: CanonBenefit | null; via: 'rule' | 'none' }

/**
 * The canonical line a printed benefit row describes.
 *
 * `productCodes` narrows the search to the lines that product actually has, which is what makes
 * the loose patterns safe: "annual limit" means a different canonical line under GHS, dental and
 * specialist care, and without the narrowing the first pattern to match would win arbitrarily.
 * Longest-match wins within the candidates, so "Outpatient Dental Treatment" resolves to the
 * dental-specific line rather than to whichever generic pattern fires first.
 */
export function resolveBenefit(
  category: string | null | undefined,
  benefitName: string | null | undefined,
  productCodes: string[],
): BenefitMatch {
  const n = norm(`${benefitName ?? ''} ${category ?? ''}`)
  if (!n) return { code: null, benefit: null, via: 'none' }

  const allowed = productCodes.length
    ? new Set(BENEFITS.filter(b => productCodes.includes(b.productCode)).map(b => b.code))
    : null

  let best: { code: string; len: number } | null = null
  for (const rule of BENEFIT_RULES) {
    if (allowed && !allowed.has(rule.code)) continue
    for (const p of rule.patterns) {
      const m = n.match(p)
      if (m && (!best || m[0].length > best.len)) best = { code: rule.code, len: m[0].length }
    }
  }
  if (!best) return { code: null, benefit: null, via: 'none' }
  return { code: best.code, benefit: BENEFIT_INDEX.get(best.code) ?? null, via: 'rule' }
}
