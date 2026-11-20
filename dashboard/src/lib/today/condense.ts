/**
 * Condense (20 Nov 2026): where a client or a project stands, as labelled facts, never prose.
 * Client asked (date, what), TRS promised (date, what), Owed by each party (who, what, since),
 * Next step (what, by when). A model reads the threads (desk-read.ts, on a person's button); code
 * keeps a fact only when every date and every figure in it appears in the text the model read.
 * The result is kept with the threads' state, so it is shown again on load and re-run only when
 * a person asks. Pure and browser-safe. Tested in condense.test.ts.
 */

export type FactLabel = 'Client asked' | 'TRS promised' | 'Owed' | 'Next step'
export type Fact = { label: FactLabel; what: string; date: string | null; party: string | null }
export type Condensed = { at: string; by: string; state: string; project: string | null; facts: Fact[] }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Whether a date (YYYY-MM-DD) is written in the text: ISO, d/m/y, "28 Oct", "Oct 28", "28th October". */
export function dateFound(iso: string, text: string): boolean {
  if (!ISO.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  if (!m || m > 12 || !d || d > 31) return false
  const t = text.toLowerCase().replace(/\s+/g, ' ')
  if (t.includes(iso)) return true
  const yy = String(y).slice(2)
  const dd = `0?${d}`, mm = `0?${m}`
  const mon = MONTHS[m - 1], short = mon.slice(0, 3)
  const month = `(?:${mon}|${short}${mon === 'september' ? '|sept' : ''})\\.?`
  const res = [
    new RegExp(`\\b${dd}[/.-]${mm}[/.-](?:${y}|${yy})\\b`),
    new RegExp(`\\b${dd}(?:st|nd|rd|th)?[\\s-]+${month}\\b`),
    new RegExp(`\\b${month}\\s+${dd}(?:st|nd|rd|th)?\\b`),
  ]
  return res.some(r => r.test(t))
}

const numberOf = (s: string) => s.replace(/,/g, '').replace(/\.0+$/, '').replace(/^0+(?=\d)/, '')

/** Every figure in a text, as plain digits ("17,120.00" → "17120"). */
export function figures(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(numberOf).filter(Boolean)
}

/** Whether every figure in `what` appears in the source text. */
export function figuresFound(what: string, source: string | ReadonlySet<string>): boolean {
  const have = typeof source === 'string' ? new Set(figures(source)) : source
  return figures(what).every(f => have.has(f))
}

const clean = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/[.;]+$/, '').slice(0, n)
const dateOf = (v: unknown) => { const s = String(v ?? '').trim().slice(0, 10); return ISO.test(s) ? s : null }

type RawItem = { date?: unknown; since?: unknown; by?: unknown; what?: unknown; party?: unknown }

/**
 * The model's facts made safe: known keys only, short lines, at most four per label. A fact whose
 * date, or any figure in its words, is not in the source text is dropped. A date the model gave
 * that is not a date is dropped with its fact.
 */
export function checkFacts(raw: unknown, source: string): Fact[] {
  const r = (raw ?? {}) as Record<string, unknown>
  const have = new Set(figures(source))
  const out: Fact[] = []
  const take = (key: string, label: FactLabel, dateKey: 'date' | 'since' | 'by', withParty: boolean) => {
    const list = Array.isArray(r[key]) ? (r[key] as RawItem[]) : []
    let n = 0
    for (const it of list) {
      if (n >= 4) break
      const what = clean(it?.what, 140)
      if (!what) continue
      const given = it?.[dateKey]
      const date = given == null || given === '' ? null : dateOf(given)
      if (given != null && given !== '' && !date) continue
      if (date && !dateFound(date, source)) continue
      if (!figuresFound(what, have)) continue
      const party = withParty ? clean(it?.party, 60) || null : null
      if (withParty && !party) continue
      out.push({ label, what, date, party })
      n++
    }
  }
  take('client_asked', 'Client asked', 'date', false)
  take('trs_promised', 'TRS promised', 'date', false)
  take('owed', 'Owed', 'since', true)
  take('next', 'Next step', 'by', false)
  return out
}

/** The threads' state a condensed result was made from: each thread with its last message time. */
export function threadState(threads: readonly { threadId: string; lastAt: string | null }[]): string {
  const s = threads.map(t => `${t.threadId}:${t.lastAt ?? ''}`).sort().join('|')
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return `${threads.length}-${h.toString(36)}`
}

/** The app_settings key a condensed result is kept under: the row, and the project when one. */
export const condenseKey = (rowKey: string, project: string | null) => `today_condense:${rowKey}|${(project ?? '').toLowerCase()}`
