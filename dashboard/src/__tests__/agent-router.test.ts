import { describe, it, expect } from 'vitest'
import { routeModel, OPUS_MONTHLY_BUDGET_USD, OPUS_MODEL } from '@/lib/agents/router'

const base = { companyCount: 1, threadCount: 1, contextChars: 1000 }

describe('routeModel', () => {
  it('uses Flash for an ordinary single-thread reply', () => {
    expect(routeModel(base).tier).toBe('flash')
  })

  it('steps up to Pro once several threads are in play', () => {
    expect(routeModel({ ...base, threadCount: 4 }).tier).toBe('pro')
  })

  it('uses Opus when more than one company is involved', () => {
    const r = routeModel({ ...base, companyCount: 3 })
    expect(r.tier).toBe('opus')
    expect(r.model).toBe(OPUS_MODEL)
    expect(r.reason).toContain('3 companies')
  })

  it('uses Opus when a deep read is explicitly asked for', () => {
    expect(routeModel({ ...base, deepAnalysis: true }).tier).toBe('opus')
  })

  it('uses Opus for a wide sweep across one company', () => {
    expect(routeModel({ ...base, threadCount: 12 }).tier).toBe('opus')
  })

  it('degrades to Pro rather than failing once the budget is spent', () => {
    const r = routeModel({ ...base, companyCount: 3, monthSpendUsd: OPUS_MONTHLY_BUDGET_USD })
    expect(r.tier).toBe('pro')
    expect(r.honoured).toBe(false)
    expect(r.reason).toContain('budget')
  })

  it('does not downgrade work that never wanted Opus', () => {
    const r = routeModel({ ...base, monthSpendUsd: 999 })
    expect(r.tier).toBe('flash')
    expect(r.honoured).toBe(true)
  })
})
