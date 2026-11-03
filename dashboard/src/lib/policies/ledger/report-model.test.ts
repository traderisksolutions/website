import { describe, it, expect } from 'vitest'
import { buildReportModel, optionRows, planDates, notOnFile, adviceEmail, DASH, addDays } from './report-model'
import { projectRenewal } from './maths'
import type { RenewalPack, PeriodFigures } from './index'

function figures(over: Partial<PeriodFigures> = {}): PeriodFigures {
  return {
    policy_id: 'p1', policy_number: 'GHS-100', start_date: '2026-01-01', end_date: '2026-12-31',
    premium_inception: 120000, endorsements_net: 4500, endorsements_count: 6, premium_net: 124500, gst: 0,
    earned_premium: 100000, claims_count: 3, claims_open: 1, claims_paid: 30000, claims_claimed: 42000,
    loss_ratio: 0.3, insurer_experience: null, members_inception: 100, members_now: 104, joiners: 9, leavers: 5, rate_per_head: 1200, sum_insured: null,
    ...over,
  }
}

function pack(over: Partial<RenewalPack> = {}, cur: Partial<PeriodFigures> = {}, prior: Partial<PeriodFigures> | null = {}): RenewalPack {
  const current = figures(cur)
  const projection = projectRenewal({ inceptionPremium: current.premium_inception, endorsementsNet: current.endorsements_net, lossRatio: current.loss_ratio, headsInception: current.members_inception, headsNow: current.members_now, ratePerHead: current.rate_per_head })
  return {
    policy: { id: 'p1', company_id: 'c1', company_name: 'Example Holdings Pte Ltd', insurer: 'Example Assurance', class: 'Group Hospital & Surgical', product_line: 'group_health', policy_number: 'GHS-100', start_date: '2026-01-01', end_date: '2026-12-31', lifecycle: 'live', currency: 'SGD', premium: 120000, sum_insured: null, is_eb: true },
    as_of: '2026-11-01', term_days: 365, elapsed_days: 304, current, prior: prior ? figures({ policy_number: 'GHS-099', start_date: '2025-01-01', end_date: '2025-12-31', premium_inception: 110000, premium_net: 112000, claims_paid: 55000, loss_ratio: 0.5, members_inception: 96, members_now: 100, rate_per_head: 1145.83, ...prior }) : null,
    projection, missing: [], ...over,
  }
}

describe('report model', () => {
  it('renders the four sections when a prior period exists, three when not', () => {
    expect(buildReportModel(pack()).sections.map(s => s.key)).toEqual(['cover', 'movements', 'claims', 'prior'])
    expect(buildReportModel(pack({}, {}, null)).sections.map(s => s.key)).toEqual(['cover', 'movements', 'claims'])
  })

  it('shows figures with their period and the change against the prior period', () => {
    const m = buildReportModel(pack())
    const prior = m.sections.find(s => s.key === 'prior')!
    const premium = prior.rows.find(r => r.label === 'Premium at inception')!
    expect(premium).toEqual({ label: 'Premium at inception', now: 'S$120,000.00', prior: 'S$110,000.00', change: 'S$10,000.00' })
    const lr = prior.rows.find(r => r.label === 'Loss ratio')!
    expect(lr.change).toBe('-20 pts')
    expect(m.sections[1].period).toBe('01 Jan 2026 to 31 Dec 2026')
    const lives = m.sections[1].rows.find(r => r.label === 'Net lives')!
    expect(lives.now).toBe('+4')
  })

  it('shows a dash for anything not on file and names its source', () => {
    const m = buildReportModel(pack({}, { premium_inception: null, premium_net: 0, rate_per_head: null, members_now: null, claims_paid: 0 }, null))
    const cover = m.sections[0].rows
    expect(cover.find(r => r.label === 'Premium at inception')!.now).toBe(DASH)
    expect(m.sections[2].rows.find(r => r.label === 'Claims paid')!.now).toBe(DASH)
    expect(m.sections[2].rows.find(r => r.label.startsWith('Loss ratio'))!.now).toBe(DASH)
    const items = m.not_on_file.map(n => n.item)
    expect(items).toEqual(expect.arrayContaining(['Premium at inception', 'Claims paid', 'Members now', 'Rate per head', 'Prior period']))
    expect(m.not_on_file.find(n => n.item === 'Claims paid')!.source).toBe('awaiting insurer settlement letters')
  })

  it('does not list claims paid as missing when no claim was notified', () => {
    expect(notOnFile(pack({}, { claims_count: 0, claims_paid: 0, claims_open: 0 })).map(n => n.item)).not.toContain('Claims paid')
  })

  it('prices the options it can and leaves the rest blank', () => {
    const rows = optionRows(pack())
    const same = rows.find(r => r.option.startsWith('Renew as is'))!
    expect(same.premium).toBe('S$124,800.00')  // 1200 × 104
    const range = rows.find(r => r.option.startsWith('Market range'))!
    expect(range.premium).toBe('S$112,320.00 to S$124,800.00')  // loss ratio 30% → -10% to 0%
    const heads = rows.find(r => r.option === 'Headcount correction')!
    expect(heads.premium).toBe('+S$4,800.00')  // 1200 × (104 − 100)
    expect(rows.find(r => r.option === 'Higher excess')!.premium).toBe(DASH)
    expect(rows.find(r => r.option.startsWith('Plan change'))!.premium).toBe(DASH)
  })

  it('withholds the market range while claims paid is not on file', () => {
    const rows = optionRows(pack({}, { claims_count: 2, claims_paid: 0, loss_ratio: 0 }))
    const range = rows.find(r => r.option.startsWith('Market range'))!
    expect(range.premium).toBe(DASH)
    expect(range.basis).toContain('settlement letters')
    expect(optionRows(pack({}, { claims_count: 0, claims_paid: 0, claims_open: 0, loss_ratio: 0 })).find(r => r.option.startsWith('Market range'))!.premium).not.toBe(DASH)
  })

  it('leaves the headcount option blank without a rate per head', () => {
    const rows = optionRows(pack({}, { rate_per_head: null }))
    expect(rows.find(r => r.option === 'Headcount correction')!.premium).toBe(DASH)
  })

  it('omits EB-only options and rows on a non-EB policy', () => {
    const p = pack(); p.policy.is_eb = false
    const rows = optionRows(p)
    expect(rows.map(r => r.option)).not.toContain('Headcount correction')
    const m = buildReportModel(p)
    expect(m.sections[1].rows.map(r => r.label)).toEqual(['Endorsements', 'Endorsement premium, net'])
  })

  it('counts the plan dates back from expiry and never before today', () => {
    expect(planDates('2026-12-31', '2026-11-01')).toEqual([
      { step: 'Terms back by', date: '16 Nov 2026' }, { step: 'Comparison to you by', date: '01 Dec 2026' }, { step: 'Decision by', date: '16 Dec 2026' }, { step: 'Cover renews', date: '01 Jan 2027' },
    ])
    expect(planDates('2026-11-20', '2026-11-10')[0].date).toBe('10 Nov 2026')
    expect(planDates(null, '2026-11-01').every(r => r.date === DASH)).toBe(true)
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('states the band assumption once in the footnote', () => {
    const m = buildReportModel(pack())
    expect(m.footnote).toContain('Projection uses the loss-ratio bands in src/lib/policies/ledger/maths.ts')
    expect(m.footnote).toContain('Loss ratio under 40%: -10% to +0%')
  })

  it('writes the three-line email with the decision date and the placeholder signature', () => {
    const m = buildReportModel(pack())
    const e = adviceEmail(m, { greeting: 'Mei', expiry: '2026-12-31' })
    expect(e.subject).toBe('Renewal of Group Hospital & Surgical · Example Assurance · expiring 31 Dec 2026')
    expect(e.body).toContain('Dear Mei,')
    expect(e.body).toContain('by 16 Dec 2026')
    expect(e.body).toContain('{owner_name}')
    expect(e.body.split('\n').filter(l => l.trim() && !/^(Dear|Best regards|\{owner_name\}|Trade Risk)/.test(l))).toHaveLength(3)
  })
})
