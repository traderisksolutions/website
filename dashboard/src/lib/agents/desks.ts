/**
 * The line sub-agents ("desks") and how an email names them. Pure; tested in
 * src/lib/agents/__tests__/desks.test.ts. See docs/agent-routing.md.
 */
export const DESKS = ['eb', 'car', 'wica', 'financial', 'motor', 'property', 'liability', 'general'] as const
export type Desk = typeof DESKS[number]

const DESK_OF: Record<string, Desk> = {
  employee_benefits: 'eb', group_health: 'eb', group_personal_accident: 'eb', foreign_worker_medical: 'eb', group_travel: 'eb',
  construction_car: 'car',
  wica: 'wica',
  professional_indemnity: 'financial', do: 'financial', cyber: 'financial', imi: 'financial',
  commercial_vehicle: 'motor',
  iar_fire: 'property', business_interruption: 'property', machinery_breakdown: 'property', electronic_equipment: 'property', stock_throughput: 'property',
  general_liability: 'liability', environmental_liability: 'liability', medical_malpractice: 'liability',
}

/** The desk a product line belongs to; general for any line not given its own desk. */
export function deskFor(line: string | null | undefined): Desk {
  return (line && DESK_OF[line]) || 'general'
}

/** Desks whose endorsements are member or vehicle lists the movement intake reads (Phase 1). */
export const MOVEMENT_DESKS: ReadonlySet<Desk> = new Set(['eb', 'motor'])

/**
 * Words that name a product line in an email. Member lines are told apart (FWMI vs GHS), because
 * one email often moves people on both and a marked list belongs to one policy only.
 */
export const LINE_WORDS: [string, RegExp][] = [
  ['foreign_worker_medical', /\b(?:fwmi|foreign worker(?:s'?)? medical|work permit (?:holders?|medical)|hfw)\b/i],
  ['group_personal_accident', /\b(?:gpa|group (?:personal )?accident|personal accident)\b/i],
  ['group_travel', /\b(?:group|business|corporate) travel\b/i],
  ['employee_benefits', /\b(?:ghs|gtl|gmm|gci|gp|sp|group (?:hospital\w*|health|medical|term|life|insurance)|hospital(?:isation)? (?:and|&) surgical|employee benefits?|eb (?:plan|policy|insurance)|medical (?:plan|benefits?|insurance|card)|outpatient|dental|insurance plan)\b/i],
  ['wica', /\b(?:wica?|work(?:er|men)?'?s? injury|workmen'?s? comp\w*)\b/i],
  ['construction_car', /\b(?:car|ear|contractors?'? all risks?|erection all risks?)\b/i],
  ['commercial_vehicle', /\b(?:motor|vehicles?|fleet|car plate|registration no\.?)\b/i],
  ['general_liability', /\b(?:public liability|general liability|cgl|products? liability|event liability|employer'?s'? liability)\b/i],
  ['professional_indemnity', /\b(?:professional indemnity|pii?)\b/i],
  ['do', /\b(?:d ?& ?o|directors'? (?:and|&) officers'?)\b/i],
  ['cyber', /\bcyber\b/i],
  ['iar_fire', /\b(?:fire|iar|industrial all risks?|property all risks?|business (?:package|insurance))\b/i],
  ['machinery_breakdown', /\bmachinery (?:all risks?|breakdown)\b/i],
  ['electronic_equipment', /\belectronic equipment\b/i],
  ['surety_bonds', /\b(?:performance|advance payment|security|tender|retention|foreign worker|maid) bonds?\b|\b(?:banker'?s|bank|insurance) guarantee\b/i],
  ['trade_credit', /\b(?:trade credit|credit insurance|credit limit|coface|atradius|allianz trade|euler hermes)\b/i],
  ['marine_cargo', /\b(?:marine cargo|cargo|open cover|marine)\b/i],
]

/** Product lines an email names, in LINE_WORDS order. */
export function linesNamed(text: string | null | undefined): string[] {
  const t = text ?? ''
  return LINE_WORDS.filter(([, re]) => re.test(t)).map(([l]) => l)
}

/** Whether a movement read from these words belongs on a policy of this line: unmarked words fit every policy touched. */
export function fitsLine(words: string | null | undefined, policyLine: string | null): boolean {
  const named = linesNamed(words).filter(l => deskFor(l) === deskFor(policyLine))
  if (!named.length || !policyLine) return true
  return named.includes(policyLine)
}
