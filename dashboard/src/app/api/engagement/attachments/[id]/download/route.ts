/**
 * GET /api/engagement/attachments/[id]/download → the attachment. The email-attachments storage
 * bucket went away with the move to Cloud SQL, so this now hands over to the data-room file
 * route: the Drive copy when the document is filed, else the bytes fetched again from Gmail.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { sbTry, enc } from '@/lib/crm/db'
import { privateThread, threadVisibleTo } from '@/lib/mail/visibility-server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  // A file on a colleague's private thread opens only for those who may open the thread (Jarod, 20 Nov 2026).
  const [att] = await sbTry<{ thread_id: string | null }[]>(`email_attachments?id=eq.${enc(id)}&select=thread_id&limit=1`, [])
  if (att?.thread_id && !(await threadVisibleTo(att.thread_id, await currentUserEmail()))) return NextResponse.json(await privateThread(att.thread_id), { status: 403 })
  return NextResponse.redirect(new URL(`/api/documents/${encodeURIComponent(id)}/file`, req.url))
}
