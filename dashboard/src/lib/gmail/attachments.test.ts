import { describe, it, expect } from 'vitest'
import { collectFileParts, realFileParts, hasRealAttachments, attachmentRows, type MimePart } from './attachments'

// Anonymised shapes of what Gmail returns for format=full. No real names, files or addresses.
const text = (mime = 'text/plain'): MimePart => ({ mimeType: mime, body: { data: 'SGVsbG8' } })
const file = (filename: string, mimeType: string, size = 1000, extra: Partial<MimePart> = {}): MimePart =>
  ({ filename, mimeType, body: { attachmentId: `att-${filename}`, size }, ...extra })
const logo = (name = 'image001.png'): MimePart =>
  ({ filename: name, mimeType: 'image/png', headers: [{ name: 'Content-ID', value: '<img1@example>' }, { name: 'Content-Disposition', value: 'inline; filename="image001.png"' }], body: { attachmentId: 'att-logo', size: 4000 } })

describe('attachment capture', () => {
  it('a signature logo is not an attachment: no row, flag false', () => {
    const payload: MimePart = { mimeType: 'multipart/mixed', parts: [{ mimeType: 'multipart/related', parts: [text('text/html'), logo()] }] }
    expect(collectFileParts(payload)).toHaveLength(1)
    expect(realFileParts(payload)).toHaveLength(0)
    expect(hasRealAttachments(payload)).toBe(false)
  })

  it('a PDF beside an inline logo gets one row', () => {
    const payload: MimePart = { mimeType: 'multipart/mixed', parts: [{ mimeType: 'multipart/related', parts: [text('text/html'), logo()] }, file('Policy schedule.pdf', 'application/pdf', 220000)] }
    const rows = attachmentRows({ messageId: 'm1', threadId: 't1', payload })
    expect(rows).toEqual([{ message_id: 'm1', thread_id: 't1', gmail_attachment_id: 'att-Policy schedule.pdf', filename: 'Policy schedule.pdf', mime_type: 'application/pdf', size_bytes: 220000 }])
  })

  it('files inside an attached email are found, and the container too when Gmail keeps it whole', () => {
    const decomposed: MimePart = { mimeType: 'multipart/mixed', parts: [text(), { filename: 'Fwd claim.eml', mimeType: 'message/rfc822', body: {}, parts: [{ mimeType: 'multipart/mixed', parts: [text(), file('Claim form.pdf', 'application/pdf')] }] }] }
    const parts = realFileParts(decomposed)
    expect(parts.map(p => [p.filename, p.insideOf])).toEqual([['Fwd claim.eml', null], ['Claim form.pdf', 'Fwd claim.eml']])
    // the wrapper has no attachmentId, so its row carries null and the inner file carries its own
    const rows = attachmentRows({ messageId: 'm', threadId: 't', payload: decomposed })
    expect(rows.map(r => r.gmail_attachment_id)).toEqual([null, 'att-Claim form.pdf'])
    const whole: MimePart = { mimeType: 'multipart/mixed', parts: [text(), file('Fwd claim.eml', 'message/rfc822', 50000)] }
    expect(realFileParts(whole).map(p => p.filename)).toEqual(['Fwd claim.eml'])
  })

  it('types the extract route skipped still get a row (.msg, signed mail)', () => {
    const payload: MimePart = { mimeType: 'multipart/mixed', parts: [text(), file('Quote.msg', 'application/vnd.ms-outlook', 90000), file('smime.p7s', 'application/pkcs7-signature', 3000)] }
    expect(realFileParts(payload).map(p => p.filename)).toEqual(['Quote.msg', 'smime.p7s'])
  })

  it('a small part inlined by Gmail (data, no attachmentId) is still a file', () => {
    const payload: MimePart = { mimeType: 'multipart/mixed', parts: [text(), { filename: 'members.csv', mimeType: 'text/csv', body: { data: 'YSxiLGM', size: 7 } }] }
    const [p] = realFileParts(payload)
    expect(p.attachmentId).toBeNull(); expect(p.data).toBe('YSxiLGM')
  })

  it('the same file name twice on one message yields one row', () => {
    const payload: MimePart = { mimeType: 'multipart/mixed', parts: [file('DN.pdf', 'application/pdf'), { filename: 'old.eml', mimeType: 'message/rfc822', body: {}, parts: [file('DN.pdf', 'application/pdf', 999)] }] }
    expect(attachmentRows({ messageId: 'm', threadId: 't', payload }).map(r => r.filename)).toEqual(['DN.pdf', 'old.eml'])
  })

  it('a photo named like a claim document is kept; a bare camera image is not', () => {
    const payload: MimePart = { mimeType: 'multipart/mixed', parts: [file('IMG_2201.jpg', 'image/jpeg', 2_000_000), file('receipt scan.jpg', 'image/jpeg', 900_000)] }
    expect(realFileParts(payload).map(p => p.filename)).toEqual(['receipt scan.jpg'])
  })

  it('an Outlook embedded picture named img-<uuid> is not an attachment', () => {
    const payload: MimePart = { mimeType: 'multipart/mixed', parts: [file('img-c59e1fb8-c2b1-40c2-98a2-b502809a4f7b', 'image/png', 30000)] }
    expect(hasRealAttachments(payload)).toBe(false)
  })

  it('an empty or text-only message has no attachments', () => {
    expect(hasRealAttachments({ mimeType: 'text/plain', body: { data: 'aGk' } })).toBe(false)
    expect(hasRealAttachments(undefined)).toBe(false)
  })
})
