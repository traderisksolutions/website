import { describe, expect, it } from 'vitest'
import { belongsToRequest, projectTokens } from '@/lib/placement/adopt'

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
