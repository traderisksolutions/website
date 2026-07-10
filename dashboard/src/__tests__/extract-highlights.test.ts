import { describe, it, expect } from 'vitest'
import { extractHighlights } from '@/lib/extract-highlights'

describe('extractHighlights', () => {
  it('pulls <mark> text', () => {
    expect(extractHighlights('<p>Please note <mark>the excess is $35,000</mark> here.</p>'))
      .toEqual(['the excess is $35,000'])
  })

  it('pulls non-white background-color spans (the client highlighting a reply)', () => {
    const html = '<p>Their reply: <span style="background-color:#ffff00">Yes, we agree to bind</span></p>'
    expect(extractHighlights(html)).toEqual(['Yes, we agree to bind'])
  })

  it('ignores white / transparent backgrounds', () => {
    const html = '<span style="background-color:#ffffff">not highlighted</span><span style="background:transparent">also not</span>'
    expect(extractHighlights(html)).toEqual([])
  })

  it('dedupes and strips tags/entities', () => {
    const html = '<mark>A &amp; B</mark> ... <mark>A &amp; B</mark>'
    expect(extractHighlights(html)).toEqual(['A & B'])
  })

  it('handles empty/null', () => {
    expect(extractHighlights(null)).toEqual([])
    expect(extractHighlights('<p>no highlights</p>')).toEqual([])
  })
})
