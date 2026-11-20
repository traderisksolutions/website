/**
 * GET /api/documents/[id]/file → the document: its Drive file when filed, otherwise the bytes
 * fetched from Gmail. Accepts a data-room id or an email-attachment id, so the old attachment
 * links (whose storage bucket no longer exists) work through here as well.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { fail, gate, isUuid } from '@/lib/placement/api'
import * as store from '@/lib/documents/store'
import { attachmentBytes } from '@/lib/documents/drive'
import { threadOfFile } from '@/lib/documents/file-thread'
import { currentUserEmail } from '@/lib/crm/auth'
import { privateThread, threadVisibleTo } from '@/lib/mail/visibility-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Document id is not valid')
  try {
    const doc = (await store.documentById(id)) ?? (await store.documentForAttachment(id))
    // A file on a colleague's private thread opens only for those who may open the thread (Jarod, 20 Nov 2026).
    const thread = await threadOfFile(id, doc)
    if (thread && !(await threadVisibleTo(thread, await currentUserEmail()))) return NextResponse.json(await privateThread(thread), { status: 403 })
    if (doc?.drive_url) return NextResponse.redirect(doc.drive_url)
    const att = doc?.email_attachment_id ? await store.attachment(doc.email_attachment_id) : await store.attachment(id)
    if (!att) return fail('Document not found', 404)
    const msg = await store.message(att.message_id)
    if (!msg?.gmail_message_id) return fail('The email this file came with is not on file', 404)
    const bytes = await attachmentBytes(msg.gmail_message_id, att.filename)
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': att.mime_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${att.filename.replace(/[^\w.\- ()]/g, '_')}"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not fetch the file', 502)
  }
}
