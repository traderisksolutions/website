/**
 * GET /api/debit-notes/next-number?issueDate=YYYY-MM-DD
 * Preview of the debit note number commitDebitNote() would mint for this issue date — lets the
 * review form show/confirm the number before approving, rather than only finding out after.
 * Best-effort: two people generating on the same date at the same moment could still collide,
 * in which case commitDebitNote's own clash-check on approve is the real source of truth and
 * will surface an error to retry, same as an explicit historical override does today.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { generateDebitNoteNumber }   from '@/lib/debit-note-commit'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const issueDate = req.nextUrl.searchParams.get('issueDate') || new Date().toISOString().slice(0, 10)
    const debitNoteNo = await generateDebitNoteNumber(issueDate)
    return NextResponse.json({ debitNoteNo })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
