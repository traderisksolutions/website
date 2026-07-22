/**
 * Pricing Matrix — the CELL-MAP PROFILE.
 *
 * This is the one thing we capture per insurer workbook. It tells the engine (pm_run.py)
 * which cells to WRITE the census into and which cells to READ premiums/totals from, so we
 * can drive the insurer's own Excel formula graph without re-deriving any pricing. AI
 * proposes it from a workbook dump; a human confirms/edits it before the calculator goes live.
 *
 * Column references are spreadsheet COLUMN LETTERS (e.g. "E"); the engine combines them with a
 * per-life ROW from `rows`. Total/global references are ABSOLUTE cells (e.g. "Z118").
 */

/** A single per-life input field mapped to a column on the data sheet. */
export type MemberInputs = {
  name?: string                 // column letter, e.g. "C"
  category?: string             // Employee / Dependent (drives some formulas)
  date_of_birth?: string        // date column — engine converts to Excel serial
  policy_effective_date?: string
  policy_expiry_date?: string
  relationship?: string         // Self / Spouse / Child
  occupation_class?: string     // if it's a per-life (not per-coverage) input
}

/** One coverage line (product) the workbook prices, with its plan-selection inputs + output. */
export type CoverageLine = {
  code: string                  // stable slug, e.g. "HS", "OPGP"
  label: string                 // display, e.g. "Hospital & Surgical"
  inputs: Record<string, string> // field -> column letter, e.g. { plan:"J", hospital:"K", beds:"L", coinsurance:"M" }
  output: string                // premium column letter for this line, e.g. "N"
}

export type CellMapProfile = {
  sheet: string                 // the sheet to drive, e.g. "Calculator"
  rows: { start: number; end: number } // per-life data rows (one member per row)

  member_inputs: MemberInputs
  coverage_lines: CoverageLine[]

  /** Single-cell inputs that apply to the whole quote (not per-life), field -> absolute cell. */
  globals?: Record<string, string> // e.g. { quote_basis: "F5", effective_date: "F4" }

  /** Output totals — absolute cells. by_line keyed by coverage `code`. */
  totals: {
    by_line?: Record<string, string> // { HS:"N116", OPGP:"Q116", ... }
    grand?: string                    // grand total annual premium, e.g. "Z118"
  }

  /** Some workbooks don't expose per-coverage-line premium outputs on the driving sheet — only a
   *  single PER-LIFE TOTAL column (e.g. Income's Step-1 col "Y"). When set, the engine reads this
   *  column as each member's total; the grand total is summed across members if `totals.grand` is
   *  unmapped. Coverage lines are still used for their INPUTS (plan selections). */
  per_life_total?: string             // column letter on `sheet`, e.g. "Y"

  /** Dropdown domains discovered from data-validations, for the review UI + census dropdowns.
   *  Keyed by "field" for member inputs or "CODE.field" for coverage inputs. */
  dropdowns?: Record<string, string[]>

  /** Whether date inputs must be written as Excel serial numbers (almost always true). */
  date_serial?: boolean

  /** Fields the engine could not map / a human left blank — surfaced in the review UI. */
  unmapped?: string[]

  /** Free-text notes the workbook carries (business rules), kept for context/recommendation. */
  notes_text?: string
}

/** Empty profile scaffold. */
export const EMPTY_PROFILE: CellMapProfile = {
  sheet: '',
  rows: { start: 0, end: 0 },
  member_inputs: {},
  coverage_lines: [],
  totals: {},
  date_serial: true,
}

/** Minimal validity check used to gate "run verification" / "approve".
 *  A profile is runnable when each coverage line has inputs AND premiums are readable — either via
 *  a per-life-total column OR a per-line output on every coverage line. */
export function profileIsRunnable(p: CellMapProfile | null | undefined): boolean {
  if (!p || !p.sheet) return false
  if (!p.rows || !(p.rows.end >= p.rows.start && p.rows.start > 0)) return false
  if (!p.member_inputs?.date_of_birth) return false
  if (!Array.isArray(p.coverage_lines) || p.coverage_lines.length === 0) return false
  const inputsOk = p.coverage_lines.every(l => l.code && l.inputs && Object.keys(l.inputs).length > 0)
  if (!inputsOk) return false
  return !!p.per_life_total || p.coverage_lines.every(l => l.output)
}
