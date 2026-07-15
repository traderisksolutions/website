import { describe, it, expect } from 'vitest'
import { parseEml, parseEmlSmart } from '@/lib/parse-eml'

// Build a raw multipart/mixed .eml the way Outlook forwards them: headers, a body, and a
// base64 attachment (an Excel here). CRLF line endings, as in real MIME.
function buildEml(attachmentName: string, attachmentBytes: Buffer): Buffer {
  const b = 'BOUND_1234'
  const lines = [
    'Subject: Red Beacon claim documents',
    'From: Nathan <nathan@redbeacon.example>',
    'Date: Mon, 14 Jul 2026 10:00:00 +0800',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b}"`,
    '',
    `--${b}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    'Please find the payroll schedule attached for the claim.',
    '',
    `--${b}`,
    `Content-Type: application/vnd.ms-excel; name="${attachmentName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${attachmentName}"`,
    '',
    attachmentBytes.toString('base64').match(/.{1,76}/g)!.join('\r\n'),
    '',
    `--${b}--`,
    '',
  ]
  return Buffer.from(lines.join('\r\n'), 'utf-8')
}

describe('parseEml — attached email extraction', () => {
  it('pulls out headers, body text, and the nested attachment intact', () => {
    const payload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]) // PK.. (xlsx magic) + bytes
    const eml = buildEml('payroll.xlsx', payload)
    const r = parseEml(eml)

    expect(r.text).toContain('Subject: Red Beacon claim documents')
    expect(r.text).toContain('From: Nathan')
    expect(r.text).toContain('Please find the payroll schedule attached')

    expect(r.attachments).toHaveLength(1)
    expect(r.attachments[0].filename).toBe('payroll.xlsx')
    // Nested attachment bytes must round-trip exactly through base64 decode.
    expect(r.attachments[0].data.equals(payload)).toBe(true)
  })

  it('handles quoted-printable body and multiple attachments', () => {
    const b = 'X'
    const raw = [
      'Subject: Test',
      `Content-Type: multipart/mixed; boundary="${b}"`,
      '',
      `--${b}`,
      'Content-Type: text/plain',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Cost is =C2=A31,000 today', // £ encoded
      `--${b}`,
      'Content-Type: application/pdf; name="a.pdf"',
      'Content-Disposition: attachment; filename="a.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('hello').toString('base64'),
      `--${b}`,
      'Content-Type: text/csv; name="b.csv"',
      'Content-Disposition: attachment; filename="b.csv"',
      'Content-Transfer-Encoding: 7bit',
      '',
      'a,b,c',
      `--${b}--`,
    ].join('\r\n')
    const r = parseEml(Buffer.from(raw, 'utf-8'))
    expect(r.text).toContain('Cost is')
    expect(r.attachments.map(a => a.filename)).toEqual(['a.pdf', 'b.csv'])
    expect(r.attachments[0].data.toString()).toBe('hello')
  })

  it('parseEmlSmart (mailparser) extracts body + attachment', async () => {
    const payload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 9, 8, 7])
    const r = await parseEmlSmart(buildEml('payroll.xlsx', payload))
    expect(r.text).toContain('Red Beacon claim documents')
    expect(r.text).toContain('payroll schedule')
    expect(r.attachments).toHaveLength(1)
    expect(r.attachments[0].filename).toBe('payroll.xlsx')
    expect(r.attachments[0].data.equals(payload)).toBe(true)
  })

  it('parseEmlSmart falls back gracefully on garbage input', async () => {
    const r = await parseEmlSmart(Buffer.from('not a real email at all', 'utf-8'))
    expect(r).toHaveProperty('text')
    expect(Array.isArray(r.attachments)).toBe(true)
  })

  it('falls back to HTML body when no plain text part', () => {
    const b = 'H'
    const raw = [
      'Subject: HTML only',
      `Content-Type: multipart/alternative; boundary="${b}"`,
      '',
      `--${b}`,
      'Content-Type: text/html',
      '',
      '<html><body><p>Hello <b>world</b></p></body></html>',
      `--${b}--`,
    ].join('\r\n')
    const r = parseEml(Buffer.from(raw, 'utf-8'))
    expect(r.text).toContain('Hello world')
    expect(r.text).not.toContain('<p>')
  })
})
