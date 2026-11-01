import { describe, expect, it } from 'vitest'
import { clientSegment } from '../resolver'

// Subjects follow TRS's own convention; the names are invented.
describe('clientSegment', () => {
  it('reads the client out of "(TRS) Insurer - Client | line"', () => {
    expect(clientSegment('RE: [EXTERNAL] (TRS) Zenith - Harbour Logistics WIC')).toBe('Harbour Logistics')
    expect(clientSegment('(TRS) Zenith - Harbour Logistics | Tech PI, D&O & Cyber')).toBe('Harbour Logistics')
    expect(clientSegment('RE: (TRS) Zenith- Riverstone Plastics Pte Ltd- WIC')).toBe('Riverstone Plastics Pte Ltd')
    expect(clientSegment('FW: (TRS) Zenith- Example Association Corporate Insurance 2027')).toBe('Example Association')
  })
  it('reads the "TRS<>Insurer Client – line" form', () => {
    expect(clientSegment('RE: TRS<>ZEN Lotus Temple – CAR, Public Liability and Performance Bond Quotation')).toBe('Lotus Temple')
  })
  it('gives nothing for subjects with no client part', () => {
    expect(clientSegment('Out of office')).toBeNull()
    expect(clientSegment('(TRS) WIC')).toBeNull()
    expect(clientSegment(null)).toBeNull()
  })
})
