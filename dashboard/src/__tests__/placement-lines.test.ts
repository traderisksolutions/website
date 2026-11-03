/**
 * Phase 3 of the agents learning the broker's method: structured line specs, the fixed submission
 * block, the panel per line in the broker's order, the insurer deadline, and line-aware comparison
 * columns with decline reasons.
 */
import { describe, it, expect } from 'vitest'
import { LINE_SPECS, pickPanel, insurerDeadline, comparisonHead, contractValueOf, marketsFor, fieldLabel } from '@/lib/placement/lines'
import { fixedSubmission } from '@/lib/placement/agent'
import { normaliseSpec, specLines, specDiff } from '@/lib/placement/spec'
import { comparisonTable, type EmailLine } from '@/lib/placement/compare'
import type { PlacementQuote } from '@/lib/placement/types'

const car = { fields: { project: 'Proposed show flat at Example Drive', contractor: 'Example Builders Pte Ltd', principal: 'Example Developments Pte Ltd', contract_value: 'S$12,500,000', period_months: '14', dlp_months: '12', start_date: '2026-12-01', ground_works: 'Bored piles, no basement' } }

describe('spec fields', () => {
  it('keeps structured fields through normalisation and prints them with their labels', () => {
    const s = normaliseSpec({ limit: ' S$1M ', fields: { contract_value: 'S$12,500,000', 'Bad Key': 'x', empty: '  ' } })
    expect(s).toEqual({ limit: 'S$1M', fields: { contract_value: 'S$12,500,000' } })
    expect(specLines(s, k => fieldLabel('construction_car', k))).toEqual(['Limit: S$1M', 'Contract value: S$12,500,000'])
    expect(specDiff({ fields: { contract_value: 'S$10m' } }, { fields: { contract_value: 'S$12m' } })).toEqual([{ field: 'notes', label: 'contract value', from: 'S$10m', to: 'S$12m' }])
  })
  it('reads the contract value from the fields, else the limit', () => {
    expect(contractValueOf(car)).toBe(12_500_000)
    expect(contractValueOf({ limit: 'S$1.5m' })).toBe(1_500_000)
    expect(contractValueOf({})).toBeNull()
  })
})

describe('the construction submission', () => {
  const text = fixedSubmission({ insurerName: null, contactName: null, clientName: 'Example Builders Pte Ltd', lines: [{ label: 'CAR', productLine: 'construction_car', spec: car }], roundNo: 1, changeSummary: null, previousPremium: null, inceptionDate: null, deadline: '2026-11-10', memory: '' })
  it('is the fixed block: project in capitals, the contract chain, sums from the contract value, liability, RIBA, PEL on wages, the deadline', () => {
    expect(text).not.toBeNull()
    const b = text!.body
    expect(b).toContain('Project: PROPOSED SHOW FLAT AT EXAMPLE DRIVE')
    expect(b).toContain('Insured: Example Builders Pte Ltd as Main Contractor and/or their sub-contractors of all tiers and/or Example Developments Pte Ltd as Principal')
    expect(b).toContain('- Contract works: S$12,500,000')
    expect(b).toContain('- Professional fees (10% of contract value): S$1,250,000')
    expect(b).toContain('- Removal of debris (5% of contract value): S$625,000')
    expect(b).toContain('Period of insurance: 14 months from 1 Dec 2026 + 6 months buffer + 12 months defects liability')
    expect(b).toContain('Section II (third party liability): S$10,000,000 any one accident, unlimited in the period')
    expect(b).toContain('RIBA 19(2)(a): S$10,000,000 in the aggregate')
    expect(b).toContain("Public and employers' liability: wages estimated at 20% of contract value, S$2,500,000")
    expect(b).toContain('We would appreciate your quotation by 10 Nov 2026.')
    expect(b.startsWith('Dear Underwriter,')).toBe(true)
    expect(b).not.toMatch(/Great Eastern|EQ Insurance/)
    expect(text!.subject).toBe('(TRS) Example Builders Pte Ltd | CAR | Proposed show flat at Example Drive')
  })
  it('a revised round says what changed and keeps the rest', () => {
    const t = fixedSubmission({ insurerName: null, contactName: null, clientName: 'Example Builders Pte Ltd', lines: [{ label: 'CAR', productLine: 'construction_car', spec: car }], roundNo: 2, changeSummary: 'contract value S$10m → S$12.5m', previousPremium: null, inceptionDate: null, deadline: null, memory: '' })
    expect(t!.body).toContain('the basis has changed as follows: contract value S$10m → S$12.5m')
    expect(t!.subject).toContain('| revised')
  })
  it('is null for a line without a block, a named insurer, or several lines', () => {
    const base = { insurerName: null, contactName: null, clientName: 'X', roundNo: 1, changeSummary: null, previousPremium: null, inceptionDate: null, memory: '' }
    expect(fixedSubmission({ ...base, lines: [{ label: 'PL', productLine: 'general_liability', spec: {} }] })).toBeNull()
    // WICA has its own block since 3 Nov 2026 (the format Catherine sent insurers).
    expect(fixedSubmission({ ...base, lines: [{ label: 'WICA', productLine: 'wica', spec: {} }] })).not.toBeNull()
    expect(fixedSubmission({ ...base, insurerName: 'Example Insurer', lines: [{ label: 'CAR', productLine: 'construction_car', spec: car }] })).toBeNull()
    expect(fixedSubmission({ ...base, lines: [{ label: 'CAR', productLine: 'construction_car', spec: car }, { label: 'PL', productLine: 'general_liability', spec: {} }] })).toBeNull()
  })
  it('bonds and financial lines have their own blocks', () => {
    const bond = fixedSubmission({ insurerName: null, contactName: null, clientName: 'Example Builders Pte Ltd', lines: [{ label: 'Performance bond', productLine: 'surety_bonds', spec: { fields: { beneficiary: 'Example Authority', contract_value: 'S$3,000,000', bond_pct: '5', start_date: '2026-12-01', end_date: '2027-11-30', dlp_months: '12' } } }], roundNo: 1, changeSummary: null, previousPremium: null, inceptionDate: null, deadline: null, memory: '' })
    expect(bond!.body).toContain('Bond amount: S$150,000 (5% of contract value)')
    expect(bond!.body).toContain('Bond period: 1 Dec 2026 to 30 Nov 2027 + 12 months defects liability + 6 months buffer')
    expect(bond!.body).toContain("directors' notices of assessment")
    const pi = fixedSubmission({ insurerName: null, contactName: null, clientName: 'Example Advisory Pte Ltd', lines: [{ label: 'PI', productLine: 'professional_indemnity', spec: { fields: { limit: 'S$2,000,000 any one claim and in the aggregate', retro_date: '1 Jan 2020', revenue: 'S$4.1m', claims_history: 'nil' } } }], roundNo: 1, changeSummary: null, previousPremium: null, inceptionDate: '2027-01-01', deadline: null, memory: '' })
    expect(pi!.body).toContain('keen to write')
    expect(pi!.body).toContain('Retroactive date: 1 Jan 2020')
    expect(pi!.body).toContain('Period of insurance: 12 months from 1 Jan 2027')
  })
})

describe('the panel', () => {
  const onFile = ['Zurich Insurance Company Ltd', 'EQ Insurance Company Limited', 'Great Eastern General Insurance Ltd', 'China Taiping Insurance (Singapore)', 'Liberty Pte. Limited', 'Allianz Insurance Singapore', 'HLAS', 'Tokio Marine Insurance Singapore']
  it('asks 3 for a small CAR, EQ first; 6 for a large one, Great Eastern first', () => {
    expect(pickPanel('construction_car', { fields: { contract_value: 'S$1,500,000' } }, onFile)).toEqual(['EQ Insurance Company Limited', 'Zurich Insurance Company Ltd', 'Tokio Marine Insurance Singapore'])
    const large = pickPanel('construction_car', { fields: { contract_value: 'S$250,000,000' } }, onFile)
    expect(large).toHaveLength(6)
    expect(large.slice(0, 3)).toEqual(['Great Eastern General Insurance Ltd', 'China Taiping Insurance (Singapore)', 'Allianz Insurance Singapore'])
    expect(marketsFor('construction_car', {})).toBe(3)
    expect(marketsFor('surety_bonds', {})).toBe(3)
  })
  it('leaves a line without a spec alone', () => {
    expect(pickPanel('trade_credit', {}, ['A', 'B', 'A'])).toEqual(['A', 'B'])
  })
  it('every line spec names at least two preferred insurers and one document to ask for', () => {
    for (const [k, s] of Object.entries(LINE_SPECS)) {
      expect(s.preferred({ contractValue: null }).length, k).toBeGreaterThanOrEqual(1)
      expect(s.documentsToAsk.length, k).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('the insurer deadline', () => {
  it('is 5 working days out, or two working days before inception when that is sooner', () => {
    expect(insurerDeadline('construction_car', '2026-11-02', null)).toBe('2026-11-09')       // Mon → next Mon
    expect(insurerDeadline('construction_car', '2026-11-02', '2026-11-06')).toBe('2026-11-04') // Fri inception → Wed
    expect(insurerDeadline('construction_car', '2026-11-02', '2026-12-01')).toBe('2026-11-09')
    expect(insurerDeadline('commercial_vehicle', '2026-11-02', null)).toBe('2026-11-05')
  })
})

describe('the comparison table', () => {
  const q = (over: Partial<PlacementQuote>): PlacementQuote => ({
    id: 'q', placement_id: 'p', line_id: 'l', round_id: 'r', dispatch_id: 'd', insurer_name: 'Example Insurer', premium_text: 'S$12,000', premium_amount: 12000, currency: 'SGD',
    limit_text: 'S$12,500,000', limit_amount: 12_500_000, excess_text: 'S$5,000 each and every loss', validity_text: null, valid_until: '2026-11-30', key_terms: ['Munich Re wording'], exclusions: [], subjectivities: ['Signed proposal form', 'Nil claims declaration'], summary: null, evidence: {}, source_message_id: null, thread_id: null, status: 'received', needs_review: false, extracted_by: null, created_at: '2026-11-02', ...over,
  })
  it('heads construction by lead, rate and deductible; employee benefits by per head and benefits', () => {
    expect(comparisonHead('construction')).toEqual(['Insurer', 'Lead / share', 'Rate', 'Premium (S$)', 'Sum insured / limit', 'Deductible', 'Subjectivities', 'Valid until'])
    expect(comparisonHead('eb')[3]).toBe('Per head (S$)')
    const line: EmailLine = { label: 'CAR', family: 'construction', quotes: [{ quote: q({ rate_text: '0.085%', role: 'lead', share_pct: 50 }), insurer: 'Example Insurer', product: null, option: 'As asked' }], pending: [], declined: ['Other Insurer (prefer not to write piling)'] }
    const t = comparisonTable(line)
    expect(t.split('\n')[0]).toBe('| Insurer | Lead / share | Rate | Premium (S$) | Sum insured / limit | Deductible | Subjectivities | Valid until |')
    expect(t.split('\n')[1]).toBe('| Example Insurer | Lead 50% | 0.085% | 12,000.00 | S$12,500,000 | S$5,000 each and every loss | Signed proposal form; Nil claims declaration | 30 Nov 2026 |')
  })
})

describe('the thread as the model reads it', () => {
  it('keeps a message\'s own words and drops the quoted history under it', async () => {
    const { ownWordsOf } = await import('@/lib/placement/agent')
    expect(ownWordsOf('Please proceed with Plan B.\n\nOn Mon, 2 Nov 2026 at 10:00, Example <a@example-client.sg> wrote:\n> old instruction: proceed with Plan A')).toBe('Please proceed with Plan B.')
    expect(ownWordsOf('Noted.\n\n-----Original Message-----\nFrom: x@example-client.sg\nold text')).toBe('Noted.')
  })
})
