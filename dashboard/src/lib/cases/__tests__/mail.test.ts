import { describe, it, expect } from 'vitest'
import { labelled, mailView, isMailRelevance, type MailRow } from '../mail'
import { actorName, senderName, isAgent } from '../names'

describe('labelled', () => {
  it('shows a person’s label with who set it and when', () => {
    expect(labelled({ subject: 'Quotation for fire', label: 'claim', label_by: 'Nathan@trade-risksol.com', label_basis: 'subject: quotation', label_at: '2026-11-03T02:00:00Z' }))
      .toEqual({ label: 'claim', set_by: { kind: 'person', email: 'nathan@trade-risksol.com', at: '2026-11-03T02:00:00Z' } })
  })
  it('shows the rule’s label with what it matched on', () => {
    expect(labelled({ subject: 'Quotation for fire', label: 'quote_received', label_by: 'rule', label_basis: 'insurer file: quotation_ghs.pdf' }))
      .toEqual({ label: 'quote_received', set_by: { kind: 'rule', basis: 'insurer file: quotation_ghs.pdf' } })
  })
  it('reads the subject for a thread nobody labelled', () => {
    expect(labelled({ subject: 'RE: Request for quotation', label: null })).toEqual({ label: 'quotation_request', set_by: { kind: 'rule', basis: 'subject: quotation' } })
    expect(labelled({ subject: 'Lunch', label: 'not-a-label' })).toEqual({ label: 'other', set_by: { kind: 'rule', basis: 'no rule matched' } })
  })
})

const row = (o: Partial<MailRow>): MailRow => ({ id: 't', subject: 'S', last_message_at: '2026-11-01T00:00:00Z', company: null, label: 'other', set_by: { kind: 'rule', basis: null }, relevance: 'back_burner', case: null, ...o })

describe('mailView', () => {
  const rows = [
    row({ id: 'a', relevance: 'active', label: 'renewal', last_message_at: '2026-11-10T00:00:00Z' }),
    row({ id: 'b', relevance: 'back_burner', label: 'renewal', last_message_at: '2026-11-12T00:00:00Z' }),
    row({ id: 'c', relevance: 'member_movements', label: 'member_movement', last_message_at: '2026-11-11T00:00:00Z' }),
    row({ id: 'd', relevance: 'back_burner', label: 'claim', last_message_at: null }),
  ]
  it('lists every thread newest first and counts each group', () => {
    const v = mailView(rows, { relevance: 'all', label: 'all', limit: 200 })
    expect(v.threads.map(t => t.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(v.counts).toEqual({ all: 4, active: 1, back_burner: 2, member_movements: 1 })
    expect(v.total).toBe(4)
  })
  it('counts follow the label filter', () => {
    const v = mailView(rows, { relevance: 'back_burner', label: 'renewal', limit: 200 })
    expect(v.threads.map(t => t.id)).toEqual(['b'])
    expect(v.counts).toEqual({ all: 2, active: 1, back_burner: 1, member_movements: 0 })
  })
  it('lists up to the limit and says how many there are', () => {
    const v = mailView(rows, { relevance: 'all', label: 'all', limit: 2 })
    expect(v.threads).toHaveLength(2)
    expect(v.total).toBe(4)
  })
  it('knows its tabs', () => {
    expect(isMailRelevance('all')).toBe(true)
    expect(isMailRelevance('member_movements')).toBe(true)
    expect(isMailRelevance('archived')).toBe(false)
  })
})

describe('names', () => {
  const staff = [{ email: 'angela@trade-risksol.com', name: 'Angela Tan' }]
  it('names a person from the staff on file, an agent by its role', () => {
    expect(actorName('Angela@trade-risksol.com', staff)).toBe('Angela Tan')
    expect(actorName('hasya@trade-risksol.com', staff)).toBe('hasya')
    expect(actorName('case_worker', staff)).toBe('Case reader')
    expect(actorName('admin_sweep')).toBe('Admin sweep')
    expect(actorName(null)).toBe('Unknown')
    expect(isAgent('case_worker')).toBe(true)
    expect(isAgent('angela@trade-risksol.com')).toBe(false)
  })
  it('names the sender of an email', () => {
    expect(senderName('"Tan Wei Ling" <hr@client.invalid>')).toBe('Tan Wei Ling')
    expect(senderName('Lim Underwriting <uw@insurer.invalid>')).toBe('Lim Underwriting')
    expect(senderName('<HR@client.invalid>')).toBe('hr@client.invalid')
    expect(senderName('hr@client.invalid')).toBe('hr@client.invalid')
    expect(senderName('"hr@client.invalid" <hr@client.invalid>')).toBe('hr@client.invalid')
    expect(senderName(null)).toBe('Unknown')
  })
})
