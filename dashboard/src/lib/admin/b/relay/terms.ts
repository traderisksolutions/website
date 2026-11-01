/**
 * Reading what a quote states, and what a quote request still lacks. Pure. Anything not stated
 * stays blank: the relay copies figures, it never fills them in.
 */

export type QuoteTerms = {
  premium: string | null
  period: string | null
  excess: string | null
  limit: string | null
  sumInsured: string | null
  reference: string | null
  validity: string | null
}

const money = (s: string) => {
  const m = /(?:S\$|SGD|USD|US\$|RM|\$)\s?\d[\d,]*(?:\.\d{1,2})?/i.exec(s)
  return m ? m[0].replace(/\s+/g, ' ').trim() : null
}

/** The figure in the same sentence as a label, e.g. "annual premium of S$12,476.58 (before GST)". */
function near(text: string, label: RegExp): string | null {
  for (const sentence of text.split(/(?<=[.!?\n])\s+|\n/)) {
    if (!label.test(sentence)) continue
    const m = money(sentence)
    if (m) return m
  }
  return null
}

export function extractQuoteTerms(text: string): QuoteTerms {
  const t = String(text ?? '')
  const period = (() => {
    const m = /\b(?:period(?: of insurance)?|from)\s*:?\s*(\d{1,2}[ /.-](?:\w{3,9}|\d{1,2})[ /.-]\d{2,4})\s*(?:to|-|–|till|until)\s*(\d{1,2}[ /.-](?:\w{3,9}|\d{1,2})[ /.-]\d{2,4})/i.exec(t)
    if (m) return `${m[1]} to ${m[2]}`
    const y = /\b(12|24|36) months?\b/i.exec(t)
    return y ? `${y[1]} months` : null
  })()
  const validity = (() => {
    const m = /\b(?:valid|validity)\s*(?:for|until|till|up to)?\s*:?\s*(\d{1,2}\s?days?|\d{1,2}[ /.-](?:\w{3,9}|\d{1,2})[ /.-]\d{2,4})/i.exec(t)
    return m ? m[1] : null
  })()
  const reference = (() => {
    const m = /\b(?:quot(?:e|ation)|ref(?:erence)?|our ref|policy)\s*(?:no\.?|number|#|:)\s*([A-Z0-9][A-Z0-9/-]{4,30})/i.exec(t)
    return m ? m[1] : null
  })()
  return {
    premium: near(t, /\bpremium\b/i),
    period,
    excess: near(t, /\b(excess|deductible)\b/i),
    limit: near(t, /\b(limit of (?:liability|indemnity)|limit|aggregate|any one (?:occurrence|claim|accident))\b/i),
    sumInsured: near(t, /\bsum insured\b/i),
    reference,
    validity,
  }
}

/** Rows for the body of a relay to the client; blanks are left out, not invented. */
export function termsRows(q: QuoteTerms): [string, string][] {
  const rows: [string, string | null][] = [
    ['Premium', q.premium], ['Period', q.period], ['Sum insured', q.sumInsured], ['Limit', q.limit],
    ['Excess', q.excess], ['Quote reference', q.reference], ['Valid', q.validity],
  ]
  return rows.filter((r): r is [string, string] => !!r[1])
}

/**
 * What an insurer needs before it can quote a line, and how a client's words or files show it
 * was given. Each item is checked by evidence; a client who attached a proposal form is not
 * asked for one.
 */
type Need = { item: string; evidence: RegExp[]; docs?: string[] }

const PROPOSAL: Need = { item: 'Completed proposal form', evidence: [/proposal form/i], docs: ['proposal_form'] }
const MEMBERS: Need = { item: 'Employee list with dates of birth and plan category', evidence: [/\b(name list|member list|employee list|census|headcount of \d|\d+\s*(?:staff|employees|members|pax|lives))\b/i], docs: ['member_list', 'member_movement'] }
const TURNOVER: Need = { item: 'Annual turnover or revenue', evidence: [/\b(turnover|revenue|annual (?:sales|fees))\b/i], docs: ['company_documents'] }
const CLAIMS: Need = { item: 'Claims history for the last 3 years', evidence: [/\b(claims? (?:history|experience|record|listing)|loss run|no claims?)\b/i], docs: ['claims_history'] }
const EXPIRING: Need = { item: 'Current policy schedule', evidence: [/\b(policy schedule|current (?:policy|insurer)|expiring (?:policy|terms)|renewal notice)\b/i], docs: ['policy_schedule', 'renewal_notice'] }

export const NEEDS_BY_LINE: Record<string, Need[]> = {
  wica: [{ item: 'Headcount and annual wages by occupation', evidence: [/\b(wages?|salary|salaries|payroll|headcount|\d+\s*(?:staff|employees|workers))\b/i], docs: ['member_list'] }, CLAIMS, EXPIRING],
  foreign_worker_medical: [{ item: 'Worker list with work permit numbers', evidence: [/\b(work permit|wp no|fin\b|worker list)\b/i], docs: ['member_list'] }],
  group_health: [MEMBERS, { item: 'Benefit level required (plan or current benefits)', evidence: [/\b(plan [a-d1-4]|benefit(?:s| level| table)|same (?:plan|benefits|terms)|as per existing)\b/i], docs: ['benefit_summary', 'policy_schedule'] }, CLAIMS],
  employee_benefits: [MEMBERS, CLAIMS],
  group_travel: [{ item: 'Number of trips or travellers a year and destinations', evidence: [/\b(trips?|travellers?|destinations?|countries)\b/i] }],
  commercial_vehicle: [{ item: 'Vehicle list with registration numbers and current NCD', evidence: [/\b([A-Z]{1,3}\d{1,4}[A-Z]\b|vehicle list|registration|\bncd\b)/i], docs: ['member_list'] }, CLAIMS],
  construction_car: [{ item: 'Contract value and project period', evidence: [/\b(contract (?:value|sum|price)|project (?:value|sum|period|duration)|\d+\s*months)\b/i], docs: ['contract_requirements'] }, { item: 'Scope of works and site address', evidence: [/\b(scope of works?|site|location|address)\b/i], docs: ['contract_requirements'] }],
  machinery_breakdown: [{ item: 'Machinery list with values', evidence: [/\b(machinery list|equipment list|value)\b/i] }],
  electronic_equipment: [{ item: 'Equipment list with values', evidence: [/\b(equipment list|value)\b/i] }],
  professional_indemnity: [PROPOSAL, TURNOVER, { item: 'Limit of indemnity required', evidence: [/\b(limit|indemnity of|S\$\s?\d)/i] }],
  do: [PROPOSAL, { item: 'Latest audited accounts', evidence: [/\b(audited|financial statements?|accounts)\b/i], docs: ['company_documents'] }],
  imi: [PROPOSAL, { item: 'Assets under management', evidence: [/\b(aum|assets under management)\b/i] }],
  cyber: [PROPOSAL, TURNOVER],
  medical_malpractice: [PROPOSAL, TURNOVER],
  environmental_liability: [PROPOSAL],
  general_liability: [TURNOVER, { item: 'Business activities and limit required', evidence: [/\b(activit|business of|nature of business|limit)\b/i] }],
  iar_fire: [{ item: 'Sum insured by building, contents and stock', evidence: [/\b(sum insured|building|contents|stock|S\$\s?\d)/i] }, { item: 'Risk address', evidence: [/\b(address|located at|premises|#\d{2}-\d{2,3})\b/i] }],
  marine_cargo: [{ item: 'Commodity, routes and annual shipment value', evidence: [/\b(commodity|goods|cargo|route|shipment|annual (?:value|turnover))\b/i] }],
  stock_throughput: [{ item: 'Stock values by location', evidence: [/\b(stock|location|value)\b/i] }],
  surety_bonds: [{ item: 'Bond wording, amount and beneficiary', evidence: [/\b(bond (?:wording|format|amount|value)|beneficiary|employer)\b/i], docs: ['contract_requirements'] }, { item: 'Latest audited accounts', evidence: [/\b(audited|financial)\b/i], docs: ['company_documents'] }],
  trade_credit: [{ item: 'Buyer list with credit limits and annual sales', evidence: [/\b(buyer|credit limit|annual sales|turnover)\b/i] }],
  keyman: [{ item: 'Name, age and sum assured of the key person', evidence: [/\b(age|date of birth|sum assured)\b/i] }],
}

export function missingForQuote(line: string | null, text: string, docTypes: string[]): string[] {
  const needs = line ? NEEDS_BY_LINE[line] : null
  if (!needs) return []
  const docs = new Set(docTypes)
  return needs.filter(n => !(n.docs ?? []).some(d => docs.has(d)) && !n.evidence.some(re => re.test(text))).map(n => n.item)
}
