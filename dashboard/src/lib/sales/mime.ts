// RFC 5322 message builder for the Gmail API's `raw` field. Pure; tested.

import { randomUUID } from 'node:crypto'

/** RFC 2047 encoded-word for any header holding non-ASCII text. */
export function encodeHeader(s: string): string {
  return /^[\x00-\x7F]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

/** Strip CR/LF so a value can never inject another header. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

export function newMessageId(domain: string): string {
  return `<${randomUUID()}@${domain}>`
}

export function buildMime(m: {
  fromName: string; fromEmail: string; to: string; bcc?: string | null; subject: string; text: string; html: string
  messageId: string; inReplyTo?: string | null; unsubscribeUrl: string | null
}): string {
  const boundary = `trs-${randomUUID()}`
  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n')
  const headers = [
    `From: ${encodeHeader(oneLine(m.fromName))} <${oneLine(m.fromEmail)}>`,
    `To: ${oneLine(m.to)}`,
    ...(m.bcc ? [`Bcc: ${oneLine(m.bcc)}`] : []),
    `Subject: ${encodeHeader(oneLine(m.subject))}`,
    `Message-ID: ${m.messageId}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`] : []),
    // One-click unsubscribe (RFC 8058): Gmail and Yahoo expect it on bulk mail.
    ...(m.unsubscribeUrl ? [`List-Unsubscribe: <${oneLine(m.unsubscribeUrl)}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click'] : []),
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
  const body = [
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(m.text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(m.html),
    `--${boundary}--`, '',
  ]
  return [...headers, '', ...body].join('\r\n')
}

export const toBase64Url = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
