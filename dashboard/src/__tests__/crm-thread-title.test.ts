import { describe, it, expect } from 'vitest'
import { sanitiseTitle, subjectMoved, TITLE_MAX } from '@/lib/crm/thread-title'

describe('sanitiseTitle', () => {
  it('keeps a good answer as is', () => {
    expect(sanitiseTitle('Beijing Gas — SP claim (IHP)')).toBe('Beijing Gas — SP claim (IHP)')
  })
  it('strips quotes, labels, prefixes, the firm tag and exclamation marks', () => {
    expect(sanitiseTitle('"Re: (TRS) Talent Trader — group benefits quotation!"')).toBe('Talent Trader — group benefits quotation')
    expect(sanitiseTitle('Title: Beijing Gas — SP claim')).toBe('Beijing Gas — SP claim')
  })
  it('takes the first line only', () => {
    expect(sanitiseTitle('Beijing Gas — SP claim\nSecond line')).toBe('Beijing Gas — SP claim')
  })
  it(`cuts at a word boundary under ${TITLE_MAX} characters`, () => {
    const long = 'Talent Trader Group Pte Ltd — group hospital and surgical plus term life quotation'
    const t = sanitiseTitle(long)!
    expect(t.length).toBeLessThanOrEqual(TITLE_MAX)
    expect(t.endsWith(' ')).toBe(false)
    expect(long.startsWith(t)).toBe(true)
  })
  it('returns null for nothing', () => {
    expect(sanitiseTitle('')).toBeNull()
    expect(sanitiseTitle('Re:')).toBeNull()
    expect(sanitiseTitle(null)).toBeNull()
  })
})

describe('subjectMoved', () => {
  it('ignores reply prefixes and case', () => {
    expect(subjectMoved([{ subject: 'Re: Re: Quotation' }, { subject: 'RE: quotation' }])).toBe(false)
  })
  it('sees a new subject', () => {
    expect(subjectMoved([{ subject: 'Re: SP claim — Li' }, { subject: 'Re: Quotation' }])).toBe(true)
  })
  it('needs two messages', () => {
    expect(subjectMoved([{ subject: 'Quotation' }])).toBe(false)
  })
})
