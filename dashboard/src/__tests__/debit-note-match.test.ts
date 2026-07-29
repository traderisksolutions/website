import { describe, it, expect } from 'vitest'
import { bestCompanyMatch } from '@/lib/debit-note-extract'

const candidates = [
  { id: '1', name: 'Sulley Interiors Pte Ltd' },
  { id: '2', name: 'Zoomoov Pte Ltd' },
  { id: '3', name: "BLL's Transportation and Trading Pte Ltd" },
]

describe('bestCompanyMatch', () => {
  it('matches an exact name ignoring case and entity-suffix noise', () => {
    const m = bestCompanyMatch('sulley interiors pte. ltd.', candidates)
    expect(m?.id).toBe('1')
  })

  it('matches when the extracted name drops the entity suffix entirely', () => {
    const m = bestCompanyMatch('Zoomoov', candidates)
    expect(m?.id).toBe('2')
  })

  it('returns null when nothing is close enough', () => {
    expect(bestCompanyMatch('Completely Unrelated Company', candidates)).toBeNull()
  })

  it('returns null for an empty name or empty candidate list', () => {
    expect(bestCompanyMatch('', candidates)).toBeNull()
    expect(bestCompanyMatch('Zoomoov', [])).toBeNull()
  })
})
