import { describe, it, expect } from 'vitest'
import { classify, expectsReply, defaultSchedule, addDays, chaseText } from '@/lib/followups/rules'
import { eligibility } from '@/lib/autonomy/rules'

describe('follow-up types', () => {
  it('reads the type of a sent email', () => {
    expect(classify({ subject: '(TRS) EQ - Example | PL Request', body: 'Dear Chia Li,\nWe would like to request a Public Liability quotation for the following:', party: 'insurer' })).toBe('request_for_quote')
    expect(classify({ subject: 'Re: WIC renewal', body: 'Dear Mei, may we have the headcount by category?', party: 'client' })).toBe('renewal')
    expect(classify({ subject: 'Example - documents', body: 'Hi, kindly provide the signed proposal form and ACRA.', party: 'client' })).toBe('docs_request')
    expect(classify({ subject: 'Re: Claim - worker injury', body: 'Please find the claim form attached.', party: 'insurer' })).toBe('claim')
    expect(classify({ subject: 'Debit note DN261001', body: 'Please find attached the debit note.', party: 'client' })).toBe('billing')
    expect(classify({ subject: 'Policy documents', body: 'Please find attached the policy documents and cover note for your records.', party: 'client' })).toBe('policy_docs')
    expect(classify({ subject: 'Re: Quote', body: 'May I check on my email of 1 Oct 2026 on the quote?', party: 'insurer' })).toBe('chase')
    expect(classify({ subject: 'x', body: 'y', party: 'client', draftKind: 'request_quote_data' })).toBe('docs_request')
  })
  it('only emails that ask something wait on a reply', () => {
    expect(expectsReply('policy_docs', 'attached')).toBe(false)
    expect(expectsReply('acknowledgement', 'thanks')).toBe(false)
    expect(expectsReply('other', 'Noted with thanks.')).toBe(false)
    expect(expectsReply('other', 'Could you confirm the date?')).toBe(true)
    expect(expectsReply('request_for_quote', '')).toBe(true)
  })
})

describe('chase schedule', () => {
  it("follows Nathan's cadence by party", () => {
    expect(defaultSchedule('insurer', 'request_for_quote')).toEqual({ firstAfterDays: 3, everyDays: 5, workingDays: true, maxChases: 3 })
    expect(defaultSchedule('insurer', 'claim').firstAfterDays).toBe(5)
    expect(defaultSchedule('client', 'docs_request')).toEqual({ firstAfterDays: 7, everyDays: 7, workingDays: false, maxChases: 3 })
  })
  it('counts working days over a weekend', () => {
    expect(addDays('2026-11-06T02:00:00.000Z', 3, true).slice(0, 10)).toBe('2026-11-11')   // Fri + 3 working days = Wed
    expect(addDays('2026-11-06T02:00:00.000Z', 3, false).slice(0, 10)).toBe('2026-11-09')
  })
  it('chases on the same thread in plain words', () => {
    const c = chaseText({ party: 'insurer', round: 1, subject: '(TRS) EQ - Example | PL Request', sentAt: '2026-10-01T03:00:00Z', greeting: 'Chia' })
    expect(c.subject).toBe('Re: (TRS) EQ - Example | PL Request')
    expect(c.body).toMatch(/^Dear Chia,\n\nMay I check on my email of 1 Oct 2026 on \(TRS\) EQ - Example \| PL Request\?/)
    expect(chaseText({ party: 'client', round: 3, subject: 'Re: Docs', sentAt: '2026-10-01T03:00:00Z', greeting: null }).body).toMatch(/happy to take a call at \{owner_phone\}/)
  })
})

describe('pre-approved chases', () => {
  const base = { id: 'd', status: 'pending', channel: 'email', email_type: 'CASE_WORK', draft_class: 'followup_chase', to_email: 'uw@insurer.com', cc: null, thread_id: 't', work_item_id: 'w', sent_by_agent: false }
  const item = { id: 'w', needs_human: null, closed_at: null, later_until: null, later_when: null }
  it('go out on the sender\'s approval, without the ladder', () => {
    expect(eligibility({ ...base, context_used: { kind: 'followup_chase', preapproved: true } }, item, new Map(), new Set(), false).ok).toBe(true)
  })
  it('wait for a person when not pre-approved, or when the kill switch is on, or the case holds a decision', () => {
    expect(eligibility({ ...base, context_used: { kind: 'followup_chase', preapproved: false } }, item, new Map(), new Set(), false).ok).toBe(false)
    expect(eligibility({ ...base, context_used: { kind: 'followup_chase', preapproved: true } }, item, new Map(), new Set(), true).ok).toBe(false)
    expect(eligibility({ ...base, context_used: { kind: 'followup_chase', preapproved: true } }, { ...item, needs_human: 'Call them' }, new Map(), new Set(), false).ok).toBe(false)
  })
})
