import { describe, it, expect } from 'vitest'
import { matchOrigin, isUnedited } from './origin'
import { metrics, weekOf, type OriginRow } from './metrics'

const T = '2026-11-02T04:00:00.000Z'
const at = (s: number) => new Date(Date.parse(T) + s * 1000).toISOString()
const draft = (over = {}) => ({ id: 'd1', thread_id: 't1', sent_at: T, body: 'Dear Dorin,\n\nFollowing up on the claim outcome.\n\n{owner_name}', to_email: null, ...over })

describe('matchOrigin', () => {
  it('a message stamped at the draft instant on the same thread is agent approved, unedited', () => {
    const o = matchOrigin({ id: 'm', thread_id: 't1', sent_at: T, body_text: 'Dear Dorin,\n\nFollowing up on the claim outcome.\n\nJane Tan', to: ['x@y.example'] }, [draft()])
    expect(o.origin).toBe('agent_approved'); expect(o.draft_id).toBe('d1'); expect(isUnedited(o.edit_share)).toBe(true)
  })
  it('a rewritten body still matches at the instant, with a high edit share', () => {
    const o = matchOrigin({ id: 'm', thread_id: 't1', sent_at: T, body_text: 'Hi Dorin, could you share the settlement letter and the breakdown by invoice once ready, thanks', to: [] }, [draft()])
    expect(o.origin).toBe('agent_approved'); expect(o.edit_share).toBeGreaterThan(0.4)
  })
  it('a name the person added does not count as an edit', () => {
    const o = matchOrigin({ id: 'm', thread_id: 't1', sent_at: T, body_text: 'Dear Dorin,\n\nFollowing up on the claim outcome.\n\nJane Tan\nSenior Broker', to: [] }, [draft()])
    expect(o.edit_share).toBe(0)
  })
  it('measures edits against the draft as first written when kept', () => {
    const o = matchOrigin({ id: 'm', thread_id: 't1', sent_at: T, body_text: 'Rewritten words entirely', to: [] }, [draft({ body: 'Rewritten words entirely', body_as_drafted: 'Original agent text here' })])
    expect(o.edit_share).toBe(1)
  })
  it('a message minutes later on the thread needs a similar body', () => {
    const near = matchOrigin({ id: 'm', thread_id: 't1', sent_at: at(300), body_text: 'Following up on the claim outcome.', to: [] }, [draft()])
    expect(near.origin).toBe('agent_approved')
    const far = matchOrigin({ id: 'm', thread_id: 't1', sent_at: at(300), body_text: 'Something else about a renewal', to: [] }, [draft()])
    expect(far.origin).toBe('hand_written')
  })
  it('outside ten minutes is hand written', () => {
    const o = matchOrigin({ id: 'm', thread_id: 't1', sent_at: at(1200), body_text: 'Following up on the claim outcome.', to: [] }, [draft()])
    expect(o.origin).toBe('hand_written'); expect(o.draft_id).toBeNull()
  })
  it('a draft with no thread matches by recipient', () => {
    const o = matchOrigin({ id: 'm', thread_id: 't9', sent_at: T, body_text: 'Following up on the claim outcome.', to: ['Dorin@Insurer.example'] }, [draft({ thread_id: null, to_email: 'dorin@insurer.example' })])
    expect(o.origin).toBe('agent_approved')
  })
})

const row = (over: Partial<OriginRow>): OriginRow => ({
  message_id: Math.random().toString(36), sent_at: T, sender: 'a@trade-risksol.com', thread_id: 't', company_id: 'c1', company_name: 'Client One',
  origin: 'hand_written', draft_id: null, edit_share: null, work_class: 'chase', work_sub: '', tier: 'deterministic', side: 'market', words: 20, attachments: 0, effort: 20, ...over,
})

describe('metrics', () => {
  it('weeks start on Monday in Singapore time', () => {
    expect(weekOf('2026-11-01T10:00:00Z')).toBe('2026-10-26')   // Sun 1 Nov 18:00 SGT
    expect(weekOf('2026-11-01T20:00:00Z')).toBe('2026-11-02')   // Mon 2 Nov 04:00 SGT
  })
  it('counts agent share, effort share and unedited rate; leaves internal and excluded out', () => {
    const rows = [
      row({ origin: 'agent_approved', edit_share: 0.02, effort: 100 }),
      row({ origin: 'agent_approved', edit_share: 0.5, effort: 100 }),
      row({ origin: 'hand_written', effort: 200 }),
      row({ origin: 'hand_written', work_class: 'internal', effort: 500 }),
      row({ origin: 'hand_written', work_class: 'excluded', tier: 'excluded', effort: 500 }),
    ]
    const m = metrics(rows, { now: T })
    expect(m.total.messages).toBe(3); expect(m.excluded).toBe(2)
    expect(m.total.share).toBeCloseTo(2 / 3); expect(m.total.effortShare).toBeCloseTo(0.5)
    expect(m.total.uneditedRate).toBeCloseTo(0.5)
    expect(m.thisWeek?.messages).toBe(3)
    expect(m.byClass[0].key).toBe('chase'); expect(m.byClass[0].personOnly).toBe(false)
    expect(m.byClient[0].label).toBe('Client One')
  })
  it('flags a class that is person-only', () => {
    const m = metrics([row({ work_class: 'renewal_negotiation', tier: 'person' })], { now: T })
    expect(m.byClass[0].personOnly).toBe(true)
  })
})
