import { describe, expect, it } from 'vitest'
import { draftBodyToHtml, emailReadyHtml, htmlToDraftText, isBlankHtml, looksLikeHtml } from '@/lib/email-body'

const COMPARISON = [
  'Dear Ms Tan,',
  '',
  'Please find the quotes below.',
  '',
  '| Insurer | Option | Premium |',
  '|---|---|---|',
  '| AIG | S$1m | 1,200.00 |',
  '| Chubb <SG> | S$2m | 1,850.00 |',
  '',
  'Kind regards,',
  'Jarod',
].join('\n')

describe('draftBodyToHtml', () => {
  it('turns plain text into paragraphs with line breaks', () => {
    expect(draftBodyToHtml('Hello\nthere\n\nSecond')).toBe('<p>Hello<br>there</p><p>Second</p>')
  })

  it('turns a pipe table into a real table with a bold header and drops the separator row', () => {
    const html = draftBodyToHtml(COMPARISON)
    expect(html).toContain('<table><tbody><tr><td><strong>Insurer</strong></td>')
    expect(html).toContain('<td>AIG</td><td>S$1m</td><td>1,200.00</td>')
    expect(html).not.toContain('---')
    expect(html).toContain('Chubb &lt;SG&gt;')
    expect(html.startsWith('<p>Dear Ms Tan,</p><p>Please find the quotes below.</p><table>')).toBe(true)
    expect(html.endsWith('</table><p>Kind regards,<br>Jarod</p>')).toBe(true)
  })

  it('finds a table between text lines of one paragraph', () => {
    const html = draftBodyToHtml('Line one:\n| A | B |\n| 1 | 2 |\nAfter')
    expect(html).toBe('<p>Line one:</p><table><tbody><tr><td><strong>A</strong></td><td><strong>B</strong></td></tr><tr><td>1</td><td>2</td></tr></tbody></table><p>After</p>')
  })

  it('pads short rows so every row has the same number of cells', () => {
    const html = draftBodyToHtml('| A | B | C |\n| 1 |')
    expect(html).toContain('<tr><td>1</td><td><br></td><td><br></td></tr>')
  })

  it('leaves a single pipe row as text', () => {
    expect(draftBodyToHtml('| just one |')).toBe('<p>| just one |</p>')
  })

  it('escapes HTML in plain text and passes real HTML through', () => {
    expect(draftBodyToHtml('a < b & c')).toBe('<p>a &lt; b &amp; c</p>')
    expect(draftBodyToHtml('<p>Saved <strong>HTML</strong></p>')).toBe('<p>Saved <strong>HTML</strong></p>')
  })

  it('returns empty for an empty body', () => {
    expect(draftBodyToHtml('')).toBe('')
    expect(draftBodyToHtml('   \n ')).toBe('')
  })
})

describe('htmlToDraftText', () => {
  it('round-trips the comparison email back to pipe rows', () => {
    const text = htmlToDraftText(draftBodyToHtml(COMPARISON))
    expect(text).toBe([
      'Dear Ms Tan,',
      '',
      'Please find the quotes below.',
      '',
      '| Insurer | Option | Premium |',
      '| AIG | S$1m | 1,200.00 |',
      '| Chubb <SG> | S$2m | 1,850.00 |',
      '',
      'Kind regards,',
      'Jarod',
    ].join('\n'))
  })

  it('reads quill-table-better markup and lists and links', () => {
    const html = '<p>Hi</p><table class="ql-table-better"><tbody><tr data-row="r1"><td data-row="r1"><p class="ql-table-block">A | x</p></td><td><p>B</p></td></tr></tbody></table><ul><li>One</li><li>Two</li></ul><p><a href="https://trs.sg">site</a></p>'
    expect(htmlToDraftText(html)).toBe('Hi\n\n| A / x | B |\n\n• One\n• Two\n\nsite (https://trs.sg)')
  })
})

describe('emailReadyHtml', () => {
  it('adds inline borders to tables and cells and keeps existing styles', () => {
    const out = emailReadyHtml('<table style="width:100%"><tbody><tr><td>1</td><th class="x">2</th></tr></tbody></table>')
    expect(out).toMatch(/<table style="border-collapse:collapse;margin:4px 0;width:100%" cellspacing="0" cellpadding="0">|<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:4px 0;width:100%">/)
    expect(out).toContain('<td style="border:1px solid #dadce0;padding:4px 8px;font-size:13px;vertical-align:top">1</td>')
    expect(out).toContain('<th class="x" style="border:1px solid')
  })

  it('leaves non-table HTML unchanged', () => {
    expect(emailReadyHtml('<p>Hello <strong>you</strong></p>')).toBe('<p>Hello <strong>you</strong></p>')
  })
})

describe('isBlankHtml / looksLikeHtml', () => {
  it('treats an empty editor as blank', () => {
    expect(isBlankHtml('<p><br></p>')).toBe(true)
    expect(isBlankHtml('<p>Hi</p>')).toBe(false)
  })
  it('tells HTML from plain text', () => {
    expect(looksLikeHtml('<p>x</p>')).toBe(true)
    expect(looksLikeHtml('Dear <name>')).toBe(false)
  })
})
