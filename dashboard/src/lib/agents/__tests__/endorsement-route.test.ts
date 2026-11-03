import { describe, it, expect } from 'vitest'
import { policiesTouched, voiceOf } from '../endorsement/route'

const internal = (e: string | null | undefined) => /@trade-risksol\.com$/i.test(e ?? '')

describe('endorsement main agent: voice', () => {
  it('reads a staff forward as the client who wrote it', () => {
    const v = voiceOf({
      from_address: 'nathan.budiutomo@trade-risksol.com', subject: 'FW: Addition of staff',
      body_text: 'Ops, pls process.\n\n---------- Forwarded message ---------\nFrom: Asta Zhou <asta@hellobike.com>\nDate: Mon, 20 Oct 2026 at 17:38\nSubject: Addition of staff\nTo: Nathan <nathan.budiutomo@trade-risksol.com>\n\nHi Nathan,\nPlease add Tan Ah Kow from 1 Nov 2026.\nThanks',
    }, internal)
    expect(v.kind).toBe('staff_forward')
    expect(v.from).toBe('asta@hellobike.com')
    expect(v.forwardedBy).toBe('nathan.budiutomo@trade-risksol.com')
    expect(v.body).toMatch(/Please add Tan Ah Kow from 1 Nov 2026/)
  })
  it('a staff email that forwards nothing is staff; a client is a client', () => {
    expect(voiceOf({ from_address: 'catherine.lim@trade-risksol.com', subject: 'Re: movement', body_text: 'Dear QBE, please add the below.' }, internal).kind).toBe('staff')
    expect(voiceOf({ from_address: 'hr@client.com', subject: 'Staff', body_text: 'x' }, internal).kind).toBe('client')
    expect(voiceOf({ from_address: 'eb@qbe.com', subject: 'Debit note', body_text: 'x' }, internal, true).kind).toBe('insurer')
  })
})

describe('endorsement main agent: policies touched', () => {
  const pols = [
    { id: 'ghs', policy_number: 'GMB-N0019768', line: 'employee_benefits' },
    { id: 'gtl', policy_number: '3111743', line: 'employee_benefits' },
    { id: 'fwmi', policy_number: 'A5755531', line: 'foreign_worker_medical' },
    { id: 'wic', policy_number: 'B0047620', line: 'wica' },
  ]
  const lineOf = (p: { line: string }) => p.line
  const ids = (r: { policies: { id: string }[] }) => r.policies.map(p => p.id)
  it('a policy number wins', () => {
    expect(ids(policiesTouched(pols, 'Addition to FWMI A5755531', lineOf, true))).toEqual(['fwmi'])
  })
  it('splits an email that names two lines', () => {
    expect(ids(policiesTouched(pols, 'Please provide a name list of FWMI & Employee Benefits', lineOf, true))).toEqual(['ghs', 'gtl', 'fwmi'])
    expect(ids(policiesTouched(pols, 'Kindly add PBE Axell to our WIC', lineOf, false))).toEqual(['wic'])
  })
  it('an unmarked staff list goes to the EB policies; anything else touches nothing', () => {
    expect(ids(policiesTouched(pols, 'New staff: 1. Tan Ah Kow - 1 Nov', lineOf, true))).toEqual(['ghs', 'gtl'])
    expect(policiesTouched(pols, 'Thanks for the lunch', lineOf, false).basis).toBe('none')
  })
})
