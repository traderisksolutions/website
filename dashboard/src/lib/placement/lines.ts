/**
 * What each product line needs from the client, how the submission to insurers is written, how
 * many markets are asked and in what order, and how the comparison table is headed. Pure.
 *
 * Read on 2 Nov 2026 from Nathan's 490 placement threads. Construction goes out as one fixed block
 * (project title in capitals, contract chain as the insured, Section I sums built from the contract
 * value, Section II liability, RIBA, PEL on wages at 20% of contract value, the period as months
 * plus buffer plus defects liability) to 3 to 6 insurers within minutes, with one deadline set a
 * day before the client's. Bonds go with a six-item document list. Financial lines go with the
 * limit, the retroactive date and the revenue or assets. The same email goes to every insurer in
 * the round, so it names none of them.
 */
import { parseMoney } from './spec'
import type { Spec } from './types'

export type LineFamily = 'construction' | 'bond' | 'financial' | 'liability' | 'property' | 'workforce' | 'motor' | 'marine' | 'eb' | 'other'
export type LineField = { key: string; label: string; hint: string }

export type LineSpec = {
  family: LineFamily
  /** Structured fields the intake reads into spec.fields and the submission prints. */
  fields: LineField[]
  /** How many insurers one round asks, by the size of the risk. */
  markets: (ctx: { contractValue: number | null }) => number
  /** Nathan's order of approach, as name fragments; insurers not listed come after, in file order. */
  preferred: (ctx: { contractValue: number | null }) => string[]
  /** Working days the insurers are given to quote. */
  deadlineWorkingDays: number
  /** What the client is asked for before the market is approached. */
  documentsToAsk: string[]
  /** A fixed submission block, when the line has one; lines without it are written by the model. */
  submission?: (i: SubmissionInput) => string
}

export type SubmissionInput = { clientName: string; spec: Spec; inceptionDate: string | null; deadline: string | null; roundNo: number; changeSummary: string | null }

const f = (key: string, label: string, hint: string): LineField => ({ key, label, hint })
const S = (n: number) => `S$${n.toLocaleString('en-SG', { maximumFractionDigits: 0 })}`
const pct = (v: string | undefined, dflt: number) => { const n = Number(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : dflt }
const money = (v: string | undefined) => parseMoney(v)?.amount ?? null
const fmtDate = (iso: string | null | undefined) => { if (!iso) return null; const d = new Date(iso.slice(0, 10) + 'T00:00:00Z'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) }
const line = (label: string, v: string | null | undefined) => v ? `${label}: ${v}` : null

const CONSTRUCTION_FIELDS = [
  f('project', 'Project title', 'the project as the letter of award names it'),
  f('contractor', 'Main contractor', 'the client or the contractor the policy is for'),
  f('principal', 'Principal', 'the employer or developer named in the contract'),
  f('contract_value', 'Contract value', 'verbatim with currency'),
  f('period_months', 'Construction period (months)', 'months from commencement'),
  f('dlp_months', 'Defects liability period (months)', '12 or 24 as the contract says'),
  f('start_date', 'Commencement date', 'YYYY-MM-DD'),
  f('professional_fees_pct', 'Professional fees (% of contract value)', 'if stated; else 10'),
  f('removal_debris_pct', 'Removal of debris (% of contract value)', 'if stated; else 5'),
  f('principals_property', "Principal's existing property", 'sum insured, if any'),
  f('tpl_limit', 'Third party liability limit', 'if the contract specifies one'),
  f('scope', 'Scope of works', 'one or two lines'),
  f('ground_works', 'Piling, basements, excavation', 'pile type, basement levels, excavation depth, ERSS'),
  f('site', 'Site', 'address or location'),
]

function constructionSubmission(i: SubmissionInput): string {
  const x = i.spec.fields ?? {}
  const cv = money(x.contract_value)
  const pf = pct(x.professional_fees_pct, 10), rod = pct(x.removal_debris_pct, 5)
  const months = x.period_months ? `${x.period_months} months` : (i.spec.period ?? 'to be confirmed')
  const dlp = x.dlp_months ? `${x.dlp_months} months` : '12 months'
  const insured = [x.contractor ?? i.clientName, 'as Main Contractor and/or their sub-contractors of all tiers', x.principal ? `and/or ${x.principal} as Principal` : null].filter(Boolean).join(' ')
  const sect1 = cv ? [
    `- Contract works: ${S(cv)}`,
    `- Professional fees (${pf}% of contract value): ${S(Math.round(cv * pf / 100))}`,
    `- Removal of debris (${rod}% of contract value): ${S(Math.round(cv * rod / 100))}`,
    x.principals_property ? `- Principal's existing property: ${x.principals_property}` : null,
  ].filter(Boolean).join('\n') : (i.spec.limit ? `- Sum insured: ${i.spec.limit}` : '- Sum insured: to be confirmed')
  const out = [
    i.roundNo > 1 ? `Further to our earlier submission, the basis has changed as follows: ${i.changeSummary ?? 'see below'}. We would appreciate your revised terms; the rest stays as previously submitted.` : `We wish to bring you the following project from ${i.clientName} for quotation:`,
    '',
    line('Project', x.project ? x.project.toUpperCase() : null),
    line('Insured', insured),
    line('Site', x.site),
    line('Contract value', x.contract_value ?? (cv ? S(cv) : null)),
    line('Period of insurance', `${months}${x.start_date ? ` from ${fmtDate(x.start_date)}` : i.inceptionDate ? ` from ${fmtDate(i.inceptionDate)}` : ''} + 6 months buffer + ${dlp} defects liability`),
    line('Scope of works', x.scope ?? i.spec.scope),
    line('Piling, basements, excavation', x.ground_works),
    '',
    'Section I (material damage):',
    sect1,
    '',
    `Section II (third party liability): ${x.tpl_limit ?? 'S$10,000,000 any one accident, unlimited in the period'}`,
    'RIBA 19(2)(a): S$10,000,000 in the aggregate',
    cv ? `Public and employers' liability: wages estimated at 20% of contract value, ${S(Math.round(cv * 0.2))}` : null,
    i.spec.extras ? `Extensions requested: ${i.spec.extras}` : null,
    i.spec.notes ? `Notes: ${i.spec.notes}` : null,
    '',
    'The letter of award, insurance specification, plans and soil report are attached where available; do let us know what else you need.',
    i.deadline ? `We would appreciate your quotation by ${fmtDate(i.deadline)}.` : 'We would appreciate your quotation within 5 working days.',
  ]
  return out.filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

const BOND_FIELDS = [
  f('bond_type', 'Bond type', 'performance, advance payment, retention, bid, maintenance'),
  f('beneficiary', 'Beneficiary (principal)', 'who the bond is in favour of'),
  f('applicant', 'Applicant (contractor)', 'the client'),
  f('contract_title', 'Contract', 'as the letter of award names it'),
  f('contract_value', 'Contract value', 'verbatim with currency'),
  f('bond_pct', 'Bond percentage', '% of contract value the contract requires'),
  f('bond_amount', 'Bond amount', 'verbatim with currency'),
  f('start_date', 'Bond start', 'YYYY-MM-DD'),
  f('end_date', 'Contract completion', 'YYYY-MM-DD'),
  f('dlp_months', 'Defects liability period (months)', 'if the bond must run through it'),
  f('wording', 'Bond wording', "the beneficiary's own wording, or the insurer's standard"),
]

function bondSubmission(i: SubmissionInput): string {
  const x = i.spec.fields ?? {}
  const cv = money(x.contract_value)
  const amount = x.bond_amount ?? (cv && x.bond_pct ? S(Math.round(cv * pct(x.bond_pct, 0) / 100)) : null)
  return [
    i.roundNo > 1 ? `Further to our earlier submission, the basis has changed as follows: ${i.changeSummary ?? 'see below'}.` : `We wish to request your terms for the following bond for ${i.clientName}:`,
    '',
    line('Bond type', x.bond_type ?? 'Performance bond'),
    line('Beneficiary', x.beneficiary),
    line('Applicant', x.applicant ?? i.clientName),
    line('Contract', x.contract_title ? x.contract_title.toUpperCase() : null),
    line('Contract value', x.contract_value),
    line('Bond amount', amount ? `${amount}${x.bond_pct ? ` (${x.bond_pct}% of contract value)` : ''}` : null),
    line('Bond period', [x.start_date ? fmtDate(x.start_date) : null, x.end_date ? `to ${fmtDate(x.end_date)}` : null, x.dlp_months ? `+ ${x.dlp_months} months defects liability` : null, '+ 6 months buffer'].filter(Boolean).join(' ')),
    line('Wording', x.wording ?? 'per the attached, as required by the beneficiary'),
    i.spec.notes ? `Notes: ${i.spec.notes}` : null,
    '',
    'Attached: letter of award, bond wording, ACRA profile, the last two years of audited accounts, track record and the directors\' notices of assessment, as available.',
    i.deadline ? `We would appreciate your indication by ${fmtDate(i.deadline)}.` : 'We would appreciate your indication within 5 working days.',
  ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

const FINANCIAL_FIELDS = [
  f('business', 'Business', 'what the insured does, in one line'),
  f('limit', 'Limit of liability', 'any one claim and in the aggregate, verbatim'),
  f('retro_date', 'Retroactive date', 'as on the expiring policy, or "inception" for a first policy'),
  f('revenue', 'Revenue', 'last financial year, verbatim'),
  f('aum', 'Assets under management', 'for investment managers'),
  f('headcount', 'Staff', 'number of employees or professionals'),
  f('claims_history', 'Claims and circumstances', 'last 3 to 5 years, or "nil"'),
  f('incumbent', 'Expiring insurer and premium', 'for a renewal'),
  f('start_date', 'Inception', 'YYYY-MM-DD'),
]

function financialSubmission(i: SubmissionInput, label: string): string {
  const x = i.spec.fields ?? {}
  return [
    i.roundNo > 1 ? `Further to our earlier submission, the basis has changed as follows: ${i.changeSummary ?? 'see below'}.` : `We are assisting ${i.clientName} on their ${label} and wish to check whether this is a risk you would be keen to write. If so, the particulars are as follows:`,
    '',
    line('Insured', i.spec.insured ?? i.clientName),
    line('Business', x.business ?? i.spec.scope),
    line('Limit of liability', x.limit ?? i.spec.limit),
    line('Retroactive date', x.retro_date),
    line('Revenue', x.revenue),
    line('Assets under management', x.aum),
    line('Staff', x.headcount),
    line('Claims and circumstances', x.claims_history),
    line('Period of insurance', `12 months from ${fmtDate(x.start_date ?? i.inceptionDate) ?? 'a date to be confirmed'}`),
    i.spec.extras ? `Extensions requested: ${i.spec.extras}` : null,
    i.spec.notes ? `Notes: ${i.spec.notes}` : null,
    '',
    'The proposal form and the latest audited accounts are attached where available; do let us know what else you need.',
    i.deadline ? `We would appreciate your terms by ${fmtDate(i.deadline)}.` : 'We would appreciate your terms within 5 working days.',
  ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

const bySize = (small: number, mid: number, large: number) => ({ contractValue }: { contractValue: number | null }) => contractValue == null ? small : contractValue >= 50_000_000 ? large : contractValue >= 10_000_000 ? mid : small

const CONSTRUCTION_SMALL = ['EQ Insurance', 'India International', 'Zurich', 'Great American', 'Chubb', 'Tokio Marine', 'ECICS', 'Liberty', 'ERGO']
const CONSTRUCTION_LARGE = ['Great Eastern', 'China Taiping', 'Allianz', 'Tokio Marine', 'Liberty', 'ECICS', 'ERGO', 'Sompo', 'Lonpac']
const FINANCIAL = ['BHSI', 'Chubb', 'Berkley', 'Liberty', 'Delta', 'QBE', 'Allianz', 'Zurich', 'AIG']

export const LINE_SPECS: Record<string, LineSpec> = {
  construction_car: {
    family: 'construction', fields: CONSTRUCTION_FIELDS, markets: bySize(3, 4, 6), deadlineWorkingDays: 5,
    preferred: ({ contractValue }) => contractValue != null && contractValue >= 50_000_000 ? CONSTRUCTION_LARGE : CONSTRUCTION_SMALL,
    documentsToAsk: ['Letter of award or contract', 'Insurance specification or conditions of contract', 'Site and elevation plans', 'Soil investigation report', 'Scope of works and method statement', 'Piling plan and excavation depth'],
    submission: constructionSubmission,
  },
  surety_bonds: {
    family: 'bond', fields: BOND_FIELDS, markets: () => 3, deadlineWorkingDays: 5,
    preferred: () => ['EQ Insurance', 'ECICS', 'ERGO', 'Tokio Marine', 'Allianz Trade', 'Great Eastern', 'Sompo', 'China Taiping'],
    documentsToAsk: ['Letter of award', 'Bond wording and the percentage required', 'ACRA business profile', 'Audited accounts, last two years', 'Track record of completed projects', "Directors' notices of assessment"],
    submission: bondSubmission,
  },
  professional_indemnity: { family: 'financial', fields: FINANCIAL_FIELDS, markets: () => 3, deadlineWorkingDays: 5, preferred: () => FINANCIAL, documentsToAsk: ['Completed proposal form', 'Audited accounts, latest', 'Expiring policy schedule', 'Claims history, 5 years'], submission: i => financialSubmission(i, 'professional indemnity insurance') },
  do: { family: 'financial', fields: FINANCIAL_FIELDS, markets: () => 3, deadlineWorkingDays: 5, preferred: () => FINANCIAL, documentsToAsk: ['Completed proposal form', 'Audited accounts, latest', 'Expiring policy schedule', 'Claims history, 5 years'], submission: i => financialSubmission(i, "directors' and officers' liability insurance") },
  imi: { family: 'financial', fields: FINANCIAL_FIELDS, markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['BHSI', 'Chubb', 'Berkley'], documentsToAsk: ['Completed proposal form', 'Private placement memorandum', 'Audited accounts and interims', 'Expiring policy schedule'], submission: i => financialSubmission(i, 'investment management insurance') },
  cyber: { family: 'financial', fields: FINANCIAL_FIELDS, markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['Chubb', 'Delta', 'Allianz', 'MSIG', 'APRIL'], documentsToAsk: ['Completed cyber proposal form', 'Revenue and headcount', 'Expiring policy schedule'], submission: i => financialSubmission(i, 'cyber insurance') },
  medical_malpractice: { family: 'financial', fields: FINANCIAL_FIELDS, markets: () => 2, deadlineWorkingDays: 5, preferred: () => ['Chubb'], documentsToAsk: ['Completed proposal form', 'Practitioner list', 'Claims history, 5 years'], submission: i => financialSubmission(i, 'medical malpractice insurance') },
  general_liability: { family: 'liability', fields: [], markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['EQ Insurance', 'Chubb', 'Great American', 'Tokio Marine', 'Zurich', 'Berkley', 'Great Eastern', 'Allianz', 'Liberty'], documentsToAsk: ['Contract clause or tender requirement naming the limit', 'Turnover, last financial year', 'Claims history, 3 years'] },
  iar_fire: { family: 'property', fields: [], markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['Allianz', 'Great Eastern', 'China Taiping', 'ECICS', 'EQ Insurance', 'HLAS', 'Liberty', 'Sompo', 'ERGO'], documentsToAsk: ['Sums insured by location', 'Construction, occupancy and fire protection', 'Claims history, 3 years'] },
  wica: { family: 'workforce', fields: [], markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['Liberty', 'Allianz', 'EQ Insurance', 'Zurich', 'Chubb', 'Income', 'Great Eastern', 'MSIG'], documentsToAsk: ['Headcount by occupation', 'Estimated annual wages', 'Claims history, 3 years'] },
  commercial_vehicle: { family: 'motor', fields: [], markets: () => 3, deadlineWorkingDays: 3, preferred: () => ['ECICS', 'Liberty', 'Income', 'ERGO', 'China Taiping', 'Etiqa'], documentsToAsk: ['Vehicle list with registration, make, model and year', 'No-claim discount per vehicle', 'Driver details'] },
  marine_cargo: { family: 'marine', fields: [], markets: () => 4, deadlineWorkingDays: 5, preferred: () => ['Great American', 'QBE', 'Markel', 'Chubb', 'Sompo', 'AIG'], documentsToAsk: ['Commodities and packing', 'Annual turnover and maximum per conveyance', 'Routes and conveyances'] },
  group_health: { family: 'eb', fields: [], markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['QBE', 'Income', 'Singlife', 'AIA', 'Cigna', 'Raffles Health'], documentsToAsk: ['Member list with date of birth and plan', 'Expiring schedule of benefits', 'Claims experience, 3 years'] },
  employee_benefits: { family: 'eb', fields: [], markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['QBE', 'Income', 'Singlife', 'AIA', 'Cigna', 'Raffles Health'], documentsToAsk: ['Member list with date of birth and plan', 'Expiring schedule of benefits', 'Claims experience, 3 years'] },
}

export const familyOf = (productLine: string | null | undefined): LineFamily => LINE_SPECS[productLine ?? '']?.family ?? 'other'

/** The contract value or sum insured the line is for, read from the fields or the limit. */
export function contractValueOf(spec: Spec): number | null {
  return money(spec.fields?.contract_value) ?? money(spec.limit)
}

/** How many insurers the first round asks for this line and size. */
export function marketsFor(productLine: string, spec: Spec): number | null {
  const s = LINE_SPECS[productLine]
  return s ? s.markets({ contractValue: contractValueOf(spec) }) : null
}

/**
 * Pure. Insurers in Nathan's order of approach for the line, then the rest in file order, cut to
 * the number the line asks. Names match on a fragment ("EQ Insurance" matches "EQ Insurance Company Limited").
 */
export function pickPanel(productLine: string, spec: Spec, insurers: string[]): string[] {
  const s = LINE_SPECS[productLine]
  const distinct = Array.from(new Set(insurers))
  if (!s) return distinct
  const pref = s.preferred({ contractValue: contractValueOf(spec) }).map(p => p.toLowerCase())
  const rank = (name: string) => { const n = name.toLowerCase(); const i = pref.findIndex(p => n.includes(p)); return i < 0 ? pref.length : i }
  const ordered = distinct.map((name, i) => ({ name, r: rank(name), i })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.name)
  return ordered.slice(0, s.markets({ contractValue: contractValueOf(spec) }))
}

/** The date insurers are asked to quote by: the line's working days out, or two working days before inception when that is sooner. */
export function insurerDeadline(productLine: string, from: string, inception: string | null): string {
  const days = LINE_SPECS[productLine]?.deadlineWorkingDays ?? 5
  const add = (iso: string, n: number) => { let t = Date.parse(iso.slice(0, 10)); let left = n; while (left > 0) { t += 86_400_000; const d = new Date(t).getUTCDay(); if (d !== 0 && d !== 6) left-- } return new Date(t).toISOString().slice(0, 10) }
  const sub = (iso: string, n: number) => { let t = Date.parse(iso.slice(0, 10)); let left = n; while (left > 0) { t -= 86_400_000; const d = new Date(t).getUTCDay(); if (d !== 0 && d !== 6) left-- } return new Date(t).toISOString().slice(0, 10) }
  const byDays = add(from, days)
  if (!inception) return byDays
  const byInception = sub(inception, 2)
  return byInception > from && byInception < byDays ? byInception : byDays
}

/** The intake hints for the model, per line that has structured fields. */
export function fieldHints(productLine: string): string {
  const s = LINE_SPECS[productLine]
  if (!s?.fields.length) return ''
  return s.fields.map(x => `${x.key} (${x.label}: ${x.hint})`).join('; ')
}

/** The label a field key prints under. */
export function fieldLabel(productLine: string | null | undefined, key: string): string {
  return LINE_SPECS[productLine ?? '']?.fields.find(x => x.key === key)?.label ?? key.replace(/_/g, ' ')
}

/** The comparison table's head for the line's family. Employee benefits keeps per-head and benefits. */
export function comparisonHead(family: LineFamily): string[] {
  if (family === 'eb' || family === 'other') return ['Insurer · plan', 'Option', 'Premium (S$)', 'Per head (S$)', 'Limit', 'Excess', 'Valid until', 'Key benefits']
  if (family === 'financial') return ['Insurer', 'Option', 'Premium (S$)', 'Limit', 'Deductible', 'Key terms', 'Subjectivities', 'Valid until']
  return ['Insurer', 'Lead / share', 'Rate', 'Premium (S$)', 'Sum insured / limit', 'Deductible', 'Subjectivities', 'Valid until']
}
