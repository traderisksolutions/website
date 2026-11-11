import { describe, expect, it } from 'vitest'
import { analysisAsScenarios, analysisSummary, type AnalysisPack, type AnalysisInsurer } from '@/lib/gb/analysis'
import { reportOptions, clientFacts } from '@/lib/gb/client-draft'

const ins = (name: string, key: AnalysisInsurer['insurer'], net: number, unpriced = 0, excluded = false): AnalysisInsurer =>
  ({ rate_table_id: key, insurer_name: name, insurer: key, basis: 'new_business', variant: null, excluded, net, gst: net * 0.09, total: net * 1.09, by_product: {}, unpriced, plans: {}, notes: [] })
const rung = (key: AnalysisPack['rungs'][number]['key'], name: string, a: number, b: number) => ({ key, name, facts: [`${name} fact 1`, 'fact 2', 'fact 3', 'fact 4', 'fact 5'], insurers: [ins('Singapore Life Ltd.', 'singlife', a), ins('QBE Insurance (Singapore) Pte Ltd', 'qbe', b, 0, true)], best: { insurer_name: 'Singapore Life Ltd.', net: a, total: a * 1.09 } })
const pack: AnalysisPack = {
  at: '2026-11-12T10:00:00Z', by: null, quotationId: 'q1', effectiveDate: '2027-01-01', basis: 'renewal', currentInsurer: 'AIA', employees: 33, dependants: 0,
  suggested: 'standard', because: 'the common SME package', excluded: ['QBE'],
  rungs: [rung('essential', 'Essential', 22920, 36496), rung('standard', 'Standard', 33219, 56342), rung('enhanced', 'Enhanced', 35441, 63420), rung('executive', 'Executive', 51552, 73187), rung('premier', 'Premier', 73234, 103829)],
  notes: ['Net of GST.'],
}

describe('the analysis feeds the report and the draft', () => {
  it('summarises as the rail reads it', () => {
    expect(analysisSummary(pack)).toBe('Standard at Singapore S$33,219 · Enhanced +S$2,222 · Essential −S$10,299')
  })
  it('becomes three scenario columns: suggested, add a little, save a little', () => {
    const s = analysisAsScenarios(pack, 'OUE Limited')
    expect(s.scenarios.map(x => x.name)).toEqual(['Standard', 'Enhanced (add a little)', 'Essential (save a little)'])
    const o = reportOptions(s)
    expect(o.names).toEqual(['Standard', 'Enhanced (add a little)', 'Essential (save a little)'])
    expect(o.rows.map(r => r.insurer)).toEqual(['Singlife'])   // the ruled-out insurer stays off the client's page
    expect(o.rows[0].totals.map(t => Math.round(t!))).toEqual([36209, 38631, 24983])
    const f = clientFacts({ company_name: 'OUE Limited', census: [] }, s)
    expect(f.company).toBe('OUE Limited'); expect(f.currentInsurer).toBe('AIA'); expect(f.options[0].headline?.insurer).toBe('Singlife')
  })
  it('puts a split or a custom run first when one exists', () => {
    const s = analysisAsScenarios({ ...pack, split: { at: '', assignments: { Management: 'executive', Staff: 'standard' }, summary: 'Management on Executive · Staff on Standard', insurers: pack.rungs[1].insurers, best: pack.rungs[1].best } }, 'OUE')
    expect(s.scenarios[0].name).toMatch(/^Split/)
  })
})
