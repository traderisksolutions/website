/**
 * Shared Gmail MIME builder. Extracted so every send path (engagement replies,
 * inbound first-touch replies) produces identical MIME — including the threading
 * headers (Message-ID / In-Reply-To / References) added for the reply-thread fix.
 * Previously each route carried its own near-duplicate copy, which drifted.
 */

export const DEFAULT_FROM = 'operations@trade-risksol.com'

export type EmailAttachment = { filename: string; mimeType: string; dataB64: string }
export type ThreadingHeaders = { messageId?: string; inReplyTo?: string; references?: string }

export function htmlToText(html: string): string {
  return html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/ul>|<\/ol>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function encodeSubject(subject: string): string {
  if (!/[^\x20-\x7E]/.test(subject)) return subject
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
}

function wrapBase64Lines(b64: string): string {
  return b64.match(/.{1,76}/g)?.join('\r\n') ?? b64
}

export function buildRawEmail(to: string, subject: string, body: string, htmlBody?: string | null, cc?: string[], bcc?: string[], replyTo?: string, fromEmail = DEFAULT_FROM, attachments?: EmailAttachment[], threading?: ThreadingHeaders): string {
  const boundary    = `trs_${Date.now()}`
  const plainText   = htmlBody ? htmlToText(htmlBody) : body
  const emailCss = `<style>body{margin:0;padding:0}p{margin:0 0 10px 0;padding:0}p:last-child{margin-bottom:0}ul,ol{margin:0 0 10px 0;padding-left:22px}li{margin-bottom:3px}strong{font-weight:600}a{color:#1d4ed8}img{max-width:100%;height:auto;display:block;margin:8px 0}</style>`
  const bodyStyle = `font-family:Arial,sans-serif;font-size:14px;line-height:1.65;color:#333`
  const fullHtml    = htmlBody
    ? `<!DOCTYPE html><html><head><meta charset="utf-8">${emailCss}</head><body style="${bodyStyle}">${htmlBody}</body></html>`
    : `<!DOCTYPE html><html><head><meta charset="utf-8">${emailCss}</head><body style="${bodyStyle}"><p style="white-space:pre-wrap">${body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p></body></html>`

  const plainB64 = wrapBase64Lines(Buffer.from(plainText, 'utf-8').toString('base64'))
  const htmlB64  = wrapBase64Lines(Buffer.from(fullHtml,  'utf-8').toString('base64'))

  // Address + subject headers are shared; the body layout differs when attachments are present.
  const headers = [
    `From: Trade Risk Solutions <${fromEmail}>`,
    `To: ${to}`,
    ...(replyTo && replyTo !== fromEmail ? [`Reply-To: ${replyTo}`] : []),
    ...(cc?.length  ? [`Cc: ${cc.join(', ')}`]  : []),
    ...(bcc?.length ? [`Bcc: ${bcc.join(', ')}`] : []),
    `Subject: ${encodeSubject(subject)}`,
    // Threading headers — In-Reply-To/References make the recipient's client (Gmail,
    // Outlook, Apple Mail) group this into the original conversation. A self-assigned
    // Message-ID lets us keep the chain continuous when they reply back to us.
    ...(threading?.messageId  ? [`Message-ID: ${threading.messageId}`]   : []),
    ...(threading?.inReplyTo  ? [`In-Reply-To: ${threading.inReplyTo}`]  : []),
    ...(threading?.references ? [`References: ${threading.references}`]   : []),
    'MIME-Version: 1.0',
  ]

  const altPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    plainB64,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    htmlB64,
    '',
    `--${boundary}--`,
  ]

  const atts = attachments?.filter(a => a.dataB64) ?? []
  if (atts.length === 0) {
    const lines = [...headers, `Content-Type: multipart/alternative; boundary="${boundary}"`, '', ...altPart]
    return Buffer.from(lines.join('\r\n')).toString('base64url')
  }

  // Wrap the alternative body + attachments in a multipart/mixed envelope.
  const mixed = `mixed_${Date.now()}`
  const lines = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    ...altPart,
    '',
    ...atts.flatMap(a => [
      `--${mixed}`,
      `Content-Type: ${a.mimeType || 'application/octet-stream'}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64Lines(a.dataB64),
      '',
    ]),
    `--${mixed}--`,
  ]
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}
