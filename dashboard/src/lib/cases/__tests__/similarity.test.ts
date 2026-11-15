import { describe, it, expect } from 'vitest'
import { threadText, bySimilarity } from '../similarity'

describe('threadText', () => {
  const reply = 'Hi Nathan,\n\nPlease renew on the same terms.\n\nBest regards,\nAlex Tan\nFinance Manager\n\nFrom: Nathan <nathan@trade-risksol.com>\nSent: Monday, 9 November 2026 10:00 AM\nTo: Alex Tan <alex@client.invalid>\nSubject: Renewal 2027\n\nDear Alex, the renewal terms are attached.'
  it('is the subject, then what each message says itself', () => {
    expect(threadText('Renewal 2027', [{ subject: 'RE: Renewal 2027', body_text: reply }])).toBe('Renewal 2027\nHi Nathan,\n\nPlease renew on the same terms.')
  })
  it('reads the first three messages that say something', () => {
    const m = (t: string) => ({ subject: 'Census', body_text: t })
    expect(threadText('Census', [m('First.'), m(''), m('Second.'), m('Third.'), m('Fourth.')])).toBe('Census\nFirst.\nSecond.\nThird.')
  })
  it('is bounded, and a thread with nothing is its subject', () => {
    expect(threadText('S', [{ body_text: 'word '.repeat(2000) }, { body_text: 'word '.repeat(2000) }, { body_text: 'word '.repeat(2000) }]).length).toBeLessThanOrEqual(1600)
    expect(threadText('Payment advice', [])).toBe('Payment advice')
    expect(threadText(null, [])).toBe('')
  })
})

describe('bySimilarity', () => {
  const rows = [{ id: 'a', last_message_at: '2026-11-01' }, { id: 'b', last_message_at: '2026-11-03' }, { id: 'c', last_message_at: '2026-11-02' }, { id: 'd', last_message_at: null }]
  it('is newest first with no scores', () => {
    expect([...rows].sort(bySimilarity()).map(r => r.id)).toEqual(['b', 'c', 'a', 'd'])
  })
  it('puts the closest first, the unscored after, newest first within a tie', () => {
    expect([...rows].sort(bySimilarity(new Map([['a', 0.7], ['d', 0.9]]))).map(r => r.id)).toEqual(['d', 'a', 'b', 'c'])
    expect([...rows].sort(bySimilarity(new Map([['a', 0.5], ['c', 0.5]]))).map(r => r.id)).toEqual(['c', 'a', 'b', 'd'])
  })
})
