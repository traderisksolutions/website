/** Human labels for Find answers, generated from the corpcover.com questionnaire (find-v1). Client-safe. */
import data from './corpcover-find-labels.json'

type Q = { id: string; sec: string | null; type: string; title: string; opts: [string, string][] }
export const FIND_QUESTIONS = data.questions as Q[]
export const PRODUCT_LABEL = data.products as Record<string, string>

const byId = new Map(FIND_QUESTIONS.map(q => [q.id, q]))

/** The answer as the buyer saw it: option labels, not stored codes. */
export function answerLabel(id: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '–'
  const q = byId.get(id)
  const one = (v: unknown) => {
    const hit = q?.opts.find(o => o[0] === String(v))
    if (hit) return hit[1]
    if (id === 'needs') return PRODUCT_LABEL[String(v)] ?? String(v)
    return String(v)
  }
  if (Array.isArray(value)) return value.map(one).join(', ') || '–'
  if (typeof value === 'object') return JSON.stringify(value)
  return one(value)
}

export const FLAG_LABEL: Record<string, string> = {
  claims_history: 'Claims history', us_exposure: 'USA or Canada exposure', above_sme_plans: 'Revenue above S$50m',
  prior_decline: 'Previously declined', select_plus_commercial: 'Select+ Commercial', hazardous_work: 'Hazardous work',
  cyber_controls: 'Cyber controls', listed_do: 'Listed company D&O',
}

export const SOURCE_COLUMNS: [string, string][] = [['find', 'Find'], ['confirm', 'Confirm'], ['acra', 'ACRA'], ['adviser', 'Call'], ['sign', 'Signs'], ['na', 'If applicable']]

/** Chubb proposal form behind each proposal_fields key. */
export const FORM_TITLE: Record<string, string> = {
  "select7": "Select+ Proposal Form",
  "selectc": "Select+ Proposal Form For Commercial Businesses",
  "wic": "Chubb Work Guard Proposal and Declaration Form",
  "gl": "General Liability Insurance Proposal Form",
  "pl": "Product Liability Insurance Proposal Form",
  "pi_acc": "Professional Indemnity Insurance Proposal Form For Accountants",
  "pi_accsme": "Professional Indemnity Insurance Application Form \u2013 SME Pre-Underwritten Plan for Accountants",
  "pi_law": "Professional Indemnity Insurance Proposal Form For Lawyers",
  "pi_con": "Professional Indemnity Insurance Proposal Form For Construction Professionals",
  "pi_re": "Chubb Elite Real Estate Professional Indemnity Insurance \u2013 Application Form for Real Estate Professionals",
  "pi_it": "Professional Indemnity Insurance Proposal Form For Technology Professionals Liability",
  "pi_media": "Professional Indemnity Insurance Proposal Form For Media Industry Professional Liability",
  "pi_misc": "Professional Indemnity Insurance Proposal Form For Miscellaneous Occupations",
  "do_pre": "Directors & Officers Liability Insurance \u2014 Application Form for Pre-Underwritten Plan",
  "do_elite": "Chubb Elite V Directors & Officers Liability Insurance Proposal Form \u2013 For New Business",
  "cy_sme": "Cyber Enterprise Risk Management Insurance Proposal Form (SME Pre-Priced Program 2025)",
  "cy_short": "Cyber Enterprise Risk Management Insurance Short Proposal Form",
  "sef": "Social Engineering Fraud Insurance Proposal Form (Pre-Priced Program)",
  "gpa": "Group Personal Accident Proposal Form",
  "travel": "Group Business Travel Proposal Form",
  "cargo": "Marine Cargo Insurance Proposal Form",
  "event": "Chubb Event Liability Proposal Form",
  "tech": "PremierTech PI, Cyber and General Liability Proposal Form"
}
