/**
 * GET /api/engagement/attachments/[id]/download → the attachment. The email-attachments storage
 * bucket went away with the move to Cloud SQL, so this now hands over to the data-room file
 * route: the Drive copy when the document is filed, else the bytes fetched again from Gmail.
 */
import { NextRequest, NextResponse } from 'next/server'
import { withStaffOrCron } from '@/lib/auth/guard'

export const GET = withStaffOrCron(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  return NextResponse.redirect(new URL(`/api/documents/${encodeURIComponent(id)}/file`, req.url))
})
