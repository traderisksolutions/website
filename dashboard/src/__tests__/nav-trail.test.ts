import { describe, expect, it } from 'vitest'
import { trailAfter, trailAt } from '@/lib/nav/trail'

describe('trailAfter', () => {
  const thread = { label: 'Empyrion — group medical renewal', href: '/engagement?lead=t1' }
  const quote = { label: 'Quotation · Empyrion DC', href: '/pricing-matrix/quote/q1' }
  const plans = { label: 'Plan builder', href: '/pricing-matrix/quote/q1/plans?scenario=A' }
  it('grows as pages are clicked through', () => {
    expect(trailAfter(trailAfter(trailAfter([], thread), quote), plans)).toEqual([thread, quote, plans])
  })
  it('cuts back to a page already on the trail instead of looping', () => {
    expect(trailAfter([thread, quote, plans], quote)).toEqual([thread, quote])
  })
  it('keeps at most eight steps', () => {
    let t: typeof thread[] = []
    for (let i = 0; i < 12; i++) t = trailAfter(t, { label: `p${i}`, href: `/p/${i}` })
    expect(t).toHaveLength(8)
    expect(t[0].href).toBe('/p/4')
  })
})

describe('trailAt', () => {
  const inbox = { label: 'Inbox', href: '/engagement' }
  it('moves the last step to the open thread when it is the same page', () => {
    expect(trailAt([inbox], '/engagement?lead=abc', 'Inbox · Renewal')).toEqual([{ label: 'Inbox · Renewal', href: '/engagement?lead=abc' }])
  })
  it('keeps the label when none is given', () => {
    expect(trailAt([{ label: 'OUE', href: '/companies/1' }], '/companies/1?tab=eb')).toEqual([{ label: 'OUE', href: '/companies/1?tab=eb' }])
  })
  it('leaves a trail ending on another page alone', () => {
    expect(trailAt([inbox], '/companies/1?tab=eb')).toEqual([inbox])
    expect(trailAt([], '/engagement?lead=a')).toEqual([])
  })
})
