import { describe, expect, it } from 'vitest'
import { learn, reasonOf, score, signalsOf, splitHistory } from './learn'

describe('signalsOf', () => {
  it('on the list beats known client; sender and category follow', () => {
    expect(signalsOf({ onList: true, knownClient: true, senderKind: 'insurer', category: 'Renewal' })).toEqual(['on_list', 'from:insurer', 'cat:renewal'])
    expect(signalsOf({ onList: false, knownClient: true, senderKind: null, category: null })).toEqual(['known_client'])
    expect(signalsOf({ onList: false, knownClient: false, senderKind: null, category: null })).toEqual([])
  })
})

describe('splitHistory', () => {
  it('kept is a positive, removed within a week is a negative, no signals is skipped', () => {
    const { positives, negatives } = splitHistory([
      { signals: ['a'], added_at: '2026-11-01T00:00:00Z', removed_at: null },
      { signals: ['b'], added_at: '2026-11-01T00:00:00Z', removed_at: '2026-11-03T00:00:00Z' },
      { signals: ['c'], added_at: '2026-11-01T00:00:00Z', removed_at: '2026-11-20T00:00:00Z' },
      { signals: [], added_at: '2026-11-01T00:00:00Z', removed_at: null },
    ])
    expect(positives).toEqual([['a'], ['c']])
    expect(negatives).toEqual([['b']])
  })
})

describe('score', () => {
  it('the seed rule suggests a client on the list from day one', () => {
    const b = score(['on_list', 'from:client'], new Map())
    expect(b).toMatchObject({ signal: 'on_list', seeded: true })
    expect(reasonOf(b!)).toBe('Client on your list · new thread')
  })
  it('a learned signal needs five cases and 60%', () => {
    const four = learn([['from:insurer'], ['from:insurer'], ['from:insurer'], ['from:insurer']], [])
    expect(score(['from:insurer'], four)).toBeNull()
    const nine = learn(Array(9).fill(['from:insurer']), [['from:insurer']])
    const b = score(['from:insurer'], nine)
    expect(b).toMatchObject({ signal: 'from:insurer', yes: 9, n: 10, seeded: false })
    expect(reasonOf(b!)).toBe('From an insurer · added 9 of 10')
  })
  it('enough dismissals overrule the seed', () => {
    const stats = learn([['on_list'], ['on_list']], [['on_list'], ['on_list'], ['on_list'], ['on_list']])
    expect(score(['on_list'], stats)).toBeNull()
  })
  it('a newsletter category that is always dismissed is never suggested', () => {
    expect(score(['cat:newsletter'], learn([], Array(6).fill(['cat:newsletter'])))).toBeNull()
  })
})
