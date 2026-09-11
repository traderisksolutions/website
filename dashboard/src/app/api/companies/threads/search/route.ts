/**
 * GET /api/companies/threads/search?q= → threads from anywhere in the inbox, for the case
 * picker's second page. Used when a matter runs through a mailbox that was never filed under
 * the client you are looking at.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { sbTry, enc }                from '@/lib/crm/db'

type Row = {
  id: string
  subject: string | null
  snippet: string | null
  category: string | null
  last_message_at: string | null
  companies: { company_name: string | null } | null
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ threads: [] })
  try {
    const like = `*${enc(q)}*`
    const rows = await sbTry<Row[]>(
      `email_threads?deleted_at=is.null&subject=ilike.${like}&select=id,subject,snippet,category,last_message_at,companies(company_name)&order=last_message_at.desc&limit=40`,
      [],
    )
    return NextResponse.json({
      threads: rows.map(r => ({
        id: r.id,
        subject: r.subject,
        snippet: r.snippet,
        category: r.category,
        last_message_at: r.last_message_at,
        companyName: r.companies?.company_name ?? null,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
