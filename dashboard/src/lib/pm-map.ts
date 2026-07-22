/**
 * Pricing Matrix — AI proposal of a cell-map profile from a workbook dump.
 *
 * Opus reads the mechanical dump (sheets, dropdown validations, top-rows preview, formula
 * samples, SUM cells, total hints) produced by /api/pm_dump and proposes a CellMapProfile:
 * which sheet + rows are the census, which columns are member inputs, which columns are each
 * coverage line's plan-selection inputs and premium output, and which cells hold the totals.
 *
 * The model NEVER invents a rate — it only maps cells. A human confirms/edits the result in
 * the review UI before the calculator can be verified + approved.
 */
import { logAiUsage } from '@/lib/gemini-usage'
import type { CellMapProfile } from '@/lib/pm-profile'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const OPUS = 'claude-opus-4-8'

// Shape of the dump returned by /api/pm_dump (kept loose — we forward it verbatim to the model).
export type WorkbookDump = {
  sheets: { name: string; state: string; visible: boolean; max_row: number; max_col: number }[]
  validations: Record<string, { range: string; type: string; options: string[] | null; formula1: string | null }[]>
  previews: Record<string, {
    top_rows: { row: number; cells: Record<string, string> }[]
    formula_samples: { cell: string; formula: string }[]
    sum_cells: { cell: string; formula: string }[]
    total_hints: { label_cell: string; label: string; value_cell: string; formula: string | null }[]
  }>
  notes_text?: string
}

const SYSTEM = `You map an insurer's Excel group-insurance CALCULATOR to a JSON cell-map so a
program can drive the real workbook (write a census into input cells, read premiums back). You
ONLY identify cell locations from the structural dump — you never invent rates or numbers.

Return ONLY a JSON object of this exact shape (no prose, no markdown fence):
{
  "sheet": "<the visible data/calculator sheet to drive — NOT a rate 'Table' sheet>",
  "rows": { "start": <first census data row number>, "end": <last census data row number> },
  "member_inputs": {
    "name": "<col letter or omit>", "category": "<col>", "date_of_birth": "<col>",
    "policy_effective_date": "<col>", "policy_expiry_date": "<col>", "relationship": "<col>",
    "occupation_class": "<col if it is a per-life column>"
  },
  "coverage_lines": [
    { "code": "<STABLE_SLUG e.g. HS/OPGP/SPEC/DENTAL/PA>", "label": "<human label>",
      "inputs": { "<field>": "<col letter>", ... }, "output": "<premium col letter>" }
  ],
  "totals": { "by_line": { "<code>": "<absolute total cell>", ... }, "grand": "<grand-total cell>" },
  "globals": { "<field>": "<absolute cell>" },
  "date_serial": true,
  "unmapped": [ "<anything you could not confidently map>" ]
}

Rules:
- The data sheet has one census row per life. Input columns are BLANK (often with a dropdown
  validation); computed columns contain formulas (age via DATEDIF, premiums via INDEX/MATCH).
- rows.start = the first row that has the per-row formulas; rows.end = the last (match the SUM
  ranges, e.g. SUM(N16:N115) => end 115).
- Each coverage line groups a set of input columns (plan/hospital/beds/coinsurance/panel/
  occupation_class/copayment) and ONE premium output column (the formula column labelled
  'Premium'). Use the group headers (e.g. 'Hospital and Surgical') for labels.
- totals.by_line maps each coverage code to its SUM cell (match the SUM column to the line's
  output column). totals.grand = the cell that sums the line totals (see total_hints).
- Only include member_inputs / globals fields that truly exist. Put uncertainties in "unmapped".`

function extractJson(text: string): CellMapProfile | null {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const s = t.indexOf('{'); const e = t.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try { return JSON.parse(t.slice(s, e + 1)) as CellMapProfile } catch { return null }
}

/** Build the dropdowns map (field -> options) from the workbook validations + proposed profile. */
export function dropdownsFromDump(profile: CellMapProfile, dump: WorkbookDump): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const vals = dump.validations?.[profile.sheet] ?? []
  // Map a column letter -> options (a validation range like "M16:M115 S16:S115" covers 2 cols).
  const colOptions: Record<string, string[]> = {}
  for (const dv of vals) {
    if (dv.type !== 'list' || !dv.options?.length) continue
    for (const part of dv.range.split(/\s+/)) {
      const m = part.match(/^\$?([A-Z]+)\$?\d+/)
      if (m) colOptions[m[1]] = dv.options
    }
  }
  const mi = profile.member_inputs ?? {}
  for (const [field, col] of Object.entries(mi)) {
    if (col && colOptions[col]) out[field] = colOptions[col]
  }
  for (const line of profile.coverage_lines ?? []) {
    for (const [field, col] of Object.entries(line.inputs ?? {})) {
      if (col && colOptions[col]) out[`${line.code}.${field}`] = colOptions[col]
    }
  }
  return out
}

export async function proposeProfile(dump: WorkbookDump): Promise<{ profile: CellMapProfile | null; raw: string; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { profile: null, raw: '', error: 'ANTHROPIC_API_KEY not set' }
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPUS, max_tokens: 8000, thinking: { type: 'adaptive' }, system: SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Workbook dump:\n' + JSON.stringify(dump) }] }],
      }),
    })
    const j = await res.json()
    if (!res.ok) return { profile: null, raw: '', error: `Anthropic ${res.status}: ${JSON.stringify(j).slice(0, 200)}` }
    void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'pm_map_propose', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: { pm: 'map_propose' } })
    const text = (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n')
    const profile = extractJson(text)
    if (!profile) return { profile: null, raw: text, error: 'Could not parse a profile from the model output' }
    // Attach discovered dropdown domains + notes for the UI.
    profile.dropdowns = dropdownsFromDump(profile, dump)
    if (dump.notes_text) profile.notes_text = dump.notes_text
    if (profile.date_serial === undefined) profile.date_serial = true
    return { profile, raw: text }
  } catch (e) {
    return { profile: null, raw: '', error: String(e) }
  }
}
