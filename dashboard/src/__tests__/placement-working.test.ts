import { describe, it, expect } from 'vitest'
import { daysTo, derivedStages, linePatchFrom, shortInsurer, shownStages } from '@/lib/placement/working'

describe('derivedStages', () => {
  it('reads both sides from where the line stands', () => {
    expect(derivedStages('not_asked')).toEqual({ client: 'data_received', insurer: 'not_asked' })
    expect(derivedStages('chase')).toEqual({ client: 'data_received', insurer: 'asked' })
    expect(derivedStages('quoting')).toEqual({ client: 'data_received', insurer: 'quotes_in' })
    expect(derivedStages('shared')).toEqual({ client: 'quote_sent', insurer: 'quotes_in' })
    expect(derivedStages('client_chose')).toEqual({ client: 'client_decided', insurer: 'quotes_in' })
    expect(derivedStages('bound')).toEqual({ client: 'client_decided', insurer: 'placed' })
    expect(derivedStages('done')).toEqual({ client: 'signed_paid', insurer: 'policy_issued' })
  })
  it('lets a stage set by hand win, and ignores an unknown one', () => {
    expect(shownStages({ client_stage: 'data_requested', insurer_stage: null }, 'quoting')).toMatchObject({ client: 'data_requested', insurer: 'quotes_in', clientSet: true, insurerSet: false })
    expect(shownStages({ client_stage: 'nonsense' }, 'shared')).toMatchObject({ client: 'quote_sent', clientSet: false })
  })
})

describe('linePatchFrom', () => {
  it('takes the known fields, checked', () => {
    expect(linePatchFrom({ client_stage: 'quote_sent', existing: true, renewal_date: '2026-12-31', previous_premium: 19600 })).toEqual({ patch: { client_stage: 'quote_sent', existing: true, renewal_date: '2026-12-31', previous_premium: 19600 } })
    expect(linePatchFrom({ insurer_stage: null })).toEqual({ patch: { insurer_stage: null } })
    expect(linePatchFrom({ status: 'dropped' })).toEqual({ patch: { status: 'dropped' } })
  })
  it('refuses bad values and empty bodies, in words', () => {
    expect(linePatchFrom({ client_stage: 'done' })).toEqual({ error: 'Unknown client stage' })
    expect(linePatchFrom({ renewal_date: '31/12/2026' })).toEqual({ error: 'renewal_date must be YYYY-MM-DD' })
    expect(linePatchFrom({ previous_premium: -5 })).toEqual({ error: 'previous_premium must be a positive amount' })
    expect(linePatchFrom({ status: 'bound' })).toEqual({ error: 'Only removing a line is allowed here' })
    expect(linePatchFrom({ company_id: 'x' })).toEqual({ error: 'Nothing to change' })
  })
})

describe('daysTo', () => {
  it('counts whole days, negative when past', () => {
    expect(daysTo('2026-12-31', '2026-11-19')).toBe(42)
    expect(daysTo('2026-11-18', '2026-11-19')).toBe(-1)
    expect(daysTo(null, '2026-11-19')).toBeNull()
  })
})

describe('shortInsurer', () => {
  it('drops the legal suffixes', () => {
    expect(shortInsurer('EQ Insurance Company Limited')).toBe('EQ Insurance')
    expect(shortInsurer('Allianz Insurance Singapore Pte. Ltd.')).toBe('Allianz Insurance')
    expect(shortInsurer('ECICS Limited')).toBe('ECICS')
    expect(shortInsurer('Liberty')).toBe('Liberty')
  })
})
