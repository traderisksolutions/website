/**
 * The email thread a stored file belongs to, for the ring-fence on file links (Jarod, 20 Nov 2026):
 * a file on a colleague's private thread opens only for those who may open the thread. A document
 * not tied to any thread (an upload, a generated file) has none and is unchanged.
 */
import { sbTry, enc } from '@/lib/crm/db'

export type FileLinks = { docThread?: string | null; docAttachmentThread?: string | null; idAttachmentThread?: string | null; messageThread?: string | null }

/** Pure. The document's own thread, else its attachment's, else the attachment the id names, else its message's. */
export function fileThread(l: FileLinks): string | null {
  return l.docThread || l.docAttachmentThread || l.idAttachmentThread || l.messageThread || null
}

/** The thread of a data-room document or an email-attachment id: bounded reads by id only. */
export async function threadOfFile(id: string, doc: { thread_id?: string | null; email_attachment_id?: string | null; message_id?: string | null } | null): Promise<string | null> {
  if (doc?.thread_id) return doc.thread_id
  const attId = doc?.email_attachment_id ?? (doc ? null : id)
  const [att] = attId ? await sbTry<{ thread_id: string | null }[]>(`email_attachments?id=eq.${enc(attId)}&select=thread_id&limit=1`, []) : []
  const [msg] = !att?.thread_id && doc?.message_id ? await sbTry<{ thread_id: string | null }[]>(`email_messages?id=eq.${enc(doc.message_id)}&select=thread_id&limit=1`, []) : []
  return fileThread({ docAttachmentThread: doc ? att?.thread_id : null, idAttachmentThread: doc ? null : att?.thread_id, messageThread: msg?.thread_id })
}
