import { describe, it, expect } from 'vitest'
import { burstHeld, canSwitchOn, capsAllow, digestText, eligibility, inSendingHours, nextStatus, type DraftForSend, type LadderRow } from './rules'

const row = (o: Partial<LadderRow> = {}): LadderRow => ({ draft_class: 'ack', rung: 1, status: 'manual', approvals_unedited: 0, approvals_total: 0, min_unedited: 20, last_graduated_at: null, paused_by: null, paused_reason: null, ...o })
const draft = (o: Partial<DraftForSend> = {}): DraftForSend => ({ id: 'd1', status: 'pending', channel: 'email', email_type: 'CASE_WORK', draft_class: 'ack', to_email: 'hr@client.example', cc: null, thread_id: 't1', work_item_id: 'w1', context_used: { kind: 'ack_client' }, sent_by_agent: false, ...o })
const item = (o: Partial<NonNullable<Parameters<typeof eligibility>[1]>> = {}) => ({ id: 'w1', needs_human: null, closed_at: null, later_until: null, later_when: null, ...o })
const ladder = (status: LadderRow['status'] = 'auto') => new Map([['ack', row({ status })]])
const nobody = new Set<string>()

describe('graduation', () => {
  it('manual until 20 unedited approvals, then candidate; never auto by itself', () => {
    expect(nextStatus(row(), 19)).toBe('manual')
    expect(nextStatus(row(), 20)).toBe('candidate')
    expect(nextStatus(row({ status: 'candidate' }), 5)).toBe('manual')
    expect(nextStatus(row({ status: 'auto' }), 0)).toBe('auto')
    expect(nextStatus(row({ status: 'paused' }), 99)).toBe('paused')
  })
  it('a person may switch on only a candidate, or a paused class that still qualifies', () => {
    expect(canSwitchOn(row({ status: 'candidate', approvals_unedited: 20 }))).toBe(true)
    expect(canSwitchOn(row({ status: 'manual', approvals_unedited: 20 }))).toBe(false)
    expect(canSwitchOn(row({ status: 'paused', approvals_unedited: 20 }))).toBe(true)
    expect(canSwitchOn(row({ status: 'paused', approvals_unedited: 3 }))).toBe(false)
  })
})

describe('eligibility', () => {
  it('sends an ack on an existing thread with a clean case, cc operations@', () => {
    const v = eligibility(draft(), item(), ladder(), nobody, false)
    expect(v.ok).toBe(true)
    if (v.ok) { expect(v.to).toEqual(['hr@client.example']); expect(v.cc).toContain('operations@trade-risksol.com') }
  })
  it('refuses when the class is not auto, the kill switch is set, or the draft is not pending', () => {
    expect(eligibility(draft(), item(), ladder('candidate'), nobody, false)).toMatchObject({ ok: false })
    expect(eligibility(draft(), item(), ladder(), nobody, true)).toMatchObject({ ok: false, reason: 'auto-send is switched off' })
    expect(eligibility(draft({ status: 'sent' }), item(), ladder(), nobody, false)).toMatchObject({ ok: false })
  })
  it('never auto-sends money, terms or chases, whatever the ladder says', () => {
    for (const kind of ['trs_note', 'renewal_advice', 'chase_insurer', 'forward_to_insurer']) {
      expect(eligibility(draft({ context_used: { kind } }), item(), ladder(), nobody, false)).toMatchObject({ ok: false })
    }
    expect(eligibility(draft({ email_type: 'POLICY_MOVEMENT' }), item(), ladder(), nobody, false)).toMatchObject({ ok: false })
  })
  it('refuses a case with a decision, a closed case, a set-aside case, or no thread', () => {
    expect(eligibility(draft(), item({ needs_human: 'Which policy?' }), ladder(), nobody, false)).toMatchObject({ ok: false, reason: 'case holds a decision' })
    expect(eligibility(draft(), item({ closed_at: '2026-11-01' }), ladder(), nobody, false)).toMatchObject({ ok: false })
    expect(eligibility(draft(), item({ later_when: 'client_reply' }), ladder(), nobody, false)).toMatchObject({ ok: false })
    expect(eligibility(draft({ thread_id: null }), item(), ladder(), nobody, false)).toMatchObject({ ok: false })
    expect(eligibility(draft(), null, ladder(), nobody, false)).toMatchObject({ ok: false, reason: 'no case' })
  })
  it('refuses departed staff, automated and internal recipients; drops departed cc', () => {
    expect(eligibility(draft({ to_email: 'gone@partner.example' }), item(), ladder(), new Set(['gone@partner.example']), false)).toMatchObject({ ok: false })
    expect(eligibility(draft({ to_email: 'noreply@insurer.example' }), item(), ladder(), nobody, false)).toMatchObject({ ok: false })
    expect(eligibility(draft({ to_email: 'someone@trade-risksol.com' }), item(), ladder(), nobody, false)).toMatchObject({ ok: false })
    const v = eligibility(draft({ cc: 'gone@partner.example, ops@client.example' }), item(), ladder(), new Set(['gone@partner.example']), false)
    expect(v.ok && v.cc).toEqual(['ops@client.example', 'operations@trade-risksol.com'])
  })
})

describe('guards', () => {
  it('holds a second send to the same recipient inside ten minutes', () => {
    const now = new Date('2026-11-05T02:00:00Z')
    expect(burstHeld([{ to: 'hr@client.example', at: '2026-11-05T01:55:00Z' }], 'HR@client.example', now)).toBe(true)
    expect(burstHeld([{ to: 'hr@client.example', at: '2026-11-05T01:40:00Z' }], 'hr@client.example', now)).toBe(false)
  })
  it('caps per run and per day', () => {
    expect(capsAllow(0, 0)).toBe(true)
    expect(capsAllow(0, 20)).toBe(false)
    expect(capsAllow(100, 0)).toBe(false)
    expect(capsAllow(5, 2, { run: 3, day: 10 })).toBe(true)
  })
  it('sends only on weekdays 08:00–18:30', () => {
    expect(inSendingHours(new Date(2026, 10, 5, 9, 0))).toBe(true)     // Thu
    expect(inSendingHours(new Date(2026, 10, 5, 7, 59))).toBe(false)
    expect(inSendingHours(new Date(2026, 10, 5, 18, 31))).toBe(false)
    expect(inSendingHours(new Date(2026, 10, 7, 10, 0))).toBe(false)   // Sat
  })
})

describe('digest', () => {
  it('lists each send with its case path', () => {
    const t = digestText([{ work_item_id: 'w1', draft_class: 'ack', to: 'hr@client.example', subject: 'Re: Documents', client: 'Client Co', sent_at: '2026-11-05T03:15:00.000Z' }])
    expect(t).toContain('Acknowledgement'); expect(t).toContain('/today/w1'); expect(t).toContain('Client Co')
    expect(digestText([])).toBe('Nothing was auto-sent today.')
  })
})
