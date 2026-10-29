/**
 * One request per company: marks older employee-benefits drafts of the same company as superseded
 * by the one to keep (the newest with an employee list, else the newest). Nothing is deleted;
 * superseded rows leave the Quotes list. Dry run unless --write.
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/gb-supersede-duplicates.mts [--write]
 */
import { normCompany } from '../src/lib/gb/intake'
const U = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1', K = process.env.SUPABASE_SERVICE_KEY!
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
type Row = { id: string; company_name: string | null; member_count: number; created_at: string; source: string | null }
const rows = await (await fetch(`${U}/gb_quotations?superseded_by=is.null&select=id,company_name,member_count,created_at,source&order=created_at.desc`, { headers: H })).json() as Row[]
const groups = new Map<string, Row[]>()
for (const r of rows) { const k = normCompany(r.company_name); if (k.length < 3) continue; groups.set(k, [...(groups.get(k) ?? []), r]) }
for (const list of groups.values()) {
  if (list.length < 2) continue
  const keep = list.find(r => r.member_count > 0) ?? list[0]
  const older = list.filter(r => r.id !== keep.id)
  console.log(`${keep.company_name}: keep ${keep.id.slice(0, 8)} (${keep.member_count} lives, ${keep.created_at.slice(0, 10)}), supersede ${older.length}`)
  if (process.argv.includes('--write')) for (const r of older) {
    const res = await fetch(`${U}/gb_quotations?id=eq.${r.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ superseded_by: keep.id }) })
    if (!res.ok) console.log('  failed', r.id, res.status)
  }
}
