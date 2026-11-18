import { describe, it, expect } from 'vitest'
import { sanitizeEmailHtml } from '@/lib/sanitize-email-html'

describe('sanitizeEmailHtml', () => {
  it('strips scripts and handlers, keeps tables, opens links in a new tab', () => {
    const out = sanitizeEmailHtml('<table><tr><td onclick="x()">SGD 1,200</td></tr></table><script>alert(1)</script><a href="https://a.invalid">Quote</a>')
    expect(out).toContain('<td>SGD 1,200</td>')
    expect(out).not.toContain('script')
    expect(out).not.toContain('onclick')
    expect(out).toContain('target="_blank" rel="noopener noreferrer"')
  })

  it('drops unresolved cid images', () => {
    expect(sanitizeEmailHtml('<p>Hi</p><img src="cid:logo123">')).toBe('<p>Hi</p>')
  })
})
