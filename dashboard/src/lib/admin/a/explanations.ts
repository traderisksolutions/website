/**
 * The explanations TRS gives again and again, in the broker's own terms, so the answer agent
 * quotes the house position instead of composing one. Read on 2 Nov 2026 from Nathan's sent mail.
 * Pure: a question in, the best-matching passage out, or null. Each passage states the fact and
 * its consequence and stops; the drafter puts it under a greeting.
 */

export type Explanation = { topic: string; text: string; cues: RegExp[] }

export const EXPLANATIONS: Explanation[] = [
  {
    topic: 'headcount_basis',
    cues: [/headcount/i, /head.?count basis/i, /named (?:basis|employees?)/i, /unnamed/i, /how (?:does|is) the premium (?:work|charged|calculated)/i],
    text: 'The premium is charged on the number of employees declared, not on named individuals, and every eligible employee is covered. The census counts heads at inception and again at the year-end adjustment, when the premium is adjusted to the actual headcount. For additions and removals of staff during the year no declaration is needed, as the policy is on an unnamed basis.',
  },
  {
    topic: 'debit_note_not_tax_invoice',
    cues: [/tax invoice/i, /\binvoice\b.*\b(trs|you|broker)/i, /debit note/i, /e-?invoic/i, /\bgst\b.*(invoice|debit)/i],
    text: 'As an insurance broker, TRS issues a debit note that follows the insurer\'s tax invoice; under MAS rules the tax invoice for the premium comes from the insurer. Settlement can be made to Trade Risk Solutions against our debit note, and we settle the premium with the insurer on your behalf, which keeps tracking and reconciliation in one place.',
  },
  {
    topic: 'backdating_lou',
    cues: [/backdat/i, /start (?:date|the cover) (?:from|on) .*(?:last|earlier|ago)/i, /letter of undertaking/i, /\blou\b/i, /nil claims/i],
    text: 'Insurers will backdate the start of cover to the date the risk began only against a letter of undertaking of nil claims: a signed confirmation that no loss, claim or known event has occurred between that date and the date of instruction. If the start date moves to today, no undertaking is needed.',
  },
  {
    topic: 'retroactive_date',
    cues: [/retro(?:active)? date/i, /claims.?made/i, /backdate .*(?:pi|professional indemnity|d&o|cyber)/i, /cover (?:for )?(?:work|services) done (?:before|previously)/i],
    text: 'Professional indemnity, directors\' and officers\' and cyber policies are written on a claims-made basis. They cannot be backdated; instead the policy carries a retroactive date, and claims first made during the policy period for work done after that date are covered. A continuous retroactive date is the reason a first-year policy is usually renewed with the incumbent insurer rather than re-marketed.',
  },
  {
    topic: 'mid_year_dependants',
    cues: [/dependants?.*(?:mid|during|add)/i, /add (?:a |my )?(?:spouse|child|dependants?)/i, /pro.?rat.*(?:dependant|premium)/i],
    text: 'A dependant added during the policy year is charged the full annual premium for that plan, not a pro-rated premium: the insurer prices the plan on the year, and a mid-year entry carries the same anti-selection risk as a full-year one.',
  },
  {
    topic: 'takeover_minimum',
    cues: [/take.?over/i, /minimum (?:number of )?(?:lives|staff|employees|headcount)/i, /(?:how many|at least) .*(?:lives|employees)/i, /portfolio (?:plan|product)/i],
    text: 'A group medical takeover, where the new insurer waives pre-existing conditions for members covered under the expiring policy, needs a minimum of 11 lives. Below that the plan is a portfolio product priced on the book, and the insurer allows no individual exceptions.',
  },
  {
    topic: 'self_insure_below_deductible',
    cues: [/deductible/i, /\bexcess\b.*(?:worth|claim|small)/i, /small claims?/i, /worth claiming/i],
    text: 'Losses below the deductible are for the insured\'s own account, so an item that costs less than the deductible to replace is in practice self-insured. Insuring it adds premium without adding cover; a higher deductible with a lower premium is often the better trade.',
  },
  {
    topic: 'pel_and_sppi',
    cues: [/\bpel\b/i, /public and employers'? liability/i, /\bsppi\b/i, /single project professional/i, /design and build/i],
    text: 'On a construction project we recommend public and employers\' liability alongside the contractors\' all risks, so third-party injury and damage and site workers are covered, and single project professional indemnity where the contract carries design responsibility. Both are priced on the contract value and are commonly required by the principal.',
  },
  {
    topic: 'wic_annual_not_project',
    cues: [/work injury.*project/i, /project (?:wica?|work injury)/i, /wica? (?:for|per) (?:the |this )?project/i, /annual (?:wica?|work injury)/i],
    text: 'Work injury compensation is arranged as an annual policy on the company\'s whole workforce, not per project; insurers no longer issue a project work injury policy. Site workers are covered under the annual policy, declared by occupation and estimated wages.',
  },
  {
    topic: 'ear_vs_cgl',
    cues: [/\bear\b.*\bcgl\b/i, /\bcgl\b.*\bear\b/i, /erection all risks/i, /difference between .*(?:ear|cgl|car)/i],
    text: 'Erection all risks covers the plant and equipment being installed and the works themselves against physical damage during erection and testing; comprehensive general liability covers injury or damage to third parties arising from the work. A contract that requires cover for the installed equipment needs the erection all risks policy; liability alone does not respond to damage to the works.',
  },
  {
    topic: 'appointment_letter',
    cues: [/appointment letter/i, /letter of appointment/i, /broker of record/i, /another (?:broker|intermediary|agent)/i, /switch(?:ing)? broker/i],
    text: 'Where an insurer already deals with another intermediary on the account, it will quote or act for TRS only on the client\'s signed letter of appointment on company letterhead. No agreement with TRS is needed otherwise; an email instruction suffices for binding.',
  },
  {
    topic: 'quote_validity',
    cues: [/valid(?:ity)? (?:of|for) (?:the )?quot/i, /how long (?:is|are) (?:the )?quot/i, /quote (?:still )?(?:valid|stand)/i],
    text: 'A quotation stands for the validity period the insurer states, commonly 14 to 30 days; after that the insurer may re-rate on current terms or claims. Binding within the validity period, on a signed and dated proposal form within 30 days before inception, holds the quoted terms.',
  },
]

const WORD = /[a-z][a-z&'-]{2,}/g

/** Pure. The explanation that fits the question best, by cue hits; null when none fires. */
export function explain(question: string): Explanation | null {
  const q = question.toLowerCase()
  let best: { e: Explanation; hits: number } | null = null
  for (const e of EXPLANATIONS) {
    const hits = e.cues.filter(c => c.test(q)).length
    if (hits && (!best || hits > best.hits)) best = { e, hits }
  }
  if (!best) return null
  // One cue alone is enough only when the question is short and about that one thing.
  const words = (q.match(WORD) ?? []).length
  return best.hits >= 2 || words <= 40 ? best.e : null
}
