import { describe, it, expect } from 'vitest'
import { labelOf, plainSubject, isLabel, LABELS, LABEL_NAME } from '../labels'

const label = (subject: string, messages?: { party: string; attachments?: string[] }[]) => labelOf({ subject, messages }).label

describe('plainSubject', () => {
  it('drops reply and forward prefixes and bracketed tags', () => {
    expect(plainSubject('RE: FW: [EXTERNAL] Re: Renewal of Group Policy')).toBe('renewal of group policy')
    expect(plainSubject('回复: Fwd:  Claim   form')).toBe('claim form')
    expect(plainSubject(null)).toBe('')
  })
})

describe('labelOf', () => {
  it('names every label', () => { for (const l of LABELS) expect(LABEL_NAME[l]).toBeTruthy(); expect(isLabel('claim')).toBe(true); expect(isLabel('rfq')).toBe(false) })

  it('reads the subject, first rule first', () => {
    expect(label('Claim submission for John Tan')).toBe('claim')
    expect(label('RE: Letter of Guarantee request')).toBe('claim')
    expect(label('Endorsement no. 3: change of address')).toBe('endorsement')
    expect(label('Addition of 2 new staff wef 1 Nov')).toBe('member_movement')
    expect(label('Deletion of employee')).toBe('member_movement')
    expect(label('Debit note DN-2231 overdue')).toBe('payment')
    expect(label('Request for quotation: public liability')).toBe('quotation_request')
    expect(label('Renewal of Employee Benefits 2027')).toBe('renewal')
    expect(label('Policy schedule for your records')).toBe('document')
    expect(label('Lunch on Friday')).toBe('other')
  })

  it('does not call a claims experience report a claim', () => {
    expect(label('Claims experience for renewal')).toBe('renewal')
    expect(label('Claim ratio 2026')).toBe('other')
  })

  it('does not call a cover by its name a claim', () => {
    expect(label('Request for quotation - Work Injury Compensation')).toBe('quotation_request')
    expect(label('Renewal of Group Hospitalisation & Surgical')).toBe('renewal')
    expect(label('WICA renewal 2027')).toBe('renewal')
    expect(label('Group Personal Accident quotation')).toBe('quotation_request')
    expect(label('Work Injury Compensation claim - J Tan')).toBe('claim')
    expect(label('Hospitalisation of J Tan')).toBe('claim')
    expect(label('Worker injured on site')).toBe('claim')
  })

  it('a renewal invoice is a payment, an endorsement on a claim subject stays a claim', () => {
    expect(label('Renewal invoice for policy 12345')).toBe('payment')
    expect(label('Claim: endorsement needed')).toBe('claim')
  })

  it('an insurer file turns a quotation or renewal thread into a quote received', () => {
    const insurer = [{ party: 'client' }, { party: 'insurer', attachments: ['Quotation_ABC.pdf'] }]
    expect(labelOf({ subject: 'Renewal of group hospital', messages: insurer })).toEqual({ label: 'quote_received', basis: 'insurer file: quotation_abc.pdf' })
    expect(label('RFQ: marine cargo', [{ party: 'insurer', attachments: ['scan001.pdf'] }])).toBe('quote_received')
    // The client's own file changes nothing.
    expect(label('RFQ: marine cargo', [{ party: 'client', attachments: ['proposal form.pdf'] }])).toBe('quotation_request')
    expect(label('Renewal of group hospital', [{ party: 'insurer', attachments: ['census.xlsx'] }])).toBe('renewal')
  })

  it('falls back to a document file when the subject says nothing', () => {
    expect(labelOf({ subject: 'As discussed', messages: [{ party: 'insurer', attachments: ['Policy Schedule 2026.pdf'] }] })).toEqual({ label: 'document', basis: 'file: policy schedule 2026.pdf' })
  })

  it('states what it matched on', () => {
    expect(labelOf({ subject: 'FW: Claim form' }).basis).toBe('subject: claim')
    expect(labelOf({ subject: '' })).toEqual({ label: 'other', basis: 'no rule matched' })
  })
})
