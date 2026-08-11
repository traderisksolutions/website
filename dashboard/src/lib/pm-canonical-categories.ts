/**
 * Pricing Matrix — fixed canonical benefit-category taxonomy.
 *
 * Coverage `code`/`full_name` (pm-rates.ts) and benefit-term `category`/`label`
 * (pm-benefits-extract.ts) are extracted verbatim per insurer, so the SAME benefit shows up under
 * different wording across insurers (e.g. "Group Outpatient Clinical" / "Group Outpatient Primary
 * Care" / "Group Outpatient Clinical (GP Outpatient)"), which broke the comparison table's
 * exact-label alignment (alignLines in pm-quote.ts, coverageForCategory in pm-compare.ts).
 *
 * `canonical_category` is a NEW sibling field (never replaces code/full_name, which stay the
 * stable identifiers saved quotes reference) classifying each coverage/term into ONE of this
 * fixed list — a deliberate closed set rather than an AI-grown vocabulary, so alignment is
 * consistent by construction. "Other" is the escape hatch for anything that doesn't fit: it never
 * merges with anything (same as today's unclassified behavior), so a genuinely novel benefit type
 * is never force-fit into the wrong bucket. Extend this list (a plain edit, no migration) if a new
 * insurer introduces a benefit type that doesn't fit — jsonb columns already store whatever string
 * is written, so widening the list is backward compatible with everything already classified.
 */
export const PM_CANONICAL_CATEGORIES = [
  'Hospital & Surgical',
  'Hospital Income/Cash',
  'Term Life',
  'Critical Illness',
  'Personal Accident',
  'Outpatient GP',
  'Outpatient Specialist',
  'Outpatient Diagnostic',
  'Dental',
  'Optical',
  'Maternity',
  'Employee Assistance Program',
  'Major Medical',
  'Disability Income',
  'Travel',
  'Other',
] as const

export type PmCanonicalCategory = typeof PM_CANONICAL_CATEGORIES[number]

export const PM_CANONICAL_CATEGORIES_PROMPT_LIST = PM_CANONICAL_CATEGORIES.join(', ')
