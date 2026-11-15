import { describe, it, expect } from 'vitest'
import { agentRows, cleanNotes, quoted, noteKey, unreadFor, resumePoint, quoteSource, evidenceNotes, ownWords, SECTIONS, SECTION_NAME, type CaseMessage } from '../memory'
import type { Side, SourceMessage } from '../sources'

const messages: CaseMessage[] = [
  { id: 'm1', thread_id: 't1', sent_at: '2026-11-01T02:00:00Z', text: 'We would like to keep the same hospital plan,\nbut the budget cannot go above $40,000 this year.' },
  { id: 'm2', thread_id: 't2', sent_at: '2026-11-03T02:00:00Z', text: 'We can hold last year’s rates if the census is received by 20 November.' },
]
const agent = { workItemId: 'w1', author: 'case_worker', authorKind: 'agent' as const, messages }
const person = { workItemId: 'w1', author: 'nathan@trade-risksol.com', authorKind: 'person' as const, messages }

describe('quoted', () => {
  it('finds the words whatever the case, line breaks and curly quotes', () => {
    expect(quoted('same hospital plan, but the budget', messages[0].text)).toBe(true)
    expect(quoted("hold last year's rates", messages[1].text)).toBe(true)
    expect(quoted('budget of $50,000', messages[0].text)).toBe(false)
    expect(quoted('plan', messages[0].text)).toBe(false) // too short to be a source
  })
})

describe('cleanNotes for an agent', () => {
  it('keeps a note whose words are in the email it names', () => {
    const { kept, dropped } = cleanNotes([{ section: 'wish', text: 'Budget capped at $40,000', message_id: 'm1', quote: 'budget cannot go above $40,000' }], agent)
    expect(dropped).toEqual([])
    expect(kept[0]).toMatchObject({ section: 'wish', message_id: 'm1', thread_id: 't1', source_date: '2026-11-01', author: 'case_worker', author_kind: 'agent' })
  })
  it('finds the email when only the thread and the words are given', () => {
    const { kept } = cleanNotes([{ section: 'insurer_said', text: 'Rates held if census arrives by 20 Nov', thread_id: 't2', quote: 'census is received by 20 November' }], agent)
    expect(kept[0].message_id).toBe('m2')
  })
  it('drops what has no source, a source off the case, or words that are not there', () => {
    const { kept, dropped } = cleanNotes([
      { section: 'risk', text: 'Client may leave' },
      { section: 'risk', text: 'Client may leave', message_id: 'm9', quote: 'we are looking at other brokers' },
      { section: 'risk', text: 'Budget is $30,000', message_id: 'm1', quote: 'budget cannot go above $30,000' },
      { section: 'risk', text: 'Wrong thread', thread_id: 't1', quote: 'census is received by 20 November' },
      { section: 'mood', text: 'Happy' },
      { section: 'risk', text: '   ' },
    ], agent)
    expect(kept).toEqual([])
    expect(dropped.map(d => d.reason)).toEqual(['no source email', 'email not on this case', 'words not found in the email', 'words not found in the email', 'no section', 'no text'])
  })
  it('stores a statement once', () => {
    const n = { section: 'wish', text: 'Budget capped at $40,000', message_id: 'm1', quote: 'budget cannot go above $40,000' }
    const { kept } = cleanNotes([n, { ...n, text: 'budget  capped at $40,000' }], agent)
    expect(kept).toHaveLength(1)
    expect(kept[0].idem_key).toBe(noteKey('w1', 'wish', 'Budget capped at $40,000', 'm1'))
  })
  it('bounds the text and the quote', () => {
    const { kept } = cleanNotes([{ section: 'wish', text: 'x'.repeat(900), message_id: 'm1', quote: 'budget cannot go above $40,000' }], agent)
    expect(kept[0].text).toHaveLength(600)
  })
  it('ignores anything that is not a list', () => { expect(cleanNotes({ section: 'wish' }, agent)).toEqual({ kept: [], dropped: [] }) })
})

describe('cleanNotes for a person', () => {
  it('keeps a note with no source', () => {
    const { kept } = cleanNotes([{ section: 'success_factor', text: 'HR director decides; she values same-day replies' }], person)
    expect(kept[0]).toMatchObject({ author_kind: 'person', message_id: null, quote: null, source_date: null })
  })
  it('refuses a source that is not on the case', () => {
    expect(cleanNotes([{ section: 'risk', text: 'x', message_id: 'm9' }], person).dropped[0].reason).toBe('email not on this case')
  })
})

describe('unreadFor', () => {
  it('returns what the agent has not read, oldest first', () => {
    const all = [{ id: 'b', sent_at: '2026-11-03' }, { id: 'a', sent_at: '2026-11-01' }, { id: 'c', sent_at: '2026-11-05' }]
    expect(unreadFor(all, new Set(['a'])).map(m => m.id)).toEqual(['b', 'c'])
    expect(unreadFor(all, new Set(['a', 'b', 'c']))).toEqual([])
  })
})

describe('resumePoint', () => {
  const base = {
    notes: [
      { section: 'next_step', text: 'Chase the census', status: 'superseded', created_at: '2026-11-01T00:00:00Z' },
      { section: 'next_step', text: 'Send the comparison to HR', status: 'current', created_at: '2026-11-05T00:00:00Z' },
      { section: 'open_question', text: 'Is dental still wanted?', status: 'current', created_at: '2026-11-04T00:00:00Z' },
      { section: 'open_question', text: 'Old question', status: 'rejected', created_at: '2026-11-02T00:00:00Z' },
      { section: 'handover', text: 'Nathan away 16 to 20 Nov; Hasya holds the case', status: 'current', created_at: '2026-11-06T00:00:00Z' },
    ],
    events: [{ created_at: '2026-11-05T00:00:00Z', actor: 'case_worker', kind: 'agent_turn' }, { created_at: '2026-11-06T00:00:00Z', actor: 'nathan@trade-risksol.com', kind: 'note' }],
    messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    reads: [{ agent: 'case_worker', message_id: 'm1' }, { agent: 'case_worker', message_id: 'm2' }, { agent: 'drafter', message_id: 'm1' }, { agent: 'case_worker', message_id: 'gone' }],
  }
  it('states where the case stands', () => {
    expect(resumePoint(base)).toEqual({
      last: { at: '2026-11-06T00:00:00Z', actor: 'nathan@trade-risksol.com', kind: 'note', note: null },
      next_step: 'Send the comparison to HR', open_questions: ['Is dental still wanted?'], handover: 'Nathan away 16 to 20 Nov; Hasya holds the case',
      unread: { new: 1, case_worker: 1, drafter: 2 },
    })
  })
  it('falls back to the case record for the next step', () => {
    const r = resumePoint({ notes: [], events: [], messages: [], reads: [], nextAction: 'Call the client' })
    expect(r).toEqual({ last: null, next_step: 'Call the client', open_questions: [], handover: null, unread: { new: 0 } })
  })
  it('names every section', () => { for (const s of SECTIONS) expect(SECTION_NAME[s]).toBeTruthy() })
  it('carries the last touch in words, and does not count opening the case', () => {
    const r = resumePoint({ ...base, events: [
      { created_at: '2026-11-12T10:51:00Z', actor: 'case_worker', kind: 'read', detail: { note: '3 notes kept, 3 emails read' } },
      { created_at: '2026-11-13T09:00:00Z', actor: 'nathan@trade-risksol.com', kind: 'seen' },
    ] })
    expect(r.last).toEqual({ at: '2026-11-12T10:51:00Z', actor: 'case_worker', kind: 'read', note: '3 notes kept, 3 emails read' })
  })
})

describe('agentRows', () => {
  const rows = agentRows({
    messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    reads: [
      { agent: 'case_worker', message_id: 'm1', read_at: '2026-11-10T08:00:00Z' }, { agent: 'case_worker', message_id: 'm2', read_at: '2026-11-12T10:51:00Z' },
      { agent: 'case_worker', message_id: 'gone', read_at: '2026-11-14T00:00:00Z' }, { agent: 'relay', message_id: 'm3', read_at: '2026-11-11T00:00:00Z' },
    ],
    notes: [{ author: 'case_worker', status: 'current' }, { author: 'case_worker', status: 'superseded' }, { author: 'case_worker', status: 'rejected' }, { author: 'nathan@trade-risksol.com', status: 'current' }],
  })
  it('gives one row per agent, in a fixed order', () => { expect(rows.map(r => r.name)).toEqual(['Case reader', 'Placement', 'Relay']) })
  it('counts only emails still on the case', () => {
    expect(rows[0]).toEqual({ agent: 'case_worker', name: 'Case reader', last_read: '2026-11-12T10:51:00Z', emails_read: 2, unread: 1, notes_kept: 2 })
  })
  it('shows an agent that has read nothing', () => {
    expect(rows[1]).toEqual({ agent: 'placement', name: 'Placement', last_read: null, emails_read: 0, unread: 3, notes_kept: 0 })
  })
})

// A client forwards the insurer's terms; the insurer later quotes the client's reply.
const mail = (o: Partial<SourceMessage> & { id: string }): SourceMessage => ({
  thread_id: 't1', direction: 'inbound', from_address: 'hr@client.invalid', subject: 'Renewal terms', body_text: '', sent_at: '2026-11-01T02:00:00Z', ...o,
})
const forwarded = mail({
  id: 'f1', subject: 'Fwd: Renewal terms',
  body_text: [
    'Hi Nathan, please see below. Can the excess be reduced?', '',
    '---------- Forwarded message ---------',
    'From: Underwriter <uw@insurer.invalid>',
    'Date: Mon, 2 Nov 2026 at 10:15',
    'Subject: Renewal terms',
    'To: HR <hr@client.invalid>', '',
    'We can renew at a premium of $41,200 with the excess raised to $500.',
  ].join('\n'),
})
const insurerReply = mail({
  id: 'f2', from_address: 'uw@insurer.invalid', sent_at: '2026-11-03T02:00:00Z', subject: 'RE: Renewal terms',
  body_text: [
    'Noted. The excess stays at $500 for this renewal.', '',
    'From: HR <hr@client.invalid>',
    'Sent: Tuesday, 3 November 2026 9:02 AM',
    'To: Underwriter <uw@insurer.invalid>',
    'Subject: Renewal terms', '',
    'Our budget for the year is capped at $40,000 all in.',
  ].join('\n'),
})
const trsForward = mail({
  id: 'f3', direction: 'outbound', from_address: 'nathan@trade-risksol.com', sent_at: '2026-11-04T02:00:00Z', subject: 'Fwd: Renewal terms',
  body_text: [
    'Please see the insurer’s position below.', '',
    '---------- Forwarded message ---------',
    'From: Underwriter <uw@insurer.invalid>',
    'Date: Wed, 4 Nov 2026 at 09:00',
    'Subject: Renewal terms', '',
    'Claims experience over three years supports a 5% loading.',
  ].join('\n'),
})
const thread = [forwarded, insurerReply, trsForward]
const kinds = new Map([['client.invalid', 'client'], ['insurer.invalid', 'insurer']])
const sides = new Map<string, Side>([['t1', 'client']])

describe('quoteSource', () => {
  it('gives words to the sender who wrote them', () => {
    expect(quoteSource('Can the excess be reduced?', 't1', thread)).toMatchObject({ message: { id: 'f1' }, from: 'hr@client.invalid', own: true })
    expect(quoteSource('excess stays at $500', 't1', thread)).toMatchObject({ message: { id: 'f2' }, from: 'uw@insurer.invalid', own: true })
  })
  it('gives forwarded and quoted words to the earlier sender', () => {
    expect(quoteSource('premium of $41,200 with the excess raised', 't1', thread)).toMatchObject({ message: { id: 'f1' }, from: 'uw@insurer.invalid', own: false })
    expect(quoteSource('budget for the year is capped at $40,000', 't1', thread)).toMatchObject({ message: { id: 'f2' }, from: 'hr@client.invalid', own: false })
  })
  it('finds nothing off the thread, and nothing in a subject line alone', () => {
    expect(quoteSource('Can the excess be reduced?', 't2', thread)).toBeNull()
    expect(quoteSource('Renewal terms', 't1', thread)).toBeNull()
  })
  it('own words leave the history out', () => {
    expect(ownWords(forwarded)).toBe('Hi Nathan, please see below. Can the excess be reduced?')
  })
})

describe('evidenceNotes', () => {
  const run = (quote: string) => evidenceNotes([{ thread: 't1', quote }], thread, kinds, sides)
  it('files a statement under who wrote it, not who forwarded it', () => {
    expect(run('Can the excess be reduced?')).toEqual([{ section: 'client_said', text: 'Can the excess be reduced?', quote: 'Can the excess be reduced?', message_id: 'f1' }])
    expect(run('premium of $41,200 with the excess raised')[0]).toMatchObject({ section: 'insurer_said', message_id: 'f1' })
    expect(run('budget for the year is capped at $40,000')[0]).toMatchObject({ section: 'client_said', message_id: 'f2' })
  })
  it('keeps an insurer’s words that TRS forwarded, and leaves out what TRS wrote', () => {
    expect(run('Claims experience over three years supports')[0]).toMatchObject({ section: 'insurer_said', message_id: 'f3' })
    expect(run('Please see the insurer’s position below')).toEqual([])
  })
  it('an unlisted address is the client only when it sent the email itself', () => {
    const own = mail({ id: 'g1', from_address: 'owner@gmail.com', body_text: 'Please add my two new drivers to the policy.' })
    const carried = mail({ id: 'g2', body_text: 'See below.\n\nFrom: Someone <someone@unlisted.invalid>\nSent: Monday, 2 November 2026 9:00 AM\nSubject: Cover\n\nThe cover excludes flood damage at this address.' })
    expect(evidenceNotes([{ thread: 't1', quote: 'add my two new drivers' }], [own], kinds, sides)[0]).toMatchObject({ section: 'client_said' })
    expect(evidenceNotes([{ thread: 't1', quote: 'cover excludes flood damage' }], [carried], kinds, sides)).toEqual([])
  })
})

describe('cleanNotes with own words', () => {
  it('cites the email whose sender wrote the words, not a later one that quotes them', () => {
    const msgs: CaseMessage[] = [
      { id: 'q2', thread_id: 't1', sent_at: '2026-11-03T02:00:00Z', text: insurerReply.body_text!, own: ownWords(insurerReply) },
      { id: 'q1', thread_id: 't1', sent_at: '2026-11-03T01:00:00Z', text: 'Our budget for the year is capped at $40,000 all in.', own: 'Our budget for the year is capped at $40,000 all in.' },
    ]
    const { kept } = cleanNotes([{ section: 'wish', text: 'Budget capped at $40,000', thread_id: 't1', quote: 'budget for the year is capped at $40,000' }], { ...agent, messages: msgs })
    expect(kept[0]).toMatchObject({ message_id: 'q1' })
  })
})
