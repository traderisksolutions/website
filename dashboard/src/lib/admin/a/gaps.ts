/**
 * What a case opened from a forward or from quoted history is missing. Pure.
 */
import type { HistoryMessage } from './history'
import type { Gap } from './handoffs'

const norm = (f: string) => f.toLowerCase().replace(/\s+/g, ' ').trim()

export function gapsFor(rebuilt: HistoryMessage[], heldFiles: string[], opts: { refFound: boolean; claimLike: boolean }): Gap[] {
  const held = new Set(heldFiles.map(norm))
  const gaps: Gap[] = []
  const seen = new Set<string>()
  for (const m of rebuilt) {
    const who = m.fromName ?? m.fromAddress ?? 'an earlier message'
    const when = m.sentAtText ? ` on ${m.sentAtText}` : ''
    for (const f of m.attachmentsNamed) {
      if (held.has(norm(f)) || seen.has(norm(f))) continue
      seen.add(norm(f))
      gaps.push({ item: f, basis: `named in ${who}'s message${when}; TRS does not hold the file` })
    }
    if (!m.sentAt) gaps.push({ item: `Date of ${who}'s message`, basis: m.sentAtText ? `written as "${m.sentAtText}"` : 'no date line in the quoted text' })
  }
  if (!opts.refFound) gaps.push({ item: opts.claimLike ? 'Policy or claim number' : 'Policy number', basis: 'not found in the mail' })
  return gaps
}

/** Outside people on rebuilt messages that did not copy TRS — they should be copied from now on. */
export function leftOffTrs(rebuilt: HistoryMessage[], isInternal: (e: string) => boolean): string[] {
  const out = new Set<string>()
  for (const m of rebuilt) {
    const all = [m.fromAddress, ...m.to, ...m.cc].filter((x): x is string => !!x)
    if (all.some(isInternal)) continue
    for (const a of all) if (!isInternal(a)) out.add(a)
  }
  return Array.from(out)
}
