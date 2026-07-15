/**
 * Best-effort raw MIME parser for attached emails (.eml / message/rfc822).
 *
 * No mail-parser dependency is available, and Outlook-style forwards attach the original email
 * (with its own attachments) as a single message/rfc822 blob that the Nexus extractor used to
 * skip entirely. This walks the MIME tree well enough to pull out the body text and each nested
 * attachment so they can be read. Mostly-ASCII business mail is the target; exotic charsets are
 * decoded as UTF-8 best-effort.
 */

export type EmlResult = { text: string; attachments: { filename: string; data: Buffer }[] }

export function emlHeader(headerBlock: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*(.*(?:\\r?\\n[ \\t].*)*)`, 'im')
  const m  = re.exec(headerBlock)
  return m ? m[1].replace(/\r?\n[ \t]+/g, ' ').trim() : ''
}

function emlFilename(contentType: string, disposition: string): string | null {
  const m = /name\*?="?([^";]+)"?/i.exec(disposition) || /name\*?="?([^";]+)"?/i.exec(contentType)
  return m ? m[1].trim().replace(/^UTF-8''/i, '') : null
}

function emlDecode(body: string, encoding: string): Buffer {
  const enc = (encoding || '').toLowerCase()
  if (enc === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64')
  if (enc === 'quoted-printable') {
    return Buffer.from(body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'binary')
  }
  return Buffer.from(body, 'binary')
}

function emlStripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

function emlWalk(raw: string, acc: EmlResult, depth: number): void {
  if (depth > 6) return
  const sep = raw.search(/\r?\n\r?\n/)
  const headerBlock = sep >= 0 ? raw.slice(0, sep) : raw
  const body        = sep >= 0 ? raw.slice(sep).replace(/^\r?\n\r?\n/, '') : ''
  const ctype = emlHeader(headerBlock, 'Content-Type')
  const cte   = emlHeader(headerBlock, 'Content-Transfer-Encoding')
  const cdisp = emlHeader(headerBlock, 'Content-Disposition')
  const mimeType = (ctype.split(';')[0] || '').trim().toLowerCase()

  const boundary = /boundary="?([^";]+)"?/i.exec(ctype)?.[1]
  if (mimeType.startsWith('multipart/') && boundary) {
    const chunks = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`))
    for (const chunk of chunks) { if (chunk.trim()) emlWalk(chunk, acc, depth + 1) }
    return
  }

  const filename = emlFilename(ctype, cdisp)
  if (filename || /attachment/i.test(cdisp)) {
    if (filename) acc.attachments.push({ filename, data: emlDecode(body, cte) })
    return
  }
  if (mimeType === 'text/plain') {
    acc.text += emlDecode(body, cte).toString('utf-8') + '\n'
  } else if (mimeType === 'text/html' && !acc.text.trim()) {
    acc.text += emlStripHtml(emlDecode(body, cte).toString('utf-8')) + '\n'
  }
}

export function parseEml(data: Buffer): EmlResult {
  const raw = data.toString('binary')
  const acc: EmlResult = { text: '', attachments: [] }
  const head = raw.slice(0, 8000)
  const meta = [
    emlHeader(head, 'Subject') && `Subject: ${emlHeader(head, 'Subject')}`,
    emlHeader(head, 'From')    && `From: ${emlHeader(head, 'From')}`,
    emlHeader(head, 'Date')    && `Date: ${emlHeader(head, 'Date')}`,
  ].filter(Boolean).join('\n')
  emlWalk(raw, acc, 0)
  acc.text = (meta ? meta + '\n\n' : '') + acc.text.trim()
  return acc
}
