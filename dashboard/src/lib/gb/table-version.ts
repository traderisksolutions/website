/**
 * Which rate card prices a quote. Pure; tested in src/__tests__/gb-table-version.test.ts.
 *
 * Insurers revise their package cards, and a card applies from one date for new business and
 * often a later one for renewals (QBE MCare+ V12, the 20 May 2026 card: new business from
 * 1 Jul 2026, renewals from 2 Sep 2026). Pricing a renewal on the newest card overstated QBE
 * renewals by 19–31% (reverse-engineering of TRS's quotes, 4 Nov 2026). Per insurer, the card
 * used is the latest one in force on the effective date for the basis; an undated card is used
 * only when no dated card is in force.
 */
export type CardRow = { id: string; insurer_id: string | null; insurer_name: string | null; effective_date: string | null; renewal_effective_date?: string | null }

export function cardsInForce<T extends CardRow>(all: T[], effectiveDate: string, basis: 'new_business' | 'renewal'): { cards: T[]; notes: string[] } {
  const by = new Map<string, T[]>()
  for (const t of all) { const k = t.insurer_id ?? `name:${t.insurer_name ?? ''}`; by.set(k, [...(by.get(k) ?? []), t]) }
  const cards: T[] = [], notes: string[] = []
  for (const group of by.values()) {
    const from = (t: T) => (basis === 'renewal' ? t.renewal_effective_date ?? t.effective_date : t.effective_date) ?? null
    const dated = group.filter(t => from(t) && from(t)! <= effectiveDate).sort((a, b) => from(b)!.localeCompare(from(a)!))
    const pick = dated[0] ?? group.find(t => !from(t)) ?? null
    if (pick) { cards.push(pick); continue }
    const next = group.map(from).filter(Boolean).sort()[0]
    notes.push(`${group[0].insurer_name ?? 'An insurer'}: no rate card in force on ${effectiveDate} for ${basis === 'renewal' ? 'renewals' : 'new business'} (earliest on file from ${next}); not priced`)
  }
  return { cards, notes }
}

/**
 * Package size limits by employee count, from the insurers' rules as TRS quotes them (mail,
 * Jun–Nov 2026): above them the insurer underwrites a custom quote, and the package card is not a
 * price. Matched on a fragment of the insurer's name.
 */
export const PACKAGE_LIMITS: { insurer: string; min?: number; max?: number; package: string }[] = [
  { insurer: 'qbe', max: 50, package: 'QBE MCare+' },
  { insurer: 'income', min: 2, max: 100, package: 'Income FlexCare' },
  { insurer: 'singapore life', max: 100, package: 'Singlife MyBenefits Plus' },
  { insurer: 'singlife', max: 100, package: 'Singlife MyBenefits Plus' },
  { insurer: 'cigna', min: 2, max: 9, package: 'Cigna Care Connect' },
]

/** Cards whose package takes this many employees, and a note for each one that does not. */
export function withinPackageLimits<T extends CardRow>(cards: T[], employees: number): { cards: T[]; notes: string[] } {
  const notes: string[] = []
  const kept = cards.filter(c => {
    const name = (c.insurer_name ?? '').toLowerCase()
    const lim = PACKAGE_LIMITS.find(l => name.includes(l.insurer))
    if (!lim) return true
    if (lim.max != null && employees > lim.max) { notes.push(`${lim.package}: ${employees} employees is above its ${lim.max}; the insurer quotes a custom rate instead`); return false }
    if (lim.min != null && employees < lim.min) { notes.push(`${lim.package}: needs at least ${lim.min} employees`); return false }
    return true
  })
  return { cards: kept, notes }
}
