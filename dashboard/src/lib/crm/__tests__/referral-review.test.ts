import { describe, it, expect } from 'vitest'
import { buildReferralRows } from '../referral-review'

const companies = [
  { id: 'p1', company_name: 'Carebridge', kind: 'partner', domain: 'carebridge.sg', domains: ['carebridge.sg'], confirmed_at: null, confirmed_by: null },
  { id: 'p2', company_name: 'Ledger Mail', kind: 'partner', domain: 'post.ledger.example', domains: ['post.ledger.example'], confirmed_at: null, confirmed_by: null },
  { id: 'p3', company_name: 'Anchor Brokers', kind: 'partner', domain: null, domains: ['anchor.example'], confirmed_at: '2026-11-10T02:00:00Z', confirmed_by: 'nathan@trade-risksol.com' },
  { id: 'o1', company_name: 'Post', kind: 'other', domain: 'post.ledger.example', domains: ['post.ledger.example'], confirmed_at: null, confirmed_by: null },
  { id: 'c1', company_name: 'Orchard Foods', kind: 'client', domain: 'orchard-foods.example', domains: [], confirmed_at: null, confirmed_by: null },
]
const threads = [
  { id: 't1', company_id: 'p1', subject: 'Group hospital for 40 staff', last_message_at: '2026-11-02T03:00:00Z' },
  { id: 't2', company_id: 'p1', subject: 'Addition of two staff', last_message_at: '2026-11-12T03:00:00Z' },
  { id: 't3', company_id: 'p2', subject: 'Invoice INV-0042', last_message_at: '2026-11-11T03:00:00Z' },
  { id: 't4', company_id: 'p3', subject: 'Marine cargo', last_message_at: '2026-11-13T03:00:00Z' },
  { id: 't5', company_id: 'p3', subject: 'Marine cargo terms', last_message_at: '2026-11-14T03:00:00Z' },
  { id: 't6', company_id: 'p3', subject: 'Renewal', last_message_at: '2026-11-15T03:00:00Z' },
]
const mail = (thread_id: string, from_address: string, body_text: string, direction = 'inbound') => ({ thread_id, direction, from_address, body_text })
const messages = [
  mail('t1', 'amy@carebridge.sg', 'Hi Nathan,\n\nOur client would like a quotation for 40 staff.'),
  mail('t1', 'nathan@trade-risksol.com', 'Hi Amy,\n\nNoted, we will revert.', 'outbound'),
  mail('t2', 'amy@carebridge.sg', 'Hi Nathan,\n\nThe HR has added two staff. Census attached.'),
  mail('t2', 'amy@carebridge.sg', 'Hi Nathan,\n\nThank you.'),
  mail('t3', 'no-reply@post.ledger.example', 'Our client has an invoice due.'),
  mail('t4', 'uw@anchor.example', 'Please find our quotation for your client attached.'),
]
const rows = buildReferralRows({ companies, threads, messages, visible: new Set(['t1', 't3', 't4', 't5', 't6']) })
const row = (id: string) => rows.find(r => r.id === id)!

describe('the referral list for review', () => {
  it('lists the partners only, unchecked first, then by threads', () => {
    expect(rows.map(r => r.id)).toEqual(['p1', 'p2', 'p3'])
    expect(row('p3')).toMatchObject({ checkedAt: '2026-11-10T02:00:00Z', checkedBy: 'nathan@trade-risksol.com', threads: 3 })
  })
  it('counts the emails written in each voice, and those TRS wrote', () => {
    expect(row('p1')).toMatchObject({ threads: 2, fromTrs: 1, voice: { referral: 2, market: 0 } })
    expect(row('p3').voice).toEqual({ referral: 0, market: 1 })
  })
  it('hears no voice in an automated sender', () => {
    expect(row('p2').voice).toEqual({ referral: 0, market: 0 })
  })
  it('names the other companies holding one of its domains', () => {
    expect(row('p2').shared).toEqual([{ id: 'o1', name: 'Post', kind: 'other' }])
    expect(row('p1').shared).toEqual([])
  })
  it('shows the latest thread, without its subject from a colleague’s mailbox', () => {
    expect(row('p1').last).toEqual({ at: '2026-11-12T03:00:00Z', subject: null, private: true })
    expect(row('p3').last).toEqual({ at: '2026-11-15T03:00:00Z', subject: 'Renewal', private: false })
  })
})
