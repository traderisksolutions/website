/**
 * Phase 2 of the agents learning the broker's method: the document register and the binding gate.
 */
import { describe, it, expect } from 'vitest'
import { requiredDocuments, detectReceived, gateState, missingLines, DOC_LABEL, type Required } from '@/lib/admin/b/documents/gate'
import { composeRelay, type RelayFacts } from '@/lib/admin/b/relay/compose'
import { buildDraft } from '@/lib/admin/b/drafts'

const today = '2026-11-02'

describe('requiredDocuments', () => {
  it('a new construction placement needs the instruction, a proposal form and a signed slip', () => {
    const kinds = requiredDocuments({ caseType: 'new_quote', line: 'construction_car', today }).map(r => r.kind)
    expect(kinds).toEqual(['client_instruction', 'proposal_form', 'quote_slip'])
  })
  it('a financial-lines renewal needs a fresh form; a simple general renewal does not', () => {
    expect(requiredDocuments({ caseType: 'renewal', line: 'professional_indemnity', today }).map(r => r.kind)).toContain('proposal_form')
    expect(requiredDocuments({ caseType: 'renewal', line: 'commercial_vehicle', today }).map(r => r.kind)).not.toContain('proposal_form')
  })
  it('backdated cover needs a letter of undertaking of nil claims, with the dates in the basis', () => {
    const r = requiredDocuments({ caseType: 'new_quote', line: 'general_liability', today, startDate: '2026-10-12', instructedOn: '2026-10-16' })
    const lou = r.find(x => x.kind === 'lou_nil_claims')
    expect(lou?.basis).toContain('12 Oct 2026')
    expect(lou?.basis).toContain('16 Oct 2026')
    expect(requiredDocuments({ caseType: 'new_quote', line: 'general_liability', today, startDate: '2026-11-02', instructedOn: '2026-11-02' }).some(x => x.kind === 'lou_nil_claims')).toBe(false)
  })
  it('a lapsed renewal needs the no-change confirmation; another broker on risk needs an appointment letter', () => {
    expect(requiredDocuments({ caseType: 'renewal', line: 'wica', today, expiry: '2026-10-20' }).map(r => r.kind)).toContain('no_change_confirmation')
    expect(requiredDocuments({ caseType: 'renewal', line: 'wica', today, expiry: '2026-11-20' }).map(r => r.kind)).not.toContain('no_change_confirmation')
    expect(requiredDocuments({ caseType: 'new_quote', line: 'wica', today, otherBrokerOnRisk: true }).map(r => r.kind)).toContain('broker_appointment')
  })
  it('a bond needs the deed, the resolution, the counter-indemnity, the accounts and the contract', () => {
    const kinds = requiredDocuments({ caseType: 'new_quote', line: 'surety_bonds', today }).map(r => r.kind)
    expect(kinds).toEqual(['client_instruction', 'contract_requirements', 'company_documents', 'deed_of_indemnity', 'board_resolution', 'counter_indemnity'])
  })
  it('claims and member movements have their own one document', () => {
    expect(requiredDocuments({ caseType: 'claim', line: null, today }).map(r => r.kind)).toEqual(['claim_form'])
    expect(requiredDocuments({ caseType: 'member_movement', line: null, today }).map(r => r.kind)).toEqual(['member_list'])
    expect(requiredDocuments({ caseType: 'enquiry', line: null, today })).toEqual([])
  })
})

describe('detectReceived', () => {
  const req: Required[] = requiredDocuments({ caseType: 'new_quote', line: 'construction_car', today, startDate: '2026-10-12', instructedOn: '2026-10-16' })
  it('reads signed forms, slips and the letter of undertaking from the client\'s files', () => {
    const got = detectReceived(req, { messages: [
      { id: 'm1', side: 'client', sent_at: '2026-10-16', text: 'Please find attached the signed documents.', files: ['Proposal Form - Example.pdf', 'Quote Slip NB123.pdf', 'image001.png'] },
      { id: 'm2', side: 'client', sent_at: '2026-10-17', text: 'As requested.', files: ['LOU nil claims - signed.pdf'] },
      { id: 'm3', side: 'insurer', sent_at: '2026-10-17', text: 'Signed slip attached.', files: ['Quote Slip NB123 signed.pdf'] },
    ] }, 'm1')
    expect(got.map(g => g.kind).sort()).toEqual(['client_instruction', 'lou_nil_claims', 'proposal_form', 'quote_slip'])
    expect(got.find(g => g.kind === 'proposal_form')?.message_id).toBe('m1')
  })
  it('does not count an unsigned form or a file from the insurer side', () => {
    const got = detectReceived(req, { messages: [
      { id: 'm1', side: 'client', sent_at: '2026-10-16', text: 'Attached for your review.', files: ['Proposal Form - Example.pdf'] },
      { id: 'm3', side: 'insurer', sent_at: '2026-10-17', text: 'signed', files: ['Quote Slip NB123 signed.pdf'] },
    ] })
    expect(got).toEqual([])
  })
  it('reads a no-change confirmation from the client\'s words', () => {
    const r = requiredDocuments({ caseType: 'renewal', line: 'wica', today, expiry: '2026-10-20' })
    const got = detectReceived(r, { messages: [{ id: 'm1', side: 'client', sent_at: today, text: 'Please renew. There are no claims or material changes to declare.', files: [] }] })
    expect(got.map(g => g.kind)).toContain('no_change_confirmation')
  })
})

describe('gateState and the asks', () => {
  const req = requiredDocuments({ caseType: 'new_quote', line: 'construction_car', today })
  it('is complete only when every requirement is received or waived', () => {
    expect(gateState(req, []).complete).toBe(false)
    const s = gateState(req, [{ kind: 'client_instruction', status: 'received' }, { kind: 'proposal_form', status: 'received' }, { kind: 'quote_slip', status: 'waived', note: 'insurer issues on email confirmation' }])
    expect(s.complete).toBe(true)
    expect(s.waived).toEqual(['quote_slip'])
  })
  it('names the missing documents in the client\'s terms, numbered, after thanking for the instruction', () => {
    const missing = gateState(req, [{ kind: 'client_instruction', status: 'received' }]).missing
    const f: RelayFacts = { greetingName: 'Serene', clientName: 'Example Client Pte Ltd', insurerName: 'Example Insurer', lineLabel: null, policyNumber: null, className: null, threadSubject: 'Re: Office cover', title: 'Office cover', documents: missingLines(missing), instructed: true }
    const b = composeRelay('request_documents', f).body
    expect(b).toContain('Thank you for your instructions to proceed on Office cover.')
    expect(b).toContain(`1. ${DOC_LABEL.proposal_form}\n2. ${DOC_LABEL.quote_slip}`)
    expect(b).toContain('Before Example Insurer can bind, we need:')
  })
  it('the chaser\'s follow-up is numbered with a thank-you', () => {
    const b = buildDraft('request_documents', { greetingName: 'Serene', clientName: 'Example Client Pte Ltd', title: 'Office cover', policyNumber: null, insurerName: 'Example Insurer', insurerRef: null, claimant: null, lossDate: null, threadSubject: 'Re: Office cover', items: [DOC_LABEL.proposal_form], round: 2 }).body
    expect(b).toContain('Following up on the documents below')
    expect(b).toContain(`1. ${DOC_LABEL.proposal_form}`)
    expect(b).toContain('Thank you!')
  })
})
