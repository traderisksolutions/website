/**
 * The client email after pricing: facts from the pack, the suggestion rules, the code draft, and
 * the guard that keeps a tone rewrite only when every figure survives. No model, no I/O.
 */
import { describe, expect, it } from 'vitest'
import { clientFacts, codeDraft, keepsFigures, suggestionLines, reportOptions } from '@/lib/gb/client-draft'
import type { ScenarioPack } from '@/lib/gb/scenario-run'
import type { ScenarioInsurer } from '@/lib/gb/scenarios'

const ins = (insurer: ScenarioInsurer['insurer'], name: string, total: number, missing = 0, current = false, inForce = true): ScenarioInsurer =>
  ({ rate_table_id: `${insurer}-${inForce ? 'v2' : 'v1'}`, insurer_name: name, insurer, net: total / 1.09, gst: total - total / 1.09, total, missing, by_product: {}, inForce, excluded: false, preferred: false, current, withinBudget: null })

const pack: ScenarioPack = {
  at: '2026-11-11T00:00:00Z', by: 'x', threadId: 't', quotationId: 'q', model: 'm', messages: 18, effectiveDate: '2027-01-25', basis: 'renewal', employees: 28, dependants: 0, notes: ['QBE priced as a renewal; every other insurer as new business, which is how a switch is underwritten.'],
  brief: { company: 'Empyrion DC', basis: 'renewal', currentInsurer: 'QBE', current: {}, currentPlanText: null, expiringPremium: null, budget: null, budgetText: null, budgetNetOfGst: null, mustHaves: [], wishes: [{ cover: 'GD', change: 'add', detail: 'dental coverage', sum: null }], optional: ['GD'], excludeInsurers: [], preferInsurers: [], renewalDate: null, effectiveDate: null, decisions: [], open: [] },
  scenarios: [
    { key: 'A', name: 'Like for like', summary: 'Government 1-bed entry limit + major medical · GP co-pay · specialist entry · dental entry · employees only', changes: [], requirement: { ward: 'G1', wardLevel: 'entry', gmm: true, gp: 'copay', sp: 'entry', dental: 'entry', pa: null, gtl: null, gci: null, deps: 'none' },
      insurers: [ins('singlife', 'Singapore Life Ltd.', 28_262, 4), ins('income', 'Income Insurance Limited', 28_762, 4), ins('qbe', 'QBE Insurance (Singapore) Pte Ltd', 46_405, 0, true), ins('qbe', 'QBE Insurance (Singapore) Pte Ltd', 36_913, 0, true, false)] },
    { key: 'B', name: 'Lower cost', summary: 'Government 1-bed entry limit · GP co-pay · specialist entry · employees only', changes: ['Dental off (optional in the brief)', 'Major medical off'], requirement: { ward: 'G1', wardLevel: 'entry', gmm: false, gp: 'copay', sp: 'entry', dental: null, pa: null, gtl: null, gci: null, deps: 'none' },
      insurers: [ins('singlife', 'Singapore Life Ltd.', 23_106, 2), ins('qbe', 'QBE Insurance (Singapore) Pte Ltd', 39_839, 0, true)] },
    { key: 'C', name: 'Enhanced', summary: 'Government 1-bed entry limit + major medical · GP co-pay · specialist entry · dental top · employees only', changes: ['Dental at the top tier'], requirement: { ward: 'G1', wardLevel: 'entry', gmm: true, gp: 'copay', sp: 'entry', dental: 'top', pa: null, gtl: null, gci: null, deps: 'none' },
      insurers: [ins('income', 'Income Insurance Limited', 30_204, 4), ins('qbe', 'QBE Insurance (Singapore) Pte Ltd', 51_281, 0, true)] },
  ],
}
const q = { company_name: 'Empyrion DC Pte Ltd', census: [{ name: 'Michael Tang', dob: '1953-02-27' }, { name: 'Marc Wong', dob: '1957-09-09' }, { name: 'Kay Yong', dob: '1991-09-30' }] }

describe('clientFacts + suggestionLines', () => {
  const f = clientFacts(q, pack)
  it('reads the options, the expiring card and the members an insurer switch would not take', () => {
    expect(f.options.map(o => o.rows.map(r => `${r.insurer} ${Math.round(r.total)}${r.current ? '*' : ''}`))).toEqual([
      ['Singlife 28262', 'Income 28762', 'QBE 46405*'], ['Singlife 23106', 'QBE 39839*'], ['Income 30204', 'QBE 51281*'],
    ])
    expect(f.expiringCardTotal).toBe(36_913)
    expect(f.older.map(o => `${o.name} ${o.age}`)).toEqual(['Michael Tang 73', 'Marc Wong 69'].filter(x => !x.endsWith('69')))
  })
  it('suggests the renewal that keeps everyone covered, names the cheaper insurer with its gap, and costs dental', () => {
    const s = suggestionLines(f)
    expect(s[0]).toMatch(/^Renewing with QBE at \$46,405 keeps every member covered; the increase from the expiring rate card is 20%\./)
    expect(s[1]).toMatch(/^Singlife prices the rest of the team at \$28,262, about \$18,14[34] less, but its package rates do not take 1 member \(Michael Tang\)/)
    expect(s.find(x => x.startsWith('Dental at the top tier adds $4,876 a year at QBE'))).toBeTruthy()
    expect(s.find(x => x.startsWith('Dropping dental and major medical saves $6,566 a year at QBE'))).toBeTruthy()
  })
  it('recommends a switch only when a complete alternative is at least 10% cheaper', () => {
    const f2 = clientFacts(q, { ...pack, scenarios: [{ ...pack.scenarios[0], insurers: [ins('singlife', 'Singapore Life Ltd.', 28_262, 0), ins('qbe', 'QBE Insurance (Singapore) Pte Ltd', 46_405, 0, true)] }] })
    expect(suggestionLines(f2)[0]).toMatch(/^Singlife covers every member at \$28,262, 39% below the renewal at QBE \(\$46,405\)\. We recommend taking firm terms from Singlife\./)
  })
})

describe('codeDraft + keepsFigures', () => {
  const f = clientFacts(q, pack)
  const d = codeDraft(f, 'Pearlin')
  it('writes the subject, summary, derivation, suggestion and sign-off with the placeholder', () => {
    expect(d.subject).toBe('(TRS) Empyrion DC Pte Ltd - Employee Benefits Renewal 2027 - EB pricing estimate')
    expect(d.body).toContain('Dear Pearlin,')
    expect(d.body).toContain('1. Like for like - Government 1-bed entry limit + major medical · GP co-pay · specialist entry · dental entry · employees only\n')
    expect(d.body).toContain('   - QBE (current insurer, renewal): $46,405')
    expect(d.body).toContain('   - Singlife: $28,262 *')
    expect(d.body).toContain('* 1 member (Michael Tang) not priced')
    expect(d.body).toContain('QBE is priced as a renewal on its renewal rate card')
    expect(d.body).toContain('Our suggestion:')
    expect(d.body.trim().endsWith('Warmest Regards,\n\n{owner_name}\nTrade Risk Solutions')).toBe(true)
  })
  it('accepts a rewrite with the same figures and rejects one that drops or changes a figure', () => {
    const same = d.body.replace('Thank you for the member listing.', 'Thank you for sending the member listing over.')
    expect(keepsFigures(same, d.body)).toBe(true)
    expect(keepsFigures(d.body.replace('$46,405', '$46,400'), d.body)).toBe(false)
    expect(keepsFigures(d.body.replace('   - Singlife: $28,262 *\n', ''), d.body)).toBe(false)
    expect(keepsFigures(d.body.replace('{owner_name}', 'Nathan'), d.body)).toBe(false)
  })
  it('lays the options out for the report with the current insurer marked', () => {
    const o = reportOptions(pack)
    expect(o.names).toEqual(['Like for like', 'Lower cost', 'Enhanced'])
    expect(o.rows.find(r => r.insurer === 'QBE')).toMatchObject({ current: true, totals: [46_405, 39_839, 51_281] })
    expect(o.rows.find(r => r.insurer === 'Singlife')).toMatchObject({ totals: [28_262, 23_106, null], unpriced: [4, 2, 0] })
  })
})
