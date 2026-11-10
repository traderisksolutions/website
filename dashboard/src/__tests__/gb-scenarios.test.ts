/**
 * Scenarios A, B, C from a thread brief, and the brief's deterministic edges. No model, no I/O.
 * The Gembridge case: renewal, QBE private 1-bed top, GP $0, specialist and dental, PA S$200k;
 * the client asked for dental to S$1,000–1,500 and told the broker to remove AIA (thread, Jul–Aug 2026).
 */
import { describe, expect, it } from 'vitest'
import { baseRequirement, enhanced, flagInsurers, headline, lowerCost, requirementSummary, scenariosFor, type Brief, type PricedInsurer } from '@/lib/gb/scenarios'
import { normaliseBrief } from '@/lib/gb/brief'

const gembridge: Brief = {
  company: 'Gembridge Capital Management', basis: 'renewal', currentInsurer: 'QBE',
  current: { ward: 'P1', wardLevel: 'top', gp: 'nil', sp: 'top', dental: 'top', pa: 200_000, deps: 'medical' },
  currentPlanText: 'GHS Plan 1 private 1-bed 0% co · GP Plan 1 · SP Plan 2 · Dental Plan 2 panel · PA Plan 2 class 1',
  expiringPremium: null, budget: null, budgetText: null, budgetNetOfGst: null,
  mustHaves: ['ward'], wishes: [{ cover: 'GD', change: 'up', detail: '$1,000–1,500', sum: null }, { cover: 'other', change: 'add', detail: 'health screening for dependants', sum: null }],
  optional: [], excludeInsurers: ['AIA'], preferInsurers: ['Income'], renewalDate: '2026-10-24', effectiveDate: null,
  decisions: ['Client: remove AIA, add Cigna Care Connect 2.0'], open: ['Dental limit S$1,000 or S$1,500'],
}

describe('scenariosFor', () => {
  it('A is the current plan; B steps every tier down; C applies the wishes', () => {
    const [a, b, c] = scenariosFor(gembridge)
    expect(a.name).toBe('Like for like')
    expect(a.requirement).toMatchObject({ ward: 'P1', wardLevel: 'top', gp: 'nil', sp: 'top', dental: 'top', pa: 200_000, deps: 'medical', gmm: false })
    expect(b.requirement).toMatchObject({ ward: 'P1', wardLevel: 'entry', sp: 'entry', dental: 'entry', pa: 200_000 })
    expect(b.changes).toEqual(['Hospital limit at the entry tier', 'Specialist at the entry tier', 'Dental at the entry tier'])
    // Dental is already top: the wish leaves it, and C must still differ from A somewhere the thread allows.
    expect(c.requirement.dental).toBe('top')
    expect(c.changes.length).toBeGreaterThan(0)
    expect(a.summary).toBe('Private 1-bed top limit · GP $0 · specialist top · dental top · PA S$200k · dependants medical')
  })

  it('new business with a budget: A as briefed, B drops the optional covers, C steps up', () => {
    const aureus: Brief = { ...gembridge, basis: 'new_business', currentInsurer: null, currentPlanText: null,
      current: { ward: 'P1', wardLevel: 'entry', gmm: true, gp: 'nil', sp: 'entry', dental: 'entry', deps: 'medical' },
      budget: 20_000, budgetText: 'MAX annual budget of S$20,000 excluding GST', budgetNetOfGst: true,
      mustHaves: ['ward'], wishes: [], optional: ['GD'], excludeInsurers: [], preferInsurers: [], decisions: [], open: [] }
    const [a, b, c] = scenariosFor(aureus)
    expect(a.name).toBe('As briefed')
    expect(b.requirement).toMatchObject({ ward: 'P1', dental: null, gmm: false })
    expect(b.changes[0]).toBe('Dental off (optional in the brief)')
    expect(c.requirement).toMatchObject({ ward: 'P1', wardLevel: 'top', gmm: true, sp: 'top', dental: 'top' })
  })

  it('a ward that is a must-have never steps down; one that is not steps down when nothing else can', () => {
    const flat: Brief = { ...gembridge, current: { ward: 'G1', wardLevel: 'entry', gp: 'nil', sp: 'entry', dental: null, pa: 150_000, gtl: 100_000, deps: 'none' }, wishes: [], mustHaves: [] }
    expect(lowerCost(baseRequirement(flat), flat).requirement.ward).toBe('G4')
    expect(lowerCost(baseRequirement({ ...flat, mustHaves: ['ward'] }), { ...flat, mustHaves: ['ward'] }).requirement.ward).toBe('G1')
  })

  it('a wish to add a cover adds it at the entry tier; a sum wish takes the sum', () => {
    const b: Brief = { ...gembridge, current: { ward: 'G1', wardLevel: 'entry', gp: 'nil', sp: 'entry', deps: 'none' }, wishes: [{ cover: 'GD', change: 'add', detail: null, sum: null }, { cover: 'GTL', change: 'add', detail: null, sum: 150_000 }] }
    const c = enhanced(baseRequirement(b), b)
    expect(c.requirement.dental).toBe('entry')
    expect(c.requirement.gtl).toBe(150_000)
    expect(c.changes).toEqual(['Dental added', 'Term life S$150k added'])
  })
})

describe('flagInsurers', () => {
  const priced: PricedInsurer[] = [
    { rate_table_id: 'qbe12', insurer_name: 'QBE Insurance (Singapore) Pte Ltd', insurer: 'qbe', net: 47_933, gst: 4_314, total: 52_247, missing: 0, by_product: {} },
    { rate_table_id: 'qbe11', insurer_name: 'QBE Insurance (Singapore) Pte Ltd', insurer: 'qbe', net: 30_664, gst: 2_760, total: 33_424, missing: 0, by_product: {} },
    { rate_table_id: 'aia', insurer_name: 'AIA Singapore', insurer: 'aia', net: 38_209, gst: 3_439, total: 41_648, missing: 1, by_product: {} },
    { rate_table_id: 'sl', insurer_name: 'Singapore Life Ltd.', insurer: 'singlife', net: 27_702, gst: 2_493, total: 30_195, missing: 0, by_product: {} },
    { rate_table_id: 'inc', insurer_name: 'Income Insurance Limited', insurer: 'income', net: 28_550, gst: 2_569, total: 31_119, missing: 0, by_product: {} },
  ]
  it('marks the card in force, the client’s exclusions and preferences, and the budget footing', () => {
    const out = flagInsurers(priced, { ...gembridge, budget: 30_000, budgetNetOfGst: true }, new Set(['qbe12', 'aia', 'sl', 'inc']))
    const by = Object.fromEntries(out.map(i => [i.rate_table_id, i]))
    expect(by.qbe11.inForce).toBe(false)
    expect(by.qbe12.current).toBe(true)
    expect(by.aia.excluded).toBe(true)
    expect(by.inc.preferred).toBe(true)
    expect(by.sl.withinBudget).toBe(true)
    expect(by.inc.withinBudget).toBe(true)
    expect(by.qbe12.withinBudget).toBe(false)
    // In-force rows first, then by total.
    expect(out.map(i => i.rate_table_id)).toEqual(['sl', 'inc', 'aia', 'qbe12', 'qbe11'])
    // The headline skips the excluded insurer and the card not in force.
    expect(headline(out)?.rate_table_id).toBe('sl')
  })
  it('a budget stated with GST is compared with the total', () => {
    const out = flagInsurers(priced, { ...gembridge, budget: 31_000, budgetNetOfGst: false }, new Set(['sl', 'inc']))
    expect(out.find(i => i.rate_table_id === 'sl')?.withinBudget).toBe(true)
    expect(out.find(i => i.rate_table_id === 'inc')?.withinBudget).toBe(false)
  })
})

describe('normaliseBrief', () => {
  it('reads the structured plan, parses the written plan for a ward the model left out, and bounds sums', () => {
    const b = normaliseBrief({
      company: 'Acme', basis: 'renewal', current_insurer: 'QBE',
      current_plan: { hospital: null, ward: null, limit_tier: 'top', gp: 'nil', specialist: 'entry', dental: 'none', pa_sum: 200000, gtl_sum: 99_000_000, dependants: 'medical', as_written: 'Private 1-bedded, $300k annual limit' },
      budget: { amount: 1500, per: 'employee_year', net_of_gst: true, as_written: '$1,500 per head' },
      must_haves: ['ward', 'bogus'], wishes: [{ cover: 'GD', change: 'up', detail: '$1,000' }, { cover: 'XX', change: 'up' }],
      exclude_insurers: ['AIA'], renewal_date: '24/10/2026', decisions: ['Client: remove AIA'],
    }, 6)
    expect(b.current).toEqual({ ward: 'P1', wardLevel: 'top', gp: 'nil', sp: 'entry', dental: null, pa: 200_000, deps: 'medical' })
    expect(b.budget).toBe(9_000)
    expect(b.budgetNetOfGst).toBe(true)
    expect(b.mustHaves).toEqual(['ward'])
    expect(b.wishes).toEqual([{ cover: 'GD', change: 'up', detail: '$1,000', sum: null }])
    expect(b.renewalDate).toBe('2026-10-24')
    expect(b.excludeInsurers).toEqual(['AIA'])
  })
  it('government ward from the written plan, and a per-employee budget with no census stays null', () => {
    const b = normaliseBrief({ current_plan: { as_written: '4-bed GRH, GP without co-payment' }, budget: { amount: 100, per: 'employee_month', as_written: '$100 pm' } }, 0)
    expect(b.current.ward).toBe('G4')
    expect(b.current.gp).toBe('nil')
    expect(b.budget).toBeNull()
    expect(b.basis).toBe('new_business')
  })
  it('summary reads the way a broker says it', () => {
    expect(requirementSummary({ ward: 'G1', wardLevel: 'entry', gmm: false, gp: 'nil', sp: 'entry', dental: null, pa: 150_000, gtl: 100_000, gci: null, deps: 'none' }))
      .toBe('Government 1-bed entry limit · GP $0 · specialist entry · PA S$150k · life S$100k · employees only')
  })
})
