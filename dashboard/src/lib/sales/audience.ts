// The audience: every email address TRS may write to, merged into sales_audience by
// sync_sales_audience(). Campaign enrolment reads from it.
import 'server-only'
import { enc, sb, sbAll, sbPage, sbRpc } from './db'

export const RELATIONSHIPS = ['client', 'enquiry', 'prospect', 'other'] as const
export type Relationship = (typeof RELATIONSHIPS)[number]

/** Who a campaign is for. Empty arrays mean any.
 *  verifiedOnly: only "verified" emails. Otherwise verified or published on the company's own
 *  pages; guessed, invalid and bounced never qualify. namedOnly: people, not shared inboxes. */
export type AudienceFilter = { relationships?: string[]; locations?: string[]; verifiedOnly?: boolean; namedOnly?: boolean; sources?: string[] }

/** Shared inboxes by their local part. Postgres regex, case-insensitive. */
export const GENERIC_INBOX_PATTERN = '^(info|enquir|inquir|sales|contact|admin|hello|general|service|support|hr|marketing|office|team|cs|customer|client|mail|ask|help|reception|account|finance|career|jobs|connect)'

export type AudienceRow = {
  id: string; email: string; name: string | null; first_name: string | null; company: string | null; title: string | null
  linkedin_url: string | null; location: string | null; relationship: string; sources: string[]; email_status: string | null
  suppressed: boolean; sales_contact_id: string | null; sales_account_id: string | null
}

export const AUDIENCE_COLUMNS = 'id,email,name,first_name,company,title,linkedin_url,location,relationship,sources,email_status,suppressed,sales_contact_id,sales_account_id'

/** PostgREST clauses for an audience filter, for enrolment (suppressed excluded). */
export function audienceClauses(f: AudienceFilter): string[] {
  const c = ['suppressed=is.false']
  if (f.relationships?.length) c.push(`relationship=in.(${f.relationships.join(',')})`)
  if (f.locations?.length) c.push(`location=in.(${f.locations.join(',')})`)
  if (f.verifiedOnly) c.push('email_status=eq.verified')
  else c.push('email_status=not.in.(suggested,invalid,bounced,suppressed)')
  if (f.namedOnly) c.push(`email=not.imatch.${enc(`${GENERIC_INBOX_PATTERN}[^@]*@`)}`)
  if (f.sources?.length) c.push(`sources=ov.{${f.sources.map(s => `"${s}"`).join(',')}}`)
  return c
}

export async function matchingAudience(f: AudienceFilter): Promise<AudienceRow[]> {
  return sbAll<AudienceRow>(`sales_audience?select=${AUDIENCE_COLUMNS}&${audienceClauses(f).join('&')}&order=email`)
}

export async function listAudience(f: AudienceFilter & { q?: string; page: number; pageSize: number }): Promise<{ rows: AudienceRow[]; total: number }> {
  const c: string[] = []
  if (f.relationships?.length) c.push(`relationship=in.(${f.relationships.join(',')})`)
  if (f.locations?.length) c.push(`location=in.(${f.locations.join(',')})`)
  if (f.verifiedOnly) c.push('email_status=eq.verified')
  if (f.q) {
    const like = `*${f.q.replace(/[%,()*\\:"]/g, ' ').trim().slice(0, 80)}*`
    c.push(`or=(email.ilike.${enc(like)},name.ilike.${enc(like)},company.ilike.${enc(like)})`)
  }
  const offset = (f.page - 1) * f.pageSize
  return sbPage<AudienceRow>(`sales_audience?select=${AUDIENCE_COLUMNS}&${c.join('&')}${c.length ? '&' : ''}order=relationship.asc,company.asc.nullslast,email.asc&limit=${f.pageSize}&offset=${offset}`)
}

export type AudienceSummary = { total: number; verified: number; suppressed: number; byRelationship: Record<string, number>; byLocation: Record<string, number> }

export async function audienceSummary(): Promise<AudienceSummary> {
  const out: AudienceSummary = { total: 0, verified: 0, suppressed: 0, byRelationship: {}, byLocation: {} }
  const rows = await sbAll<{ relationship: string; location: string | null; email_status: string | null; suppressed: boolean }>('sales_audience?select=relationship,location,email_status,suppressed&order=id')
  for (const r of rows) {
    out.total += 1
    if (r.email_status === 'verified') out.verified += 1
    if (r.suppressed) out.suppressed += 1
    out.byRelationship[r.relationship] = (out.byRelationship[r.relationship] ?? 0) + 1
    const l = r.location ?? '—'
    out.byLocation[l] = (out.byLocation[l] ?? 0) + 1
  }
  return out
}

/** Rebuild sales_audience from every source. Best effort: a failure here must not block the action that called it. */
export async function syncAudience(): Promise<number | null> {
  try { return await sbRpc<number>('sync_sales_audience') } catch (e) { console.error('sync_sales_audience failed', e instanceof Error ? e.message : e); return null }
}

/** CSV import into the audience. Existing addresses keep their stronger relationship and gain
 *  the import as a source. */
export async function importAudience(rows: { email: string; name?: string; company?: string; title?: string; location?: string }[], label: string, relationship: Relationship): Promise<{ added: number; updated: number; invalid: number }> {
  const source = `import:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'csv'}`
  const valid = rows.map(r => ({ ...r, email: r.email.trim().toLowerCase() })).filter(r => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email))
  const invalid = rows.length - valid.length
  const unique = Array.from(new Map(valid.map(r => [r.email, r])).values())
  const rank = (r: string) => RELATIONSHIPS.indexOf(r as Relationship)
  let added = 0, updated = 0
  for (let i = 0; i < unique.length; i += 200) {
    const batch = unique.slice(i, i + 200)
    const existing = await sb<{ email: string; relationship: string; sources: string[] }[]>(`sales_audience?select=email,relationship,sources&email=in.(${batch.map(b => `"${enc(b.email)}"`).join(',')})`)
    const known = new Map(existing.map(e => [e.email, e]))
    const now = new Date().toISOString()
    for (const r of batch) {
      const e = known.get(r.email)
      const name = r.name?.trim() || null
      if (e) {
        const rel = rank(e.relationship) < rank(relationship) ? e.relationship : relationship
        await sb(`sales_audience?email=eq.${enc(r.email)}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ relationship: rel, sources: Array.from(new Set([...e.sources, source])).sort(), updated_at: now }) })
        updated += 1
      } else {
        await sb('sales_audience', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({
          email: r.email, name, first_name: name ? name.split(/\s+/)[0] : null, company: r.company?.trim() || null, title: r.title?.trim() || null,
          location: r.location?.trim().toUpperCase().slice(0, 2) || null, relationship, sources: [source], email_status: 'unknown', updated_at: now,
        }) })
        added += 1
      }
    }
  }
  return { added, updated, invalid }
}
