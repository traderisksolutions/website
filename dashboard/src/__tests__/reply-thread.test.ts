import { describe, it, expect } from 'vitest'
import { buildQuotedHistory, buildReferences, type ThreadMessage } from '@/lib/build-reply-thread'
import { buildRawEmail, type ThreadingHeaders } from '@/lib/email-mime'

// End-to-end dogfood: reproduce exactly what /api/email/send composes for a reply, then
// decode the raw MIME that would hit Gmail and assert on the real bytes. Mirrors the AIA
// Healthway thread (Catherine ↔ Terence). No network — the send route only adds token/DB.

// A realistic two-message thread. The newer message's stored body_html already embeds the
// older one as a Gmail quote (that's how the client composed it) — the helper must strip
// that and re-nest, so history isn't duplicated.
const thread: ThreadMessage[] = [
  {
    from_address: 'operations@trade-risksol.com', from_name: 'Catherine Lim',
    sent_at: '2026-07-14T08:16:00Z', rfc822_message_id: '<cat-1@mail.gmail.com>',
    body_text: 'Please find attached the payslips for Tan Xin Xin, Yasmin as requested.',
    body_html: '<p>Please find attached the payslips for Tan Xin Xin, Yasmin as requested.</p>',
  },
  {
    from_address: 'terenceyip@aia.com.sg', from_name: 'Terence Yip',
    sent_at: '2026-07-14T08:22:00Z', rfc822_message_id: '<terence-2@aia.com.sg>',
    body_text: 'Following up on the claim progress for this insured.\nOn Tue, Catherine wrote:\n> Please find attached the payslips',
    body_html:
      '<p>Following up on the claim progress for this insured.</p>' +
      '<div class="gmail_quote"><blockquote>Please find attached the payslips for Tan Xin Xin, Yasmin as requested.</blockquote></div>' +
      '<script>steal()</script>',
  },
]

// Reproduce send/route.ts step 4b + buildRawEmail exactly.
function composeReply(draftHtml: string, signatureHtml: string, prior: ThreadMessage[]) {
  let finalHtml  = draftHtml + signatureHtml
  let finalPlain = 'reply plain'
  const ourMessageId = '<generated-uuid@trade-risksol.com>'
  const threading: ThreadingHeaders = { messageId: ourMessageId }
  if (prior.length > 0) {
    const quote = buildQuotedHistory(prior)
    if (quote.html) finalHtml = `${finalHtml}<br><br>${quote.html}`
    if (quote.text) finalPlain = `${finalPlain}\n\n${quote.text}`
    const refs = buildReferences(prior)
    threading.inReplyTo  = refs.inReplyTo
    threading.references = refs.references
  }
  const raw = buildRawEmail(
    'terenceyip@aia.com.sg', 'Re: [EXTERNAL] TRS(AIA) : Healthway Group Term Life Claim',
    finalPlain, finalHtml, ['operations@trade-risksol.com'], undefined,
    undefined, 'operations@trade-risksol.com', undefined, threading,
  )
  return { rawDecoded: Buffer.from(raw, 'base64url').toString('utf-8'), threading }
}

function extractPart(mime: string, contentType: string): string {
  // Split on boundary, find the section whose headers include the content type, base64-decode.
  const sections = mime.split(/--trs_\d+/)
  for (const s of sections) {
    if (s.includes(contentType)) {
      const b64 = s.split(/\r?\n\r?\n/).slice(1).join('\n').replace(/[^A-Za-z0-9+/=]/g, '')
      if (b64) return Buffer.from(b64, 'base64').toString('utf-8')
    }
  }
  return ''
}

describe('reply threading — end to end MIME', () => {
  const { rawDecoded, threading } = composeReply(
    '<p>Dear Terence, the payout is scheduled for next week.</p>',
    '<hr><p>Catherine Lim</p>',
    thread,
  )

  it('emits threading headers pointing at the chain', () => {
    expect(rawDecoded).toContain('Message-ID: <generated-uuid@trade-risksol.com>')
    // In-Reply-To = newest prior message; References = full chain oldest→newest.
    expect(rawDecoded).toContain('In-Reply-To: <terence-2@aia.com.sg>')
    expect(rawDecoded).toContain('References: <cat-1@mail.gmail.com> <terence-2@aia.com.sg>')
    expect(threading.inReplyTo).toBe('<terence-2@aia.com.sg>')
  })

  it('HTML part: reply, then signature, then quoted history in that order', () => {
    const html = extractPart(rawDecoded, 'text/html')
    const iReply = html.indexOf('payout is scheduled')
    const iSig   = html.indexOf('Catherine Lim')
    const iQuote = html.indexOf('gmail_quote')
    expect(iReply).toBeGreaterThanOrEqual(0)
    expect(iSig).toBeGreaterThan(iReply)
    expect(iQuote).toBeGreaterThan(iSig)
  })

  it('de-duplicates embedded history and nests newest→oldest', () => {
    const html = extractPart(rawDecoded, 'text/html')
    // "payslips" (the oldest message) must appear exactly once despite being embedded
    // inside the newer message's stored body_html.
    expect((html.match(/payslips/g) ?? []).length).toBe(1)
    // Terence's attribution comes before Catherine's (newest wraps oldest). Attribution
    // angle-brackets are HTML-escaped, so match the escaped form.
    expect(html.indexOf('Terence Yip &lt;terenceyip')).toBeGreaterThanOrEqual(0)
    expect(html.indexOf('Terence Yip &lt;terenceyip'))
      .toBeLessThan(html.indexOf('Catherine Lim &lt;operations'))
  })

  it('sanitizes dangerous content from quoted HTML', () => {
    const html = extractPart(rawDecoded, 'text/html')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('steal()')
  })

  it('plain-text part carries the conversation too', () => {
    const text = extractPart(rawDecoded, 'text/plain')
    expect(text).toContain('Terence Yip')
    expect(text).toContain('payslips')
  })

  it('does not thread when there is no prior history (new send)', () => {
    const { rawDecoded: fresh, threading: t } = composeReply('<p>Hi</p>', '', [])
    expect(fresh).toContain('Message-ID:')
    expect(fresh).not.toContain('In-Reply-To:')
    expect(fresh).not.toContain('References:')
    expect(t.inReplyTo).toBeUndefined()
  })
})
