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

  it('leaves a notice as Other whatever else it says', () => {
    expect(labelOf({ subject: 'Automatic reply: Claim form' })).toEqual({ label: 'other', basis: 'not casework: automatic reply' })
    expect(label('[Auto-acknowledgement] Claim received')).toBe('other')
    expect(label('<Important> Online payment services maintenance on 3 May')).toBe('other')
    expect(label('To do · 12 items · Mon 2 Nov')).toBe('other')
    expect(label('Recall: Renewal notice')).toBe('other')
    // Not casework: the first email is not read.
    expect(labelOf({ subject: 'Webinar on cyber risk', opening: 'We would like to request a quotation.', messages: [{ party: 'client' }] }).label).toBe('other')
    expect(label('Fire evacuation drill', [{ party: 'internal' }])).toBe('other')
    expect(label('Request for survey report', [{ party: 'partner', attachments: ['Medical report.pdf'] }])).toBe('claim')
  })

  it('reads a vehicle sold and an extension of cover as an endorsement', () => {
    expect(label('Sold SAB1234C')).toBe('endorsement')
    expect(label('Car sold away SAB1234C')).toBe('endorsement')
    expect(label('Extension of cover to 31 Dec')).toBe('endorsement')
    expect(label('Request for extension for annual returns')).toBe('other')
  })

  it('does not count a signature picture as an insurer file', () => {
    expect(label('RFQ: marine cargo', [{ party: 'insurer', attachments: ['image001.png'] }])).toBe('quotation_request')
  })

  it('reads the first email when the subject says nothing', () => {
    const from = (party: string, opening: string) => labelOf({ subject: 'As discussed', opening, messages: [{ party }] })
    expect(from('internal', 'Dear Mei, We would like to request a quotation for the vehicle below.')).toEqual({ label: 'quotation_request', basis: 'first email: would like to request' })
    expect(from('internal', 'We wish to work with you on the following project.').label).toBe('quotation_request')
    expect(from('insurer', 'We are pleased to quote as follows.').label).toBe('quote_received')
    expect(from('client', 'Our employee was admitted on 3 May.').label).toBe('claim')
    expect(from('insurer', 'Welcome. Your enrolment has been confirmed. Submit your claims online.').label).toBe('member_movement')
    expect(from('internal', 'Please find attached the debit note.').label).toBe('payment')
    expect(from('client', 'The policy is due to expire next month.').label).toBe('renewal')
    // A request to an insurer for terms wins over the renewal it mentions; the bare word is not enough.
    expect(from('internal', 'We are approached by Northgate Freight to assist in their motor fleet renewal.').label).toBe('quotation_request')
    expect(from('client', 'We need to renew the policy this year.').label).toBe('renewal')
    expect(from('internal', 'Renewal reminders are in the folder.').label).toBe('other')
    expect(from('partner', 'Your passcode expires in ten minutes.').label).toBe('other')
    expect(from('client', 'Thank you for lunch.').label).toBe('other')
  })

  it("asks more of an insurer's first email", () => {
    const insurer = (opening: string) => labelOf({ subject: 'As discussed', opening, messages: [{ party: 'insurer' }] }).label
    expect(insurer('Manage your renewal online. Download a proposal form or request a quotation here.')).toBe('other')
    expect(insurer('Please find the renewal notice for the policy below.')).toBe('renewal')
  })

  it('reads the files when the subject and the first email say nothing', () => {
    const files = (party: string, ...attachments: string[]) => labelOf({ subject: 'As discussed', messages: [{ party, attachments }] })
    expect(files('client', 'ACRA BizFile.pdf')).toEqual({ label: 'quotation_request', basis: 'file: acra bizfile.pdf' })
    expect(files('insurer', 'Proposal Form.pdf').label).toBe('quote_received')
    expect(files('internal', 'DD Questionnaire.pdf').label).toBe('other')
    expect(files('insurer', 'Tax Invoice 123.pdf').label).toBe('payment')
    expect(files('client', 'Payment advice.pdf').label).toBe('payment')
    expect(files('client', 'Medical report.pdf').label).toBe('claim')
    expect(files('client', 'Name list Nov.xlsx').label).toBe('member_movement')
  })

  it('reads a cover named in the subject as a quotation request, unless an insurer started the thread', () => {
    expect(labelOf({ subject: 'Performance bond for the new project', messages: [{ party: 'client' }] })).toEqual({ label: 'quotation_request', basis: 'subject names a cover: performance bond' })
    expect(label('Performance bond for the new project', [{ party: 'insurer' }])).toBe('other')
    expect(label('Performance bond for the new project')).toBe('other')
  })

  it('states what it matched on', () => {
    expect(labelOf({ subject: 'FW: Claim form' }).basis).toBe('subject: claim')
    expect(labelOf({ subject: '' })).toEqual({ label: 'other', basis: 'no rule matched' })
  })
})
