/**
 * Attachment capture at ingest. Every real file on a message gets an email_attachments row the
 * moment the message is stored, whatever mailbox it came from and whatever the file type.
 *
 * Why this exists (2 Nov 2026): rows used to be written only by the Nexus extract route, which
 * fetches the message again with the operations@ token. A message read from a person's own
 * mailbox (gmail_mailboxes) has a Gmail id that mailbox alone knows, so the fetch failed and
 * 1,342 messages with real files had no rows. The same route also skipped unsupported types
 * without a row, and has_attachments was set by any part with a filename, signature logos
 * included, so the flag said "attached" for 800 messages that carried nothing.
 *
 * The walker here records the file's place on the message (gmail attachment id, size, mime) and
 * leaves text extraction and data-room filing to the readers that already do that work.
 */
import { SB_URL, sbHeaders } from '@/lib/sb'
import { isNoise } from '@/lib/documents/taxonomy'

export type MimePart = {
  partId?: string
  filename?: string
  mimeType?: string
  headers?: { name: string; value: string }[]
  body?: { attachmentId?: string; size?: number; data?: string }
  parts?: MimePart[]
}

export type FilePart = {
  filename: string
  mimeType: string
  attachmentId: string | null
  size: number
  /** The part's own bytes when Gmail inlined them (small parts carry data instead of an id). */
  data: string | null
  /** Inside an attached message (message/rfc822): the container's file name. */
  insideOf: string | null
  /** Referenced from the HTML by Content-ID, or declared inline: a picture in the body. */
  inline: boolean
}

const header = (p: MimePart, name: string) => (p.headers ?? []).find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

/** Every part that carries a file name, at any depth, including inside attached messages. */
export function collectFileParts(payload: MimePart | undefined | null): FilePart[] {
  const out: FilePart[] = []
  const walk = (p: MimePart | undefined, insideOf: string | null, depth: number) => {
    if (!p || depth > 8) return
    if (p.filename) {
      const disposition = header(p, 'Content-Disposition')
      const cid = header(p, 'Content-ID')
      out.push({
        filename: p.filename, mimeType: p.mimeType ?? 'application/octet-stream',
        attachmentId: p.body?.attachmentId ?? null, size: p.body?.size ?? 0, data: p.body?.data ?? null,
        insideOf, inline: /^inline/i.test(disposition.trim()) || (!!cid && /^image\//i.test(p.mimeType ?? '')),
      })
    }
    const container = p.mimeType === 'message/rfc822' ? (p.filename || 'attached message.eml') : insideOf
    for (const c of p.parts ?? []) walk(c, container, depth + 1)
  }
  walk(payload ?? undefined, null, 0)
  return out
}

/** The parts worth a row: real files, not signature logos, inline pictures or calendar noise. */
export function realFileParts(payload: MimePart | undefined | null): FilePart[] {
  const seen = new Set<string>()
  return collectFileParts(payload).filter(p => {
    if (p.inline && /^image\//i.test(p.mimeType)) return false
    // Outlook names embedded pictures img-<uuid> with no extension and no Content-ID.
    if (/^img-[0-9a-f-]{20,}$/i.test(p.filename)) return false
    // An attached email is kept even when the noise rule would drop a .eml: it holds the forwarded
    // original, which the thread stitcher and the readers want.
    if (p.mimeType !== 'message/rfc822' && isNoise(p.filename, p.mimeType)) return false
    // One row per file name on the message (email_attachments is unique on message_id, filename);
    // the first occurrence wins, which is the outer one for a file both attached and quoted.
    const key = p.filename.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const hasRealAttachments = (payload: MimePart | undefined | null) => realFileParts(payload).length > 0

export type CaptureInput = { messageId: string; threadId: string; payload: MimePart | undefined | null }

/** Rows for the message's real files. Idempotent: the (message_id, filename) key merges on re-ingest. */
export function attachmentRows(input: CaptureInput) {
  return realFileParts(input.payload).map(p => ({
    message_id: input.messageId, thread_id: input.threadId,
    gmail_attachment_id: p.attachmentId, filename: p.filename, mime_type: p.mimeType, size_bytes: p.size,
  }))
}

/**
 * Writes the rows. Returns how many were written. Never throws: a capture failure must not
 * fail the ingest, and the backfill retries anything missing.
 */
export async function captureAttachments(input: CaptureInput): Promise<{ written: number; files: string[] }> {
  const rows = attachmentRows(input)
  if (!rows.length) return { written: 0, files: [] }
  try {
    const res = await fetch(`${SB_URL}/rest/v1/email_attachments?on_conflict=message_id,filename`, {
      method: 'POST', headers: sbHeaders('resolution=ignore-duplicates,return=minimal'), body: JSON.stringify(rows),
    })
    if (!res.ok) { console.warn('[attachments] capture failed:', res.status, (await res.text()).slice(0, 200)); return { written: 0, files: [] } }
    return { written: rows.length, files: rows.map(r => r.filename) }
  } catch (e) {
    console.warn('[attachments] capture failed:', e instanceof Error ? e.message : e)
    return { written: 0, files: [] }
  }
}
