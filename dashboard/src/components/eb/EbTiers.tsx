'use client'

/**
 * Step 2 · Options for the client: two cards, Same tier and Lower tier (Jarod's approved design,
 * 20 Nov 2026). Choosing one sets every pick in Compare (copies keep theirs). The rows state the
 * matching rule (compare-cover.ts: sameTier, lowerTierOf) and what it found.
 */
import { ChoiceCard } from '@/components/ui/choice-card'
import { TIERS, type Priced } from '@/lib/gb/eb-quote'
import type { Tier } from '@/lib/gb/eb-compare'

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]

export function EbTiers({ priced, tier, onTier, lastYearRead }: { priced: Priced; tier: Tier; onTier: (t: Tier) => void; lastYearRead: boolean }) {
  const cats = priced.categories
  const ward = uniq(cats.map(c => c.today.words.hs)).join(' · ') || 'Not on the census'
  const gp = uniq(cats.map(c => c.today.words.gp)).join(' · ')
  const noSame = priced.products.filter(p => cats.some(c => TIERS.some(t => c.products[p]?.[t.key]?.same.reason === 'no same plan')))
  const lower = priced.products.filter(p => cats.some(c => TIERS.some(t => c.products[p]?.[t.key]?.lower.reason === 'lower')))
  const n = priced.products.length
  const short = (p: string) => p.split(' ')[0]
  const rows: Record<Tier, [string, string][]> = {
    same: [
      ['Starting point', lastYearRead ? 'Current cover from last year’s policy, as read' : 'Current cover from the census until last year’s policy is read'],
      ['Hospital', `${ward} · same ward at every insurer`],
      ['Limit', 'Same amount and basis; if none, the next lower'],
      ['GP', `${gp ? `${gp}, as today` : 'As today'}; inside specialist at Singlife and AIA`],
      ['Specialist · Dental', 'Same limit where offered; else the next lower'],
      ['Major Medical', 'RCC and Singlife on the same plan as hospital; Income, Steadfast and AIA inside the hospital premium'],
      ['Insurers matched', `${n - noSame.length} of ${n} on the same plan for every cover${noSame.length ? ` · no same plan at ${noSame.map(short).join(', ')}` : ''}`],
    ],
    lower: [
      ['Starting point', 'Same tier, then one plan lower per cover'],
      ['Hospital', 'Lower limit in the same ward; else the next ward down'],
      ['Limit', 'Next lower limit; basis kept where offered'],
      ['GP', 'Next co-pay up'],
      ['Specialist · Dental', 'Next lower limit'],
      ['Major Medical', 'Kept with the hospital plan'],
      ['Insurers matched', `${lower.length} of ${n} one plan lower · change any cover below`],
    ],
  }
  const card = (t: Tier, title: string, line: string) => (
    <ChoiceCard pressed={tier === t} onClick={() => onTier(t)} title={title} line={line}>
      <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
        {rows[t].map(([k, v]) => [<dt key={`${k}t`} className="text-trs-muted">{k}</dt>, <dd key={`${k}d`} className="m-0">{v}</dd>])}
      </dl>
    </ChoiceCard>
  )
  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
      {card('same', 'Same tier', 'Each insurer’s plan matching current cover')}
      {card('lower', 'Lower tier', 'One step down per cover, to lower the premium')}
    </div>
  )
}
