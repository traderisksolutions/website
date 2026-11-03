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
  preferred: (ctx: { contractValue: number | null; spec?: Spec }) => string[]
  /** Working days the insurers are given to quote. */
  deadlineWorkingDays: number
  /** What the client is asked for before the market is approached. */
  documentsToAsk: string[]
  /** Field keys the insurers cannot price without. Missing any → the client is asked first, nobody is approached. */
  required?: string[]
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

// ── Workforce: WICA, FWMI, foreign worker bond (Catherine's and Nathan's submissions, Jun–Oct 2026) ──
const WICA_FIELDS = [
  f('business', 'Nature of business', 'what the insured does, in one line'),
  f('uen', 'UEN', 'the company registration number'),
  f('address', 'Address', 'registered or operating address'),
  f('categories', 'Employees by category', 'each category of work with headcount and estimated annual wages, e.g. "Office: 16, S$1,321,520; Site: 18, S$539,322"'),
  f('total_wages', 'Total annual wages', 'verbatim with currency'),
  f('start_date', 'Inception or renewal date', 'YYYY-MM-DD'),
  f('claims_history', 'Claims history, last 3 years', 'or "nil"'),
  f('incumbent', 'Expiring insurer and premium', 'for a renewal'),
]

function wicaSubmission(i: SubmissionInput): string {
  const x = i.spec.fields ?? {}
  return [
    i.roundNo > 1 ? `Further to our earlier submission, the basis has changed as follows: ${i.changeSummary ?? 'see below'}.` : 'We would like to present the following client for your quotation:',
    '',
    line('Name', i.spec.insured ?? i.clientName),
    line('Address', x.address),
    line('UEN No', x.uen),
    line('Nature of business', x.business ?? i.spec.scope),
    'Cover of insurance: Work Injury Compensation (WICA)',
    line(x.incumbent ? 'Date of renewal' : 'Inception', fmtDate(x.start_date ?? i.inceptionDate)),
    line('Employees by category of work and annual wages', x.categories),
    line('Total annual wages', x.total_wages),
    line('Claims history, last three years', x.claims_history),
    line('Expiring insurer', x.incumbent),
    i.spec.notes ? `Notes: ${i.spec.notes}` : null,
    '',
    "The employees' scope of work and wages are attached for your underwriting.",
    i.deadline ? `We would appreciate your quotation by ${fmtDate(i.deadline)}.` : 'We would appreciate your quotation within 5 working days.',
  ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

const FWMI_FIELDS = [
  f('business', 'Nature of business', 'what the insured does'),
  f('worker_count', 'Number of workers', 'work permit or S Pass holders to cover'),
  f('worker_list', 'Worker list', '"attached" when a list with work permit numbers, nationality and dates of birth is attached'),
  f('plan', 'Plan', 'MOM minimum (S$60,000 annual limit) or an enhanced plan'),
  f('start_date', 'Inception', 'YYYY-MM-DD'),
  f('with_bond', 'Foreign worker bond needed', 'yes or no; Malaysians are exempt'),
  f('claims_history', 'Claims history', 'or "nil"'),
]

function fwmiSubmission(i: SubmissionInput): string {
  const x = i.spec.fields ?? {}
  return [
    i.roundNo > 1 ? `Further to our earlier submission, the basis has changed as follows: ${i.changeSummary ?? 'see below'}.` : `We would like to request your quotation for foreign worker medical insurance for ${i.clientName}:`,
    '',
    line('Insured', i.spec.insured ?? i.clientName),
    line('Nature of business', x.business),
    line('Number of workers', x.worker_count),
    line('Plan', x.plan ?? 'MOM minimum requirement'),
    line('Inception', fmtDate(x.start_date ?? i.inceptionDate)),
    x.with_bond && /^y/i.test(x.with_bond) ? 'Foreign worker bond: required for the same workers, please quote together' : null,
    line('Claims history', x.claims_history),
    '',
    'The worker list with work permit numbers is attached.',
    i.deadline ? `We would appreciate your quotation by ${fmtDate(i.deadline)}.` : 'We would appreciate your quotation within 3 working days.',
  ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

// ── Group personal accident (the bike-share and corporate GPA renewals, Jun–Oct 2026) ──
const GPA_FIELDS = [
  f('business', 'Nature of business', 'what the insured does'),
  f('insured_persons', 'Insured persons or units', 'headcount, or units such as bikes or riders'),
  f('basis', 'Basis', 'named or unnamed; per person or per unit'),
  f('benefits', 'Benefits', 'death and permanent disablement sum insured, medical reimbursement and any extras'),
  f('activities', 'Activities and occupations', 'what the insured persons do'),
  f('start_date', 'Inception', 'YYYY-MM-DD'),
  f('claims_history', 'Claims history, last 3 years', 'or "nil"'),
  f('incumbent', 'Expiring insurer and premium', 'for a renewal'),
]

function gpaSubmission(i: SubmissionInput): string {
  const x = i.spec.fields ?? {}
  return [
    i.roundNo > 1 ? `Further to our earlier submission, the basis has changed as follows: ${i.changeSummary ?? 'see below'}.` : `We would like to request your terms for group personal accident insurance for ${i.clientName}:`,
    '',
    line('Insured', i.spec.insured ?? i.clientName),
    line('Nature of business', x.business),
    line('Insured persons or units', x.insured_persons),
    line('Basis', x.basis),
    line('Benefits', x.benefits ?? i.spec.limit),
    line('Activities and occupations', x.activities),
    line('Period of insurance', `12 months from ${fmtDate(x.start_date ?? i.inceptionDate) ?? 'a date to be confirmed'}`),
    line('Claims history, last three years', x.claims_history),
    line('Expiring insurer', x.incumbent),
    i.spec.extras ? `Extensions requested: ${i.spec.extras}` : null,
    i.spec.notes ? `Notes: ${i.spec.notes}` : null,
    '',
    i.deadline ? `We would appreciate your terms by ${fmtDate(i.deadline)}.` : 'We would appreciate your terms within 5 working days.',
  ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

// ── Employee benefits (Tier C insurers by email; Tier A and B are priced by the rate engine) ──
const EB_FIELDS = [
  f('member_count', 'Members', 'employees to cover, and dependants if any'),
  f('census', 'Member census', '"attached" when a list with date of birth, gender, plan and dependants is attached'),
  f('benefits', 'Benefits wanted', 'GHS, GP, specialist, dental, GTL, GPA, and the plan levels'),
  f('expiring_schedule', 'Expiring schedule of benefits', '"attached" when attached, or "new scheme"'),
  f('start_date', 'Inception', 'YYYY-MM-DD'),
  f('claims_experience', 'Claims experience', 'last 3 years from the expiring insurer, or "new scheme"'),
  f('incumbent', 'Expiring insurer and premium', 'for a renewal'),
]

function ebSubmission(i: SubmissionInput): string {
  const x = i.spec.fields ?? {}
  return [
    i.roundNo > 1 ? `Further to our earlier submission, the basis has changed as follows: ${i.changeSummary ?? 'see below'}.` : `We are seeking quotations for the employee benefits programme of ${i.clientName}:`,
    '',
    line('Policyholder', i.spec.insured ?? i.clientName),
    line('Members', x.member_count),
    line('Benefits', x.benefits ?? i.spec.scope),
    line('Inception', fmtDate(x.start_date ?? i.inceptionDate)),
    line('Expiring insurer', x.incumbent),
    line('Claims experience', x.claims_experience),
    i.spec.notes ? `Notes: ${i.spec.notes}` : null,
    '',
    'The member census and the expiring schedule of benefits are attached.',
    i.deadline ? `We would appreciate your quotation by ${fmtDate(i.deadline)}.` : 'We would appreciate your quotation within 5 working days.',
  ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

// ── Motor fleet (commercial vehicles; fleet quotes need 3 years of claims) ──
const MOTOR_FIELDS = [
  f('vehicle_count', 'Number of vehicles', 'how many'),
  f('vehicle_list', 'Vehicle list', '"attached" when a list with registration, make, model, year, use and sum insured is attached'),
  f('cover', 'Cover', 'comprehensive, third party fire and theft, or third party'),
  f('drivers', 'Drivers', 'any authorised driver, or named drivers with ages and experience'),
  f('ncd', 'No-claim discount', 'per vehicle or for the fleet'),
  f('claims_history', 'Claims history, last 3 years', 'by vehicle, or "nil"'),
  f('start_date', 'Inception', 'YYYY-MM-DD'),
  f('incumbent', 'Expiring insurer and premium', 'for a renewal'),
]

function motorSubmission(i: SubmissionInput): string {
  const x = i.spec.fields ?? {}
  return [
    i.roundNo > 1 ? `Further to our earlier submission, the basis has changed as follows: ${i.changeSummary ?? 'see below'}.` : `We would like to request your quotation for the motor fleet of ${i.clientName}:`,
    '',
    line('Insured', i.spec.insured ?? i.clientName),
    line('Number of vehicles', x.vehicle_count),
    line('Cover', x.cover ?? 'Comprehensive'),
    line('Drivers', x.drivers),
    line('No-claim discount', x.ncd),
    line('Claims history, last three years', x.claims_history),
    line('Inception', fmtDate(x.start_date ?? i.inceptionDate)),
    line('Expiring insurer', x.incumbent),
    i.spec.notes ? `Notes: ${i.spec.notes}` : null,
    '',
    'The vehicle list is attached.',
    i.deadline ? `We would appreciate your quotation by ${fmtDate(i.deadline)}.` : 'We would appreciate your quotation within 3 working days.',
  ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

// ── Liability (Nathan's, Catherine's and Hasya's requests, Jun–Oct 2026) ──
// Four flows behind one product: a contract or tender that names the cover (the clause decides the
// limit, the insured parties and completed operations), a landlord or MCST that requires it, an
// annual business policy (often an SME package with property and WICA), and product liability for
// specialist risks, where most markets decline on appetite.
const LIABILITY_FIELDS = [
  f('purpose', 'Purpose', 'annual business cover, a project or contract, a landlord or MCST requirement, an event, or product liability'),
  f('requirement', 'Requirement clause', 'the contract, tender, lease or MCST clause naming the cover, verbatim'),
  f('business', 'Business activities', 'what the insured does, in two or three lines'),
  f('limit', 'Limit of liability', 'per occurrence and in the aggregate, verbatim'),
  f('insureds', 'Insured parties', 'principal, landlord, MCST or co-insureds the requirement names'),
  f('location', 'Location of works or premises', 'address'),
  f('period', 'Period', 'annual, or the project period plus any completed-operations period'),
  f('turnover', 'Turnover', 'last financial year and the next 12 months'),
  f('products', 'Products and export territories', 'for product liability: products, sales by country, any USA or Canada exposure'),
  f('uen', 'UEN', 'the company registration number'),
  f('claims_history', 'Claims history, last 3 years', 'or "nil"'),
  f('existing_cover', 'Existing cover', 'expiring PL, or the CAR policy whose third party section the requirement does not accept'),
  f('start_date', 'Inception', 'YYYY-MM-DD'),
]

function liabilitySubmission(i: SubmissionInput): string {
  const x = i.spec.fields ?? {}
  return [
    i.roundNo > 1 ? `Further to our earlier submission, the basis has changed as follows: ${i.changeSummary ?? 'see below'}.` : `Do let us know if you are keen to quote the following liability risk for ${i.clientName}:`,
    '',
    line('Insured', i.spec.insured ?? i.clientName),
    line('UEN', x.uen),
    line('Purpose', x.purpose),
    line('Business activities', x.business ?? i.spec.scope),
    line('Location', x.location),
    line('Limit of liability', x.limit ?? i.spec.limit),
    line('Period of insurance', x.period ?? `12 months from ${fmtDate(x.start_date ?? i.inceptionDate) ?? 'a date to be confirmed'}`),
    line('Insured parties', x.insureds),
    x.requirement ? `Insurance required:\n${x.requirement}` : null,
    line('Turnover', x.turnover),
    line('Products and territories', x.products),
    line('Existing cover', x.existing_cover),
    line('Claims history, last three years', x.claims_history),
    i.spec.extras ? `Extensions requested: ${i.spec.extras}` : null,
    i.spec.notes ? `Notes: ${i.spec.notes}` : null,
    '',
    x.requirement || x.insureds ? 'Kindly confirm the wording meets the requirement above and that the parties named can be included, with the estimated premium.' : 'Kindly advise the estimated premium and any further information you need.',
    'The completed proposal form is attached.',
    i.deadline ? `We would appreciate your terms by ${fmtDate(i.deadline)}.` : 'We would appreciate your terms within 5 working days.',
  ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

/** Which liability flow a request is: decides the panel. */
export function liabilityFlow(spec: Spec | undefined): 'contract' | 'products' | 'event' | 'sme' {
  const x = spec?.fields ?? {}
  const t = `${x.purpose ?? ''} ${x.products ?? ''} ${x.business ?? ''}`.toLowerCase()
  if (/product|export|usa|canada|medical device|life science|supplement|aviation|drone|autonomous|battery|chemical/.test(t)) return 'products'
  if (x.requirement || /project|contract|tender|renovation|mcst|landlord|works|award/.test(t)) return 'contract'
  if (/event|party|festival|exhibition|concert|wedding|roadshow/.test(t)) return 'event'
  return 'sme'
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
    required: ['project', 'contract_value', 'period_months'],
    submission: constructionSubmission,
  },
  surety_bonds: {
    family: 'bond', fields: BOND_FIELDS, markets: () => 3, deadlineWorkingDays: 5,
    preferred: () => ['EQ Insurance', 'ECICS', 'ERGO', 'Tokio Marine', 'Allianz Trade', 'Great Eastern', 'Sompo', 'China Taiping'],
    documentsToAsk: ['Letter of award', 'Bond wording and the percentage required', 'ACRA business profile', 'Audited accounts, last two years', 'Track record of completed projects', "Directors' notices of assessment"],
    required: ['beneficiary', 'contract_value', 'bond_type'],
    submission: bondSubmission,
  },
  professional_indemnity: { family: 'financial', fields: FINANCIAL_FIELDS, required: ['business', 'limit', 'revenue'], markets: () => 3, deadlineWorkingDays: 5, preferred: () => FINANCIAL, documentsToAsk: ['Completed proposal form', 'Audited accounts, latest', 'Expiring policy schedule', 'Claims history, 5 years'], submission: i => financialSubmission(i, 'professional indemnity insurance') },
  do: { family: 'financial', fields: FINANCIAL_FIELDS, required: ['business', 'limit', 'revenue'], markets: () => 3, deadlineWorkingDays: 5, preferred: () => FINANCIAL, documentsToAsk: ['Completed proposal form', 'Audited accounts, latest', 'Expiring policy schedule', 'Claims history, 5 years'], submission: i => financialSubmission(i, "directors' and officers' liability insurance") },
  imi: { family: 'financial', fields: FINANCIAL_FIELDS, markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['BHSI', 'Chubb', 'Berkley'], documentsToAsk: ['Completed proposal form', 'Private placement memorandum', 'Audited accounts and interims', 'Expiring policy schedule'], submission: i => financialSubmission(i, 'investment management insurance') },
  cyber: { family: 'financial', fields: FINANCIAL_FIELDS, required: ['business', 'limit', 'revenue'], markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['Chubb', 'Delta', 'Allianz', 'MSIG', 'APRIL'], documentsToAsk: ['Completed cyber proposal form', 'Revenue and headcount', 'Expiring policy schedule'], submission: i => financialSubmission(i, 'cyber insurance') },
  medical_malpractice: { family: 'financial', fields: FINANCIAL_FIELDS, markets: () => 2, deadlineWorkingDays: 5, preferred: () => ['Chubb'], documentsToAsk: ['Completed proposal form', 'Practitioner list', 'Claims history, 5 years'], submission: i => financialSubmission(i, 'medical malpractice insurance') },
  general_liability: {
    family: 'liability', fields: LIABILITY_FIELDS, deadlineWorkingDays: 5, required: ['purpose', 'business', 'limit'], submission: liabilitySubmission,
    // Specialist product risks decline in most markets: ask more of them, the casualty specialists first.
    markets: () => 3,
    preferred: ({ spec }) => {
      const flow = liabilityFlow(spec)
      if (flow === 'products') return ['Chubb', 'AXA XL', 'BHSI', 'AIG', 'Berkley', 'Zurich']
      if (flow === 'contract') return ['EQ Insurance', 'Chubb', 'Liberty', 'HLAS', 'Tokio Marine', 'Great American', 'Zurich', 'Great Eastern']
      return ['Great Eastern', 'MSIG', 'Liberty', 'HLAS', 'EQ Insurance', 'Chubb', 'Allianz']
    },
    documentsToAsk: ['The contract, tender, lease or MCST clause that requires the cover, if any', 'Completed public liability proposal form', 'Business activities and turnover, last year and next 12 months', 'Claims history, last 3 years', 'For products: products, sales by country, any USA or Canada exposure'],
  },
  iar_fire: { family: 'property', fields: [], markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['Allianz', 'Great Eastern', 'China Taiping', 'ECICS', 'EQ Insurance', 'HLAS', 'Liberty', 'Sompo', 'ERGO'], documentsToAsk: ['Sums insured by location', 'Construction, occupancy and fire protection', 'Claims history, 3 years'] },
  wica: { family: 'workforce', fields: WICA_FIELDS, markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['Liberty', 'Allianz', 'EQ Insurance', 'Zurich', 'Chubb', 'Income', 'Great Eastern', 'MSIG'], documentsToAsk: ['Headcount by category of work, with estimated annual wages', 'Nature of business and UEN', 'Claims history, last 3 years'], required: ['business', 'categories', 'start_date'], submission: wicaSubmission },
  foreign_worker_medical: { family: 'workforce', fields: FWMI_FIELDS, markets: () => 3, deadlineWorkingDays: 3, preferred: () => ['Great Eastern', 'QBE', 'Income', 'Liberty', 'MSIG', 'Raffles Health', 'Tokiomarine Life'], documentsToAsk: ['Worker list with work permit numbers, nationality and date of birth', 'Plan: MOM minimum or enhanced', 'Whether a foreign worker bond is needed'], required: ['worker_count', 'worker_list', 'start_date'], submission: fwmiSubmission },
  foreign_worker_bond: { family: 'workforce', fields: FWMI_FIELDS, markets: () => 2, deadlineWorkingDays: 3, preferred: () => ['Great Eastern', 'EQ Insurance', 'ECICS', 'Liberty'], documentsToAsk: ['Worker list with work permit numbers and nationality (Malaysians are exempt)'], required: ['worker_count', 'worker_list'], submission: fwmiSubmission },
  group_personal_accident: { family: 'workforce', fields: GPA_FIELDS, markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['Chubb', 'Zurich', 'Liberty', 'QBE', 'AIG', 'Allianz', 'MSIG'], documentsToAsk: ['Number of insured persons or units, and whether named', 'Benefits and sums insured wanted', 'Activities or occupations covered', 'Claims history, last 3 years'], required: ['insured_persons', 'benefits', 'start_date'], submission: gpaSubmission },
  commercial_vehicle: { family: 'motor', fields: MOTOR_FIELDS, markets: () => 3, deadlineWorkingDays: 3, preferred: () => ['ECICS', 'Liberty', 'Income', 'EQ Insurance', 'ERGO', 'China Taiping', 'Etiqa'], documentsToAsk: ['Vehicle list with registration, make, model, year, use and sum insured', 'Driver details', 'Claims history by vehicle, last 3 years (fleet quotes need it)', 'No-claim discount per vehicle'], required: ['vehicle_list', 'claims_history', 'start_date'], submission: motorSubmission },
  marine_cargo: { family: 'marine', fields: [], markets: () => 4, deadlineWorkingDays: 5, preferred: () => ['Great American', 'QBE', 'Markel', 'Chubb', 'Sompo', 'AIG'], documentsToAsk: ['Commodities and packing', 'Annual turnover and maximum per conveyance', 'Routes and conveyances'] },
  group_health: { family: 'eb', fields: EB_FIELDS, markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['QBE', 'Income', 'Singlife', 'AIA', 'Cigna', 'Raffles Health'], documentsToAsk: ['Member census with date of birth, gender, plan and dependants', 'Expiring schedule of benefits, or the benefits wanted', 'Claims experience, last 3 years, from the expiring insurer'], required: ['member_count', 'census', 'start_date'], submission: ebSubmission },
  employee_benefits: { family: 'eb', fields: EB_FIELDS, markets: () => 3, deadlineWorkingDays: 5, preferred: () => ['QBE', 'Income', 'Singlife', 'AIA', 'Cigna', 'Raffles Health'], documentsToAsk: ['Member census with date of birth, gender, plan and dependants', 'Expiring schedule of benefits, or the benefits wanted', 'Claims experience, last 3 years, from the expiring insurer'], required: ['member_count', 'census', 'start_date'], submission: ebSubmission },
}

/**
 * Pure. What the insurers cannot price without, for this line, from what the request holds.
 * Returns the labels of the missing required fields, in the spec's order. A line with no required
 * fields is never held.
 */
export function missingData(productLine: string, spec: Spec, inceptionDate: string | null = null): string[] {
  const s = LINE_SPECS[productLine]
  if (!s?.required?.length) return []
  const x = spec.fields ?? {}
  const has = (k: string) => {
    const v = String(x[k] ?? '').trim()
    if (!v || /^(unknown|not stated|tbc|to be confirmed|n\/?a|none given|missing)$/i.test(v)) return false
    // A document field counts only when the file is said to be attached.
    if (['census', 'worker_list', 'vehicle_list'].includes(k)) return /attach|enclos|provided|list of \d+/i.test(v) && !/\b(to be|will|pending|awaiting|not yet|later|tbc)\b/i.test(v)
    return true
  }
  // The contract value may come from the limit; the start date from the inception date on the line.
  const alt: Record<string, () => boolean> = { contract_value: () => !!contractValueOf(spec), start_date: () => !!inceptionDate || !!x.start_date || /\d{4}|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(String(spec.period ?? '')) }
  return s.required.filter(k => !(has(k) || alt[k]?.())).map(k => s.fields.find(f => f.key === k)?.label ?? k)
}

/** How each required item is asked of the client, in plain words. Identical asks are sent once. */
const ASK: Record<string, string> = {
  business: 'The nature of your business',
  categories: 'Headcount by category of work, with the estimated annual wages for each category',
  start_date: 'The date cover should start',
  worker_count: 'The list of workers to cover, with work permit numbers, nationality and date of birth',
  worker_list: 'The list of workers to cover, with work permit numbers, nationality and date of birth',
  insured_persons: 'The number of persons (or units) to insure, and whether they are named',
  benefits: 'The benefits and sums insured you would like',
  member_count: 'The member census: date of birth, gender, plan and dependants for each member',
  census: 'The member census: date of birth, gender, plan and dependants for each member',
  vehicle_list: 'The vehicle list: registration, make, model, year, use and sum insured',
  claims_history: 'The claims history for the last 3 years',
  project: 'The letter of award or contract, with the project title, contract value and construction period',
  contract_value: 'The letter of award or contract, with the project title, contract value and construction period',
  period_months: 'The letter of award or contract, with the project title, contract value and construction period',
  beneficiary: 'The letter of award and the bond wording the beneficiary requires',
  bond_type: 'The letter of award and the bond wording the beneficiary requires',
  limit: 'The limit of liability required',
  purpose: 'Why the cover is needed: annual business cover, a project or contract (please send the clause that requires it), a landlord or MCST requirement, an event, or product liability',
  revenue: 'Revenue for the last financial year',
}

/** Pure. The client-facing asks for what a line is missing, deduplicated, in the spec's order. */
export function missingAsks(productLine: string, spec: Spec, inceptionDate: string | null = null): string[] {
  const s = LINE_SPECS[productLine]
  if (!s) return []
  const missing = new Set(missingData(productLine, spec, inceptionDate))
  const keys = (s.required ?? []).filter(k => missing.has(s.fields.find(f => f.key === k)?.label ?? k))
  return Array.from(new Set(keys.map(k => ASK[k] ?? (s.fields.find(f => f.key === k)?.label ?? k))))
}

const RISK_STOP = new Set(['company', 'services', 'service', 'business', 'singapore', 'limited', 'private', 'insurance', 'cover', 'their', 'with', 'from', 'that', 'this', 'which', 'other', 'works', 'work', 'general', 'provide', 'provides', 'products', 'product'])
const riskWords = (t: string) => new Set(String(t).toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !RISK_STOP.has(w)))

/**
 * Pure. Two requests describe a similar risk: their business descriptions share two meaningful
 * words, or half the words of the shorter one. Used to remember an insurer's appetite decline.
 */
export function similarRisk(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = riskWords(a ?? ''), y = riskWords(b ?? '')
  if (!x.size || !y.size) return false
  let shared = 0
  for (const w of x) if (y.has(w)) shared++
  return shared >= 2 || shared / Math.min(x.size, y.size) >= 0.5
}

/** The limit a request requires, as a number, from its fields or its limit text. */
export function requiredLimit(spec: Spec): number | null {
  return money(spec.fields?.limit) ?? money(spec.limit)
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
  const pref = s.preferred({ contractValue: contractValueOf(spec), spec }).map(p => p.toLowerCase())
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
