import { describe, it, expect } from 'vitest'
import { cardsInForce } from '@/lib/gb/table-version'

const qbe11 = { id: 'v11', insurer_id: 'qbe', insurer_name: 'QBE', effective_date: '2026-01-01', renewal_effective_date: null }
const qbe12 = { id: 'v12', insurer_id: 'qbe', insurer_name: 'QBE', effective_date: '2026-07-01', renewal_effective_date: '2026-09-02' }
const sl = { id: 'sl', insurer_id: 'sl', insurer_name: 'Singlife', effective_date: null }
const ids = (r: { cards: { id: string }[] }) => r.cards.map(c => c.id).sort()

describe('rate card in force', () => {
  it('new business from 1 Jul takes V12; a renewal before 2 Sep keeps V11', () => {
    expect(ids(cardsInForce([qbe11, qbe12, sl], '2026-07-15', 'new_business'))).toEqual(['sl', 'v12'])
    expect(ids(cardsInForce([qbe11, qbe12, sl], '2026-08-01', 'renewal'))).toEqual(['sl', 'v11'])
    expect(ids(cardsInForce([qbe11, qbe12, sl], '2026-09-02', 'renewal'))).toEqual(['sl', 'v12'])
  })
  it('an undated card is used when nothing dated is in force; a card only in the future is not used', () => {
    expect(ids(cardsInForce([sl], '2026-01-01', 'new_business'))).toEqual(['sl'])
    const r = cardsInForce([qbe12], '2026-06-01', 'new_business')
    expect(r.cards).toEqual([])
    expect(r.notes[0]).toMatch(/no rate card in force on 2026-06-01/)
  })
})

describe('package size limits', () => {
  const cards = [{ id: 'q', insurer_id: 'q', insurer_name: 'QBE Insurance (Singapore) Pte Ltd', effective_date: null }, { id: 'i', insurer_id: 'i', insurer_name: 'Income Insurance Limited', effective_date: null }, { id: 'a', insurer_id: 'a', insurer_name: 'AIA Singapore', effective_date: null }]
  it('drops QBE MCare+ above 50 employees and Income above 100, keeping insurers with no limit on file', async () => {
    const { withinPackageLimits } = await import('@/lib/gb/table-version')
    expect(withinPackageLimits(cards, 40).cards.map(c => c.id)).toEqual(['q', 'i', 'a'])
    const r = withinPackageLimits(cards, 80)
    expect(r.cards.map(c => c.id)).toEqual(['i', 'a'])
    expect(r.notes[0]).toMatch(/QBE MCare\+: 80 employees is above its 50/)
    expect(withinPackageLimits(cards, 150).cards.map(c => c.id)).toEqual(['a'])
  })
})
