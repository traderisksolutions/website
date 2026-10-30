import { describe, expect, it } from 'vitest'
import { belongsToRequest, linesNamed, projectTokens } from '@/lib/placement/adopt'

const dover = { subject: 'Re: Dover Drive Mix Development_CAR & Employer Liability (Trade Solutions)', project: 'Dover Drive', clientName: 'CHINA COMMUNICATIONS CONSTRUCTION COMPANY LIMITED', startAt: '2026-09-11T07:49:00Z' }
const showFlat = { subject: 'Dover Drive Residential Development Show Flat_CAR (Trade Solutions)', project: 'Dover Drive Show Flat', clientName: 'CHINA COMMUNICATIONS CONSTRUCTION COMPANY LIMITED', startAt: '2026-10-29T02:00:00Z' }
const ctpis = { subject: 'RE: (TRS) CTPIS - Forsea | Dover Dr Development', firstAt: '2026-09-11T08:41:00Z', insurerWords: ['china', 'taping', 'ctpis'] }

describe('projectTokens', () => {
  it('keeps the words that name the job', () => {
    expect([...projectTokens('RE: (TRS) CTPIS - Forsea | Dover Dr Development', ['ctpis'])].sort()).toEqual(['dover', 'forsea'])
  })
})

describe('belongsToRequest', () => {
  it('ties an insurer thread to the client request it followed', () => {
    expect(belongsToRequest(ctpis, dover)).toBe(true)
  })
  it('does not tie a September insurer thread to a request the client made in October', () => {
    expect(belongsToRequest(ctpis, showFlat)).toBe(false)
  })
  it('ties the show flat insurer thread to the show flat request', () => {
    expect(belongsToRequest({ subject: 'Re: (TRS) ECICS - CCCC (Dover Show Flat CAR)', firstAt: '2026-10-30T01:00:00Z', insurerWords: ['ecics'] }, showFlat)).toBe(true)
  })
  it('needs a shared word or the client name', () => {
    expect(belongsToRequest({ subject: 'RE: (TRS) Allianz - Weima Tuas Viaduct', firstAt: '2026-09-12T00:00:00Z', insurerWords: ['allianz'] }, dover)).toBe(false)
  })
})

describe('a client with several jobs', () => {
  const stevens = { subject: 'Re: RFQ for Tender Steven Roads Resi Flats Development - Insurance (Trade Risk Solution)', project: 'Stevens Road', clientName: 'CHEC SG', startAt: '2026-10-02T02:00:00Z' }
  it('takes the same job however it is spelt', () => {
    expect(belongsToRequest({ subject: 'RE: (TRS) Allianz - CHEC Stevens Road Resi Development', firstAt: '2026-10-02T03:00:00Z', insurerWords: ['allianz'] }, stevens)).toBe(true)
    expect(belongsToRequest({ subject: 'RE: (TRS) Zurich - CHEC Stevens Rd GPA', firstAt: '2026-10-15T03:00:00Z', insurerWords: ['zurich'] }, stevens)).toBe(true)
  })
  it('leaves the client\'s other job alone', () => {
    expect(belongsToRequest({ subject: '(TRS) Chubb - CHEC RE218 Tuas Road Viaduct (Phase 2)', firstAt: '2026-10-22T03:00:00Z', insurerWords: ['chubb'] }, stevens)).toBe(false)
  })
  it('does not match another client on a street word', () => {
    expect(belongsToRequest({ subject: '(TRS) GEGI - SB 79 Anson Road Redevelopment', firstAt: '2026-10-25T03:00:00Z', insurerWords: ['great', 'eastern', 'gegi'] }, stevens)).toBe(false)
  })
})

describe('linesNamed', () => {
  it('reads the cover from a subject', () => {
    expect(linesNamed('(TRS) Chubb - CHEC Stevens Road GPA').map(l => l.product_line)).toEqual(['employee_benefits'])
    expect(linesNamed('Dover Drive Mix Development_CAR & Employer Liability').map(l => l.product_line)).toEqual(['construction_car', 'wica'])
    expect(linesNamed('(TRS) ECICS - CHEC Stevens Road Resi Development')).toEqual([])
  })
})
