import { describe, it, expect } from 'vitest'
import { detectIntent, detectLine, listedAsks, docTypesOf } from '../relay/intent'
import { extractQuoteTerms, termsRows, missingForQuote } from '../relay/terms'
import { composeRelay, relayPairFor, CLASS_OF, PARTY_OF } from '../relay/compose'

const client = (subject: string, text: string, files: string[] = [], caseType: string | null = 'new_quote') => detectIntent({ side: 'client', subject, text, files, caseType })
const market = (subject: string, text: string, files: string[] = [], caseType: string | null = 'new_quote') => detectIntent({ side: 'market', subject, text, files, caseType })

describe('intent: client side', () => {
  it('a quote request with an expiry', () => {
    const r = client('(TRS) Acme - Cyber Insurance Renewal 2026', 'Hi, our cyber insurance will expire by 15 Nov 2026. Would you please provide your best price for the renewal as soon as possible? Thanks.')
    expect(r.intent).toBe('quote_request'); expect(r.confidence).toBe('high')
  })
  it('a quote request carrying a proposal form', () => {
    expect(client('PI insurance', 'Please find the completed form attached. We would like a quotation.', ['Acme PI Proposal Form.pdf']).intent).toBe('quote_request')
  })
  it('a document request', () => {
    expect(client('Policy copy', 'Could you send us a copy of the policy schedule for our WICA cover? Our auditor is asking.').intent).toBe('document_request')
    expect(client('COI', 'Please send over the certificate of insurance for the Tuas site.').intent).toBe('document_request')
  })
  it('an instruction to proceed', () => {
    expect(client('RE: WICA renewal quotation', 'Please proceed with the Zurich quotation. Signed proposal attached.', ['Proposal signed.pdf']).intent).toBe('instruction')
    expect(client('RE: terms', 'We accept the terms. Please go ahead to bind.').intent).toBe('instruction')
  })
  it('a question about cover', () => {
    const r = client('RE: GHS policy', 'Is dental covered under our current plan? One of our staff is asking.')
    expect(r.intent).toBe('cover_question'); expect(r.confidence).toBe('high')
  })
  it('a change request and a member list', () => {
    expect(client('Staff movement', 'Please add the following new staff to the policy with effect from 1 Nov.').intent).toBe('change_request')
    expect(client('Movement Oct', 'Attached.', ['Member movement Oct 2026.xlsx']).intent).toBe('change_request')
  })
  it('a claim notice when the case is not yet a claim', () => {
    expect(client('Claim - Viji Services', 'We would like to submit a claim for non-payment. Attached are the invoices and the statement of account.', ['SOA.pdf']).intent).toBe('claim_notify')
  })
  it('documents provided on a claim case are docs, not a new claim', () => {
    expect(client('RE: Claim - Bandari', 'Please find attached the medical report and the MC.', ['MC 12-18 Oct.pdf'], 'claim').intent).toBe('docs_provided')
  })
  it('a chase from the client', () => {
    expect(client('RE: GTL renewal', 'I wish to follow up on the status of the renewal as I have not heard back since my previous email.').intent).toBe('client_chase')
  })
  it('thanks only', () => {
    expect(client('RE: revised quotation', 'We have received your revised quotation. Thank you very much.').intent).toBe('thanks')
  })
  it('nothing fires on an empty message', () => {
    expect(client('RE:', '').intent).toBe('none')
  })
})

describe('intent: market side', () => {
  it('an acknowledgement', () => {
    const r = market('RE: TRS (QBE) : Bakuun - Movement of Staff', 'Hi Catherine, thank you for your email. We will proceed to update accordingly.')
    expect(r.intent).toBe('market_ack'); expect(r.confidence).toBe('high')
  })
  it('a decline', () => {
    expect(market('RE: (TRS) CTPIS - Steven Roads', 'Regretfully, we are not keen to provide GPA coverage in this instance.').intent).toBe('decline')
    expect(market('RE: (TRS) TMIS - BLL FG', 'Many thanks for reaching out. However, as this is a standalone FG, we would not be keen.').intent).toBe('decline')
  })
  it('a quote with money, or a quotation attached', () => {
    const r = market('RE: (TRS) Zurich - JGC WICA', 'Please find our terms: annual premium of S$12,476.58 before GST, period 1 Jan 2027 to 31 Dec 2027.')
    expect(r.intent).toBe('quote_received')
    expect(market('RE: renewal', 'Attached.', ['Acme WICA Quotation 2027.pdf']).intent).toBe('quote_received')
  })
  it('policy documents attached', () => {
    expect(market('RE: (TRS) HLAS - E39', 'Please find attached the cover note for CAR and EL. Thank you.', ['Cover Note CAR EL.pdf']).intent).toBe('documents_received')
  })
  it('a debit note or endorsement', () => {
    expect(market('Endorsement 7', 'Please find attached the tax invoice for endorsement 7.', ['GE FWMI Endorsement 7 - Tax Invoice.pdf']).intent).toBe('insurer_note')
  })
  it('a claim decision', () => {
    expect(market('RE: Claim - Bandari', 'We are pleased to inform that the claim has been approved and the settlement of S$1,200 will be paid.', [], 'claim').intent).toBe('claim_decision')
  })
  it('an insurer asking for information', () => {
    const r = market('RE: (TRS) GE - West 1800 Dormitory', 'Dear Nathan, please advise additional information:\n1. Description of material stored\n2. Value of the equipment\n3. Site fencing and access control')
    expect(r.intent).toBe('market_question'); expect(r.confidence).toBe('high')
    expect(listedAsks(r.cues.length ? 'x\n1. Description of material stored\n2. Value of the equipment' : '')).toHaveLength(2)
  })
  it('an insurer chasing', () => {
    expect(market('RE: LOA', 'Following up on the letters of appointment. Any update?').intent).toBe('market_chase')
  })
})

describe('lines and listed asks', () => {
  it('names the line from vocabulary', () => {
    expect(detectLine('our WICA policy')).toBe('wica')
    expect(detectLine('quote for group hospital and surgical')).toBe('group_health')
    expect(detectLine('fleet of 12 lorries')).toBe('commercial_vehicle')
    expect(detectLine('professional indemnity for the firm')).toBe('professional_indemnity')
    expect(detectLine('anything else')).toBeNull()
    expect(detectLine('anything', 'cyber')).toBe('cyber')
  })
  it('reads numbered and bulleted asks, not signature lines', () => {
    expect(listedAsks('please provide:\n1. Contract value\n2) Project period\n- Site address\nTel: 6123 4567')).toEqual(['Contract value', 'Project period', 'Site address'])
  })
  it('classifies files and drops images', () => {
    expect(docTypesOf(['image001.png', 'Quotation ABC.pdf', 'Member list.xlsx'])).toEqual(['quotation', 'member_list'])
  })
})

describe('quote terms and missing information', () => {
  it('copies only what the quote states', () => {
    const q = extractQuoteTerms('Our annual premium is S$12,476.58 before GST. Period of insurance from 1 Jan 2027 to 31 Dec 2027. Excess S$500 each and every claim. Quotation ref: Q-2027-0042. Valid for 30 days.')
    expect(q.premium).toBe('S$12,476.58'); expect(q.period).toBe('1 Jan 2027 to 31 Dec 2027'); expect(q.excess).toBe('S$500'); expect(q.reference).toBe('Q-2027-0042'); expect(q.validity).toBe('30 days')
    expect(q.limit).toBeNull(); expect(q.sumInsured).toBeNull()
    expect(termsRows(q).map(r => r[0])).toEqual(['Premium', 'Period', 'Excess', 'Quote reference', 'Valid'])
  })
  it('asks only for what the client did not give', () => {
    expect(missingForQuote('wica', 'We have 42 staff; wages listing attached.', ['member_list', 'claims_history', 'policy_schedule'])).toEqual([])
    expect(missingForQuote('wica', 'Please quote WICA for us.', [])).toEqual(['Headcount and annual wages by occupation', 'Claims history for the last 3 years', 'Current policy schedule'])
    expect(missingForQuote('professional_indemnity', 'Proposal form attached, turnover S$2.1m, limit S$1m.', ['proposal_form'])).toEqual([])
    expect(missingForQuote(null, 'anything', [])).toEqual([])
  })
})

describe('composition', () => {
  const base = { greetingName: 'Mei', clientName: 'Acme Pte Ltd', insurerName: 'Zurich', lineLabel: 'Work Injury Compensation (WICA)', policyNumber: 'W123', className: 'WICA', threadSubject: 'WICA renewal', title: 'WICA renewal 2027' }
  it('pairs forwards with a client ack and relays of terms with an insurer ack', () => {
    expect(relayPairFor('forward_quote_request')).toBe('ack_client'); expect(relayPairFor('relay_quote')).toBe('ack_insurer'); expect(relayPairFor('request_info')).toBeNull()
    expect(PARTY_OF.forward_instruction).toBe('insurer'); expect(PARTY_OF.relay_question).toBe('client'); expect(CLASS_OF.ack_client).toBe('ack'); expect(CLASS_OF.relay_quote).toBe('relay')
  })
  it('a forward quotes the client and names the files; the ack names the insurers approached', () => {
    const f = composeRelay('forward_quote_request', { ...base, original: { from: 'mei@acme.example', sent_at: '2026-11-02', subject: 'WICA renewal', text: 'Please quote.' }, files: ['Wages.xlsx'] })
    expect(f.subject).toBe('(TRS) Zurich - Acme Pte Ltd | Work Injury Compensation (WICA)')
    expect(f.body).toContain('Attached: Wages.xlsx.'); expect(f.body).toContain('From: mei@acme.example'); expect(f.body).toContain('{owner_name}')
    expect(composeRelay('ack_client', { ...base, insurersApproached: ['Zurich', 'Chubb'] }).body).toContain('passed this to Zurich, Chubb today')
  })
  it('a relayed quote lists only stated terms and leaves blanks out', () => {
    const r = composeRelay('relay_quote', { ...base, terms: extractQuoteTerms('Premium S$1,000. Valid for 14 days.'), files: ['Q.pdf'] })
    expect(r.body).toContain('Premium: S$1,000'); expect(r.body).toContain('Valid: 14 days'); expect(r.body).not.toContain('Excess'); expect(r.subject).toBe('Re: WICA renewal')
  })
  it('a request for information lists exactly the missing items', () => {
    const r = composeRelay('request_info', { ...base, missing: ['Headcount and annual wages by occupation', 'Claims history for the last 3 years'] })
    expect(r.body).toContain('- Headcount and annual wages by occupation\n- Claims history for the last 3 years')
  })
  it('an answer cites its sources and a status update says who is waited on', () => {
    expect(composeRelay('answer_question', { ...base, answers: [{ fact: 'WICA No. W123 with Zurich, 2026-01-01 to 2026-12-31', source: 'policy record' }], files: ['Schedule.pdf'] }).body).toContain('(policy record)')
    expect(composeRelay('status_update', { ...base, waitingOn: 'insurer', lastSent: '2026-10-20' }).body).toContain('waiting for Zurich to revert; we last wrote to them on 20 Oct 2026')
  })
})
