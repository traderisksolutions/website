import { describe, it, expect } from 'vitest'
import { cleanNotes, quoted, noteKey, unreadFor, resumePoint, SECTIONS, SECTION_NAME, type CaseMessage } from '../memory'

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
      last: { at: '2026-11-06T00:00:00Z', actor: 'nathan@trade-risksol.com', kind: 'note' },
      next_step: 'Send the comparison to HR', open_questions: ['Is dental still wanted?'], handover: 'Nathan away 16 to 20 Nov; Hasya holds the case',
      unread: { new: 1, case_worker: 1, drafter: 2 },
    })
  })
  it('falls back to the case record for the next step', () => {
    const r = resumePoint({ notes: [], events: [], messages: [], reads: [], nextAction: 'Call the client' })
    expect(r).toEqual({ last: null, next_step: 'Call the client', open_questions: [], handover: null, unread: { new: 0 } })
  })
  it('names every section', () => { for (const s of SECTIONS) expect(SECTION_NAME[s]).toBeTruthy() })
})
