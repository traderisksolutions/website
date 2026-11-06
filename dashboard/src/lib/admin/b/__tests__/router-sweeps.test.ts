import { describe, it, expect } from 'vitest'
import { routeRecipients, OPERATIONS, type RouteInput } from '../router'
import { chaseDecision, renewalBand, dailySweepTasks } from '../sweeps'
import { buildDraft, replySubject } from '../drafts'
import { bucketOf, waitingLabel } from '../register-view'
import { firstLine } from '../register'

const base: RouteInput = {
  side: 'client', scope: 'claims', messages: [], clientContacts: [], groupContacts: [], insurerDesk: [],
  insurerLastHandler: null, insurerDomains: ['insurer.example'], departed: ['leaver@trade-risksol.com'], owner: 'owner@trade-risksol.com',
}

describe('routeRecipients', () => {
  it('writes to the last person on the case on that side, keeps their own cc, and copies operations@ and the owner', () => {
    const r = routeRecipients({
      ...base,
      messages: [
        { from: 'old@client.example', to: ['ops@trade-risksol.com'], cc: [], sent_at: '2026-09-01', side: 'client' },
        { from: 'Jane <jane@client.example>', to: ['leaver@trade-risksol.com'], cc: ['boss@client.example', 'claims@insurer.example', 'noreply@client.example'], sent_at: '2026-10-01', side: 'client' },
      ],
    })
    expect(r).toEqual({ ok: true, to: ['jane@client.example'], cc: ['boss@client.example', OPERATIONS, 'owner@trade-risksol.com'], basis: 'last client sender on the case' })
  })
  it('falls back to a scoped client contact, then the group contact', () => {
    const scoped = routeRecipients({ ...base, clientContacts: [{ email: 'hr@client.example', scope: ['ghs'] }, { email: 'claims@client.example', scope: ['claims'] }] })
    expect(scoped.ok && scoped.to).toEqual(['claims@client.example'])
    const left = routeRecipients({ ...base, clientContacts: [{ email: 'gone@client.example', scope: ['claims'], status: 'left' }], groupContacts: [{ email: 'group@parent.example', scope: ['all'] }] })
    expect(left.ok && left.to).toEqual(['group@parent.example'])
  })
  it('uses the insurer desk, then the last handler, for the insurer side', () => {
    expect(routeRecipients({ ...base, side: 'insurer', insurerDesk: ['desk@insurer.example'] })).toMatchObject({ ok: true, to: ['desk@insurer.example'] })
    expect(routeRecipients({ ...base, side: 'insurer', insurerLastHandler: 'officer@insurer.example' })).toMatchObject({ ok: true, to: ['officer@insurer.example'] })
  })
  it('asks a person when nobody fits; never departed staff or automated senders', () => {
    const r = routeRecipients({ ...base, messages: [{ from: 'no-reply@client.example', to: [], cc: [], sent_at: '2026-10-01', side: 'client' }] })
    expect(r.ok).toBe(false)
    const own = routeRecipients({ ...base, owner: 'leaver@trade-risksol.com', clientContacts: [{ email: 'a@client.example', scope: ['claims'] }] })
    expect(own.ok && own.cc).toEqual([OPERATIONS])
  })
})

describe('chaseDecision', () => {
  const item = { status: 'waiting_insurer', waiting_since: '2026-10-23', last_activity_at: null, snoozed_until: null, closed_at: null }
  it('chases after more than 5 working days, one per round', () => {
    expect(chaseDecision(item, '2026-10-30').chase).toBeNull()           // 5 working days
    expect(chaseDecision(item, '2026-11-02')).toEqual({ chase: 'chase_insurer', stall: false, round: 1, urgent: false, escalate: false })
    expect(chaseDecision(item, '2026-11-10').round).toBe(2)   // Mon 9 Nov is a public holiday
    expect(chaseDecision({ ...item, status: 'waiting_client' }, '2026-11-02').chase).toBe('chase_client')
    expect(chaseDecision({ ...item, snoozed_until: '2026-11-10' }, '2026-11-02').chase).toBeNull()
  })
  it('stalls a TRS move owed for more than 7 days', () => {
    expect(chaseDecision({ ...item, status: 'trs_to_act', last_activity_at: '2026-10-20' }, '2026-11-01').stall).toBe(true)
    expect(chaseDecision({ ...item, status: 'trs_to_act', last_activity_at: '2026-10-28' }, '2026-11-01').stall).toBe(false)
  })
})

describe('renewalBand', () => {
  it('puts a policy in the smallest band it falls inside', () => {
    expect(renewalBand('2026-11-10', '2026-11-01')).toBe(15)
    expect(renewalBand('2026-11-30', '2026-11-01')).toBe(30)
    expect(renewalBand('2026-12-10', '2026-11-01')).toBe(45)
    expect(renewalBand('2026-12-25', '2026-11-01')).toBe(90)
    expect(renewalBand('2027-03-01', '2026-11-01')).toBeNull()
    expect(renewalBand('2026-10-01', '2026-11-01')).toBeNull()
  })
  it('daily sweep keys carry the day', () => {
    const keys = dailySweepTasks('2026-11-01').map(t => t.idem_key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.every(k => k.endsWith('2026-11-01'))).toBe(true)
  })
})

describe('drafts', () => {
  const f = { greetingName: 'Jane', clientName: 'Example Pte Ltd', title: 'Van accident', policyNumber: 'MV-1', insurerName: 'Example Insurance', insurerRef: 'CLM-9', claimant: null, lossDate: '2026-10-07', threadSubject: 'Fwd: van accident' }
  it('replies on the thread subject and signs with the placeholder', () => {
    const d = buildDraft('request_missing', { ...f, items: ['Repair estimate'] })
    expect(d.subject).toBe('Re: Fwd: van accident')
    expect(d.body).toContain('- Repair estimate')
    expect(d.body).toContain('Policy No. MV-1, claim ref. CLM-9, loss on 7 Oct 2026')
    expect(d.body).toMatch(/\{owner_name\}/)
    expect(replySubject('Re: x', 'y')).toBe('Re: x')
  })
  it('leaves out what it does not know', () => {
    const d = buildDraft('chase_insurer', { ...f, greetingName: null, policyNumber: null, insurerRef: null, lossDate: null, lastSent: null })
    expect(d.body.startsWith('Dear Sir/Madam,')).toBe(true)
    expect(d.body).not.toContain('null')
    const r = buildDraft('renewal_notice', { ...f, className: null, expiry: null })
    expect(r.body).not.toMatch(/Your {2}policy|null|undefined/)
  })
})

describe('register view', () => {
  it('buckets by stage, then by closed', () => {
    expect(bucketOf({ closed: true, stage: 'settled' })).toBe('settled')
    expect(bucketOf({ closed: false, stage: 'declined' })).toBe('declined')
    expect(bucketOf({ closed: true, stage: null })).toBe('closed')
    expect(bucketOf({ closed: false, stage: null })).toBe('open')
    expect(waitingLabel(null, 'waiting_insurer')).toBe('insurer')
    expect(waitingLabel('client', 'trs_to_act')).toBe('client')
  })
  it('timeline line skips the greeting', () => {
    expect(firstLine('Hi Jane,\n\nThe surveyor will visit on Monday.\n\nThanks')).toBe('The surveyor will visit on Monday.')
  })
})
