/**
 * GET /api/companies/[id]/threads
 * Every email thread belonging to a company, for the company page's Threads tab. Two sources,
 * merged: threads with company_id set directly (the fast path, post-backfill — see
 * 20260907_email_threads_company_id.sql), plus threads whose contact_id belongs to this company
 * (via getCompanyContactIds) but whose company_id is still NULL — covers any thread ingested
 * before the ingest-route fix, or any edge case the backfill missed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { getCompanyContactIds }      from '@/lib/company-profile'

type ThreadRow = {
  id: string; subject: string | null; snippet: string | null; last_message_at: string | null
  status: string; contact_id: string | null; message_count: number
  contacts: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null
}

const SELECT = 'id,subject,snippet,last_message_at,status,contact_id,message_count,contacts(id,first_name,last_name,email)'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const contactIds = await getCompanyContactIds(id)

    const [directRes, viaContactRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/email_threads?company_id=eq.${id}&select=${SELECT}&order=last_message_at.desc.nullslast&limit=200`, { headers: sbH(), cache: 'no-store' }),
      contactIds.length > 0
        ? fetch(`${SB_URL}/rest/v1/email_threads?contact_id=in.(${contactIds.join(',')})&company_id=is.null&select=${SELECT}&order=last_message_at.desc.nullslast&limit=200`, { headers: sbH(), cache: 'no-store' })
        : Promise.resolve(null),
    ])

    const direct: ThreadRow[] = directRes.ok ? await directRes.json() : []
    const viaContact: ThreadRow[] = viaContactRes?.ok ? await viaContactRes.json() : []

    const seen = new Set<string>()
    const threads = [...direct, ...viaContact].filter(t => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    }).sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))

    return NextResponse.json({ threads })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
