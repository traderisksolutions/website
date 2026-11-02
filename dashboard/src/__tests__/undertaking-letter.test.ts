/** The letter of undertaking of nil claims: TRS's own template, filled from the case. */
import { describe, it, expect } from 'vitest'
import { undertakingParts, undertakingProblems, undertakingFileName } from '@/lib/letters/undertaking'

const letter = {
  clientName: 'Example Builders Pte Ltd', insurerName: 'Example Insurer Limited', insurerAddress: ['1 Example Street', '#01-01', 'Singapore 000000'],
  classOfPolicy: "Contractors' All Risks & Project Employers' Liability", projectTitle: 'Proposed erection of a 9-storey factory at Example Road',
  projectPeriod: '12 months from 22 April 2026 + 6 months buffer + 18 months defects liability period', startDate: '2026-04-22', date: '2026-08-05',
}

describe('undertakingParts', () => {
  it('prints the template: letterhead note, insurer address, the three-row table, the request, the nil-claims confirmation with both dates, the indemnity', () => {
    const p = undertakingParts(letter)
    expect(p.letterhead).toEqual(['INSURED NAME & ADDRESS', '(TO PRINT ON LETTER HEAD)'])
    expect(p.date).toBe('5 August 2026')
    expect(p.addressee).toEqual(['Example Insurer Limited', '1 Example Street', '#01-01', 'Singapore 000000'])
    expect(p.table[1]).toEqual(['PROJECT TITLE', 'PROPOSED ERECTION OF A 9-STOREY FACTORY AT EXAMPLE ROAD'])
    expect(p.body[0]).toBe('We are writing to request your agreement to issue the above policy to commence on 22 April 2026.')
    expect(p.body[1]).toContain('for the period 22 April 2026 until 5 August 2026')
    expect(p.body[1]).toContain('undertake to indemnify Example Insurer Limited')
    expect(p.signature).toBe('Authorised Signatory & Company Stamp')
  })
  it('leaves the address for the broker when the insurer has none on file', () => {
    expect(undertakingParts({ ...letter, insurerAddress: null }).addressee).toEqual(['Example Insurer Limited', '[Address]'])
  })
  it('refuses a letter with the start date after the signing date, since none is needed', () => {
    expect(undertakingProblems({ ...letter, startDate: '2026-09-01' })).toEqual(['The start date is after the signing date; no undertaking is needed.'])
    expect(undertakingProblems(letter)).toEqual([])
  })
  it('names the file by client and insurer', () => {
    expect(undertakingFileName(letter, 'pdf')).toBe('Letter of Undertaking - Example Builders Pte Ltd - Example Insurer Limited.pdf')
  })
})
