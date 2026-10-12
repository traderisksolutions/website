import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { csvToLeads } from '@/lib/sales/csv'
import { ingestLeads } from '@/lib/sales/ingest'
import { syncAudience } from '@/lib/sales/audience'
import { logSalesEvent } from '@/lib/sales/events'

// CSV of leads pasted or uploaded on the Leads page: the same rules as the intake API.
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const b = (await req.json().catch(() => ({}))) as { csv?: string; source?: string }
  const csv = String(b.csv ?? '')
  if (!csv.trim() || csv.length > 2_000_000) return json({ error: 'Paste or upload a CSV under 2 MB' }, 422)
  const source = String(b.source ?? 'csv').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'csv'
  const parsed = csvToLeads(csv)
  if (parsed.error) return json({ error: parsed.error }, 422)
  if (!parsed.leads.length) return json({ error: 'No rows found under the header' }, 422)
  try {
    const all = { accountsCreated: 0, accountsMatched: 0, contactsCreated: 0, contactsUpdated: 0, contactsMerged: 0, draftsCreated: 0, skipped: [] as { company: string | null; contact?: string | null; reason: string }[] }
    for (let i = 0; i < parsed.leads.length; i += 50) {
      const r = await ingestLeads(parsed.leads.slice(i, i + 50), source)
      all.accountsCreated += r.accountsCreated; all.accountsMatched += r.accountsMatched; all.contactsCreated += r.contactsCreated
      all.contactsUpdated += r.contactsUpdated; all.contactsMerged += r.contactsMerged; all.draftsCreated += r.draftsCreated; all.skipped.push(...r.skipped)
    }
    await logSalesEvent({ kind: 'intake', actor: who.email, detail: { source, rows: parsed.rows, ...all, skipped: all.skipped.length } })
    await syncAudience()
    return json({ rows: parsed.rows, ...all })
  } catch (e) {
    console.error('leads import failed', e instanceof Error ? e.message : e)
    return json({ error: 'Import failed. Nothing partial is lost: send the same CSV again; existing rows are matched, not duplicated.' }, 500)
  }
}
