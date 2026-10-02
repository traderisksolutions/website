/**
 * TRS's own names for covers and benefit lines.
 *
 * Insurers name the same cover differently — "GHS+EMM", "Hospital & Surgical", "Group Hospital
 * and Surgical (GHS)" — and the canon (canon.ts) holds one neutral name for each. The broker sets
 * the name TRS uses in front of clients; it is stored in app_settings under one key, as a map from
 * canonical code to name, and read wherever a cover or benefit line is named to a client.
 * A code with no name set shows the canonical one.
 */
export const COVER_NAMES_KEY = 'gb_cover_names'
export type CoverNames = Record<string, string>

export function nameOf(code: string, names: CoverNames | null | undefined, fallback: string): string {
  const n = names?.[code]?.trim()
  return n || fallback
}

/** Keep only short, non-empty names for codes that exist. */
export function cleanNames(raw: unknown, known: Set<string>): CoverNames {
  const out: CoverNames = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(k) || typeof v !== 'string') continue
    const t = v.replace(/\s+/g, ' ').trim().slice(0, 80)
    if (t) out[k] = t
  }
  return out
}
