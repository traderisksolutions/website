import { NextRequest, NextResponse } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { allMatching } from '@/lib/sales/leads'
import { parseFilters } from '@/lib/sales/filters'
import { BOM, csvRow } from '@/lib/sales/csv'
import type { LeadContact } from '@/lib/sales/types'

export const dynamic = 'force-dynamic'

// Every row matching the current filters, not just the visible page. The draft body is left out.
const COLUMNS = [
  'location', 'company', 'legal_name', 'domain', 'country', 'industry', 'company_size', 'account_status', 'recommended_action',
  'fit_score', 'intent_score', 'total_score', 'confidence', 'intent_summary', 'workflow_pain', 'conversation_angle', 'product_line',
  'exclusion_flags', 'contact_count', 'contact_name', 'contact_title', 'contact_email', 'email_status', 'email_verified',
  'email_source_url', 'contact_linkedin_url', 'outreach_status', 'outreach_channel', 'outreach_subject', 'drafted_at', 'approved_at',
  'sent_at', 'source_urls', 'source', 'discovery_date', 'last_researched_at', 'updated_at', 'id',
] as const
const CONTACT_COLUMNS = ['location', 'company', 'domain', 'industry', 'total_score', 'contact_name', 'contact_title', 'contact_email', 'email_status', 'contact_linkedin_url', 'contact_phone', 'outreach_status', 'id'] as const

export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const f = parseFilters(req.nextUrl.searchParams)
  const byContact = req.nextUrl.searchParams.get('grain') === 'contact'
  let body = BOM + csvRow(byContact ? [...CONTACT_COLUMNS] : [...COLUMNS])
  let n = 0
  try {
    const rows = await allMatching(f, byContact ? 'location,company,domain,industry,total_score,contacts,outreach_status,id' : COLUMNS.join(','))
    for (const r of rows) {
      if (byContact) {
        for (const c of (Array.isArray(r.contacts) ? r.contacts : []) as LeadContact[]) {
          body += csvRow([r.location, r.company, r.domain, r.industry, r.total_score, c.name, c.title, c.email, c.email_status, c.linkedin_url, c.phone, r.outreach_status, r.id]); n += 1
        }
      } else { body += csvRow(COLUMNS.map(c => r[c])); n += 1 }
    }
  } catch (e) {
    console.error('leads export failed', e instanceof Error ? e.message : e)
    return json({ error: 'Export failed' }, 500)
  }
  console.info('leads export', JSON.stringify({ user: who.email, grain: byContact ? 'contact' : 'account', location: f.location, rows: n }))
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
  return new NextResponse(body, { headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="trs-leads-${f.location === 'all' ? 'all' : f.location.toLowerCase()}${byContact ? '-contacts' : ''}-${day}.csv"`,
    'Cache-Control': 'private, no-store', 'X-Row-Count': String(n),
  } })
}
