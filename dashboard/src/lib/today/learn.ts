/**
 * Today's learning loop (19 Nov 2026), after the memory → skill → refine loop of open-source agents,
 * but every step is code and no model is called. Each add records what was true of the thread
 * (its signals); each dismissed suggestion, and each thread removed within a week of being added,
 * counts against its signals. A signal's hit rate is adds over adds plus misses, per person. A
 * thread is suggested when one of its signals has five or more cases and hits 60% or more. One seed
 * rule works from day one: a new thread from a client already on the list. Pure.
 */

export type ThreadFacts = { onList: boolean; knownClient: boolean; senderKind: 'client' | 'insurer' | null; category: string | null }
export type Stat = { yes: number; no: number }
export type Best = { signal: string; rate: number; yes: number; n: number; seeded: boolean }

const MIN_CASES = 5
const SUGGEST_AT = 0.6
/** Priors used until a signal has MIN_CASES of its own. */
const SEED: Readonly<Record<string, number>> = { on_list: 0.8 }
const QUICK_REMOVE_DAYS = 7

export function signalsOf(f: ThreadFacts): string[] {
  const out: string[] = []
  if (f.onList) out.push('on_list')
  else if (f.knownClient) out.push('known_client')
  if (f.senderKind) out.push(`from:${f.senderKind}`)
  if (f.category) out.push(`cat:${f.category.toLowerCase()}`)
  return out
}

function signalLabel(s: string): string {
  if (s === 'on_list') return 'Client on your list'
  if (s === 'known_client') return 'Client you added before'
  if (s === 'from:insurer') return 'From an insurer'
  if (s === 'from:client') return 'From a client'
  if (s.startsWith('cat:')) { const c = s.slice(4).replace(/_/g, ' '); return `${c.charAt(0).toUpperCase()}${c.slice(1)} thread` }
  return s
}

/** Positives are the signal sets of threads added and kept; negatives, of dismissals and quick removes. */
export function learn(positives: readonly (readonly string[])[], negatives: readonly (readonly string[])[]): Map<string, Stat> {
  const stats = new Map<string, Stat>()
  const bump = (s: string, k: keyof Stat) => { const st = stats.get(s) ?? { yes: 0, no: 0 }; st[k] += 1; stats.set(s, st) }
  for (const set of positives) for (const s of new Set(set)) bump(s, 'yes')
  for (const set of negatives) for (const s of new Set(set)) bump(s, 'no')
  return stats
}

/** A list row as history: kept means positive; removed within QUICK_REMOVE_DAYS of adding means negative. */
export function splitHistory(rows: readonly { signals: readonly string[] | null; added_at: string; removed_at: string | null }[]): { positives: string[][]; negatives: string[][] } {
  const positives: string[][] = [], negatives: string[][] = []
  for (const r of rows) {
    const sig = [...(r.signals ?? [])]
    if (!sig.length) continue
    const quick = r.removed_at && Date.parse(r.removed_at) - Date.parse(r.added_at) < QUICK_REMOVE_DAYS * 86_400_000
    ;(quick ? negatives : positives).push(sig)
  }
  return { positives, negatives }
}

/** The strongest signal of a thread, or null when none reaches SUGGEST_AT. */
export function score(signals: readonly string[], stats: ReadonlyMap<string, Stat>): Best | null {
  let best: Best | null = null
  for (const s of signals) {
    const st = stats.get(s) ?? { yes: 0, no: 0 }
    const n = st.yes + st.no
    const own = n >= MIN_CASES
    if (!own && SEED[s] === undefined) continue
    const rate = own ? st.yes / n : SEED[s]
    if (!best || rate > best.rate) best = { signal: s, rate, yes: st.yes, n, seeded: !own }
  }
  return best && best.rate >= SUGGEST_AT ? best : null
}

export function reasonOf(b: Best): string {
  return b.seeded ? `${signalLabel(b.signal)} · new thread` : `${signalLabel(b.signal)} · added ${b.yes} of ${b.n}`
}
