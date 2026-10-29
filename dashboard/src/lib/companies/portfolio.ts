/**
 * A company is rarely in one state: it can hold three policies in force, have one renewal due and
 * be quoting a new line at the same time. The header shows that mix, counted from the policies,
 * beside the relationship stage a broker sets by hand. Pure.
 */
export type PortfolioTone = 'green' | 'blue' | 'amber' | 'red' | 'neutral'
export type PortfolioCount = { key: string; label: string; count: number; tone: PortfolioTone }

const ORDER: { key: string; lifecycles: string[]; label: string; tone: PortfolioTone }[] = [
  { key: 'in_force',    lifecycles: ['live'],                  label: 'in force',     tone: 'green' },
  { key: 'bound',       lifecycles: ['bound'],                 label: 'bound',        tone: 'green' },
  { key: 'quoting',     lifecycles: ['quoting', 'presented'],  label: 'quoting',      tone: 'blue' },
  { key: 'renewal_due', lifecycles: ['renewal_due'],           label: 'renewal due',  tone: 'amber' },
  { key: 'lapsed',      lifecycles: ['lapsed'],                label: 'lapsed',       tone: 'red' },
]

export function portfolio(policies: { lifecycle: string }[]): PortfolioCount[] {
  return ORDER
    .map(o => ({ key: o.key, label: o.label, tone: o.tone, count: policies.filter(p => o.lifecycles.includes(p.lifecycle)).length }))
    .filter(c => c.count > 0)
}
