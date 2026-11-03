import { describe, it, expect } from 'vitest'
import { selectForms, flowOf, toAttachment, type ClientForm } from '@/lib/forms/library'
import { buildDraft, formsLine } from '@/lib/admin/b/drafts'
import { liabilityFlow } from '@/lib/placement/lines'

const form = (o: Partial<ClientForm>): ClientForm => ({ id: Math.random().toString(36), line: 'general_liability', flow: null, kind: 'proposal_form', insurer: null, title: 't', filename: 'pl.pdf', mime_type: 'application/pdf', file_ref: 'a/b/pl.pdf', attach_on: ['new_request', 'renewal'], active: true, sent_count: 1, last_sent: null, note: null, ...o })
const LIB = [
  form({ filename: 'pl-excluding-contract-works.pdf', sent_count: 4 }),
  form({ filename: 'chubb-cgl.pdf', flow: 'products', sent_count: 2 }),
  form({ filename: 'liberty-events.pdf', flow: 'event' }),
  form({ filename: 'shopcare.pdf', flow: 'sme', kind: 'brochure' }),
  form({ filename: 'old.pdf', active: false, sent_count: 9 }),
  form({ filename: 'work-guard.pdf', line: 'wica' }),
  form({ filename: 'claim.pdf', line: 'wica', kind: 'claim_form' }),
]

describe('client forms', () => {
  it('a product-liability request gets the CGL form first, then the general form', () => {
    expect(selectForms(LIB, { line: 'general_liability', flow: 'products', on: 'new_request' }).map(f => f.filename)).toEqual(['chubb-cgl.pdf', 'pl-excluding-contract-works.pdf'])
  })
  it('an event gets the events form; brochures, claim forms and retired forms are never attached to a data request', () => {
    expect(selectForms(LIB, { line: 'general_liability', flow: 'event', on: 'new_request' }).map(f => f.filename)).toEqual(['liberty-events.pdf', 'pl-excluding-contract-works.pdf'])
    expect(selectForms(LIB, { line: 'general_liability', flow: 'sme', on: 'new_request' }).map(f => f.filename)).toEqual(['pl-excluding-contract-works.pdf'])
    expect(selectForms(LIB, { line: 'wica', flow: null, on: 'renewal' }).map(f => f.filename)).toEqual(['work-guard.pdf'])
  })
  it('a form only for new requests is not attached to a renewal', () => {
    expect(selectForms([form({ attach_on: ['new_request'] })], { line: 'general_liability', flow: null, on: 'renewal' })).toEqual([])
  })
  it('reads the liability flow from the request, including events', () => {
    expect(liabilityFlow({ fields: { purpose: 'PL for an indoor event at a hotel ballroom' } })).toBe('event')
    expect(flowOf('general_liability', { fields: { purpose: 'tender requirement' } })).toBe('contract')
    expect(flowOf('wica', {})).toBeNull()
  })
  it('a stored file and a Gmail file both attach by reference', () => {
    expect(toAttachment(form({ file_ref: 'gmail:abc', filename: 'x.xlsx' }))).toEqual({ filename: 'x.xlsx', mime_type: 'application/pdf', storage_url: 'gmail:abc' })
  })
  it('the data request names the attached forms', () => {
    expect(formsLine(['Proposal_Form_Public_Liability.pdf'])).toBe('Attached is the Proposal_Form_Public_Liability for you to complete and return.\n\n')
    expect(formsLine([])).toBe('')
    const d = buildDraft('request_quote_data', { title: 'Public liability', items: ['Why the cover is needed'], files: ['PL proposal form.pdf', 'WICA Employee Breakdown.xlsx'] } as never)
    expect(d.body).toMatch(/Attached for you to complete and return: PL proposal form; WICA Employee Breakdown\./)
  })
})
