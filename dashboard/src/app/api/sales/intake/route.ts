import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { ingestLeads, type IngestLead } from '@/lib/sales/ingest'
import { syncAudience } from '@/lib/sales/audience'
import { logSalesEvent } from '@/lib/sales/events'

// POST leads from TRS's lead-generation tool. Header x-api-key: SALES_INTAKE_KEY.
// Body: { source?: string, leads: [{ company, domain, country, industry?, why_now?, source_url?,
//   product_line?, fit_score?, intent_score?, recommended_action?, evidence?,
//   contacts: [{ name, title?, email?, email_basis?, email_source_url?, phone?, phone_basis?, linkedin_url?, draft_message? }] }] }
// At most 50 leads a request. Writes sales_accounts / sales_contacts; drafts land as pending_approval.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorised(req: Request): boolean {
  const want = process.env.SALES_INTAKE_KEY ?? ''
  const got = req.headers.get('x-api-key') ?? ''
  if (want.length < 32 || got.length !== want.length) return false
  return timingSafeEqual(Buffer.from(got), Buffer.from(want))
}

export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const text = await req.text()
  if (text.length > 500_000) return NextResponse.json({ error: 'Body over 500 KB: send at most 50 leads a request' }, { status: 413 })
  let body: { source?: unknown; leads?: unknown }
  try { body = JSON.parse(text) } catch { return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 }) }
  if (!Array.isArray(body.leads) || body.leads.length === 0) return NextResponse.json({ error: 'leads must be a non-empty array' }, { status: 422 })
  if (body.leads.length > 50) return NextResponse.json({ error: 'At most 50 leads a request' }, { status: 422 })
  const source = typeof body.source === 'string' && /^[a-z0-9_-]{2,30}$/i.test(body.source) ? body.source.toLowerCase() : 'lead_tool'
  try {
    const result = await ingestLeads(body.leads as IngestLead[], source)
    await logSalesEvent({ kind: 'intake', actor: `system:${source}`, detail: { leads: body.leads.length, ...result, skipped: result.skipped.length } })
    await syncAudience()
    return NextResponse.json(result)
  } catch (e) {
    console.error('sales intake failed', e instanceof Error ? e.message.slice(0, 200) : e)
    return NextResponse.json({ error: 'Could not save the leads' }, { status: 500 })
  }
}
