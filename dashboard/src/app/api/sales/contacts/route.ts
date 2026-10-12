import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { audienceSummary, importAudience, listAudience, syncAudience, RELATIONSHIPS, type Relationship } from '@/lib/sales/audience'
import { parseCsv } from '@/lib/sales/csv'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET /api/sales/contacts?rel=prospect&loc=SG&verified=1&q=&page=1 → one page of the audience
 *  and the summary counts. ?sync=1 rebuilds the audience first. */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const p = req.nextUrl.searchParams
  if (p.get('sync') === '1') await syncAudience()
  const rel = p.get('rel') ?? ''
  const loc = (p.get('loc') ?? '').toUpperCase()
  const filters = {
    relationship: (RELATIONSHIPS as readonly string[]).includes(rel) ? rel : 'all',
    location: /^[A-Z]{2}$/.test(loc) ? loc : 'all',
    verifiedOnly: p.get('verified') === '1',
    q: (p.get('q') ?? '').slice(0, 80),
    page: Math.max(1, Math.floor(Number(p.get('page'))) || 1),
  }
  try {
    const [list, summary] = await Promise.all([
      listAudience({ relationships: filters.relationship === 'all' ? [] : [filters.relationship], locations: filters.location === 'all' ? [] : [filters.location], verifiedOnly: filters.verifiedOnly, q: filters.q, page: filters.page, pageSize: 50 }),
      audienceSummary(),
    ])
    return json({ filters, rows: list.rows, total: list.total, summary })
  } catch (e) {
    console.error('sales contacts failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not load contacts' }, 500)
  }
}

// CSV into the audience. Header row required; recognised columns: email (required), name,
// first name + last name, company, title, country/location.
const COL: Record<string, string[]> = {
  email: ['email', 'email address', 'e-mail', 'work email'], name: ['name', 'full name', 'contact'],
  first: ['first name', 'firstname', 'given name'], last: ['last name', 'lastname', 'surname', 'family name'],
  company: ['company', 'organisation', 'organization', 'account'], title: ['title', 'job title', 'role', 'position'],
  location: ['country', 'location', 'market'],
}
const COUNTRY: Record<string, string> = { singapore: 'SG', indonesia: 'ID', 'hong kong': 'HK', malaysia: 'MY' }

export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const b = (await req.json().catch(() => ({}))) as { csv?: string; label?: string; relationship?: string }
  const csv = String(b.csv ?? '')
  if (!csv.trim() || csv.length > 5_000_000) return json({ error: 'Paste or upload a CSV under 5 MB' }, 422)
  const relationship = (RELATIONSHIPS as readonly string[]).includes(b.relationship ?? '') ? (b.relationship as Relationship) : 'other'
  const rows = parseCsv(csv).filter(r => r.some(c => c.trim()))
  const header = (rows.shift() ?? []).map(h => h.trim().toLowerCase())
  const idx = Object.fromEntries(Object.keys(COL).map(k => [k, header.findIndex(h => COL[k].includes(h))])) as Record<string, number>
  if (idx.email < 0) return json({ error: 'No email column found in the header row' }, 422)
  const cell = (r: string[], k: string) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '')
  const parsed = rows.map(r => {
    const loc = cell(r, 'location')
    return { email: cell(r, 'email'), name: cell(r, 'name') || [cell(r, 'first'), cell(r, 'last')].filter(Boolean).join(' '), company: cell(r, 'company'), title: cell(r, 'title'), location: COUNTRY[loc.toLowerCase()] ?? (/^[A-Za-z]{2}$/.test(loc) ? loc.toUpperCase() : '') }
  })
  try {
    const r = await importAudience(parsed, String(b.label ?? 'csv'), relationship)
    console.info('audience import', JSON.stringify({ by: who.email, rows: parsed.length, ...r }))
    return json({ rows: parsed.length, ...r })
  } catch (e) {
    console.error('audience import failed', e instanceof Error ? e.message : e)
    return json({ error: 'Import failed' }, 500)
  }
}
