/**
 * Insurers — one list, and it is Companies.
 *
 * Every distinct insurer is a company with kind = 'insurer' (31 on 2 Oct 2026), shown under
 * Companies → Insurers. That is the list a broker sees, edits and picks from everywhere: the
 * group benefits rate tables, the pricing-matrix calculators, anything that needs to say "which
 * insurer". The Settings → Insurers page that kept a second, shorter list of 23 was removed.
 *
 * Why the old `insurers` table still exists, hidden. gb_rate_tables, pm_calculators and
 * pm_taxonomy_synonyms each hold a foreign key to insurers.id, and insurer_contacts (which the
 * mail-filing agent reads) hangs off it too. Repointing those keys at companies is DDL. Until that
 * migration runs (supabase/migrations/20261002_insurers_to_companies.sql), the table is a key
 * table derived from Companies: picking a company resolves to its key row, created on first use.
 * Nobody edits it and nothing displays it. All 23 existing rows already match a company by name,
 * so no key is orphaned.
 */
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

function h(prefer?: string) {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }
}

/** Upper/lower case, punctuation and the usual corporate suffixes do not distinguish insurers. */
export const normInsurer = (s: string | null | undefined): string =>
  String(s ?? '').toLowerCase()
    .replace(/\b(insurance|assurance|singapore|pte|ltd|limited|company|co|general|group|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')

export type InsurerCompany = { id: string; name: string; domain: string | null }

export async function listInsurerCompanies(): Promise<InsurerCompany[]> {
  const res = await fetch(`${SB_URL}/rest/v1/companies?kind=eq.insurer&select=id,company_name,domain&order=company_name`,
    { headers: h(), cache: 'no-store' })
  if (!res.ok) return []
  const rows = await res.json() as { id: string; company_name: string; domain: string | null }[]
  return rows.map(r => ({ id: r.id, name: displayName(r.company_name), domain: r.domain }))
}

/** Companies stores many insurer names in capitals ("GREAT EASTERN"). Short acronyms stay as
 *  they are; longer names are shown in title case so a picker does not shout. */
export function displayName(raw: string): string {
  const s = raw.trim()
  if (s !== s.toUpperCase()) return s
  // A bracketed token is an acronym by convention ("CHINA TAPING (CTPIS)"), so it stays as written.
  let inBracket = false
  return s.split(/(\s+|\(|\))/).map(w => {
    if (w === '(') { inBracket = true; return w }
    if (w === ')') { inBracket = false; return w }
    return (inBracket || w.length <= 4 || /^\W*$/.test(w)) ? w : w[0] + w.slice(1).toLowerCase()
  }).join('')
}

/** The insurer company a free-text name refers to. Exact normalised match first, then a name
 *  that starts with the other, so "Income" finds "INCOME" and "QBE Insurance (Singapore) Pte Ltd"
 *  finds "QBE". Null rather than a guess when nothing fits. */
export function matchInsurer(name: string | null | undefined, insurers: InsurerCompany[]): InsurerCompany | null {
  const n = normInsurer(name)
  if (!n) return null
  const exact = insurers.find(i => normInsurer(i.name) === n)
  if (exact) return exact
  const prefix = insurers
    // Both sides at least three characters: a one-letter fragment like "E" otherwise prefixes
    // ECICS and EQ and lands an upload on whichever sorts first.
    .filter(i => { const m = normInsurer(i.name); return m.length >= 3 && n.length >= 3 && (n.startsWith(m) || m.startsWith(n)) })
    .sort((a, b) => normInsurer(b.name).length - normInsurer(a.name).length)
  return prefix[0] ?? null
}

/**
 * The key a foreign-key column needs, for an insurer company — creating the key row on first
 * use. Accepts a company id (from a picker) or a name (from an extracted brochure).
 */
export async function resolveInsurerKey(by: { companyId?: string | null; name?: string | null }):
  Promise<{ key: string; company: InsurerCompany } | null> {
  const insurers = await listInsurerCompanies()
  const company = by.companyId ? insurers.find(i => i.id === by.companyId) ?? null : matchInsurer(by.name, insurers)
  if (!company) return null

  const keysRes = await fetch(`${SB_URL}/rest/v1/insurers?select=id,name`, { headers: h(), cache: 'no-store' })
  const keys = keysRes.ok ? await keysRes.json() as { id: string; name: string }[] : []
  const existing = keys.find(k => normInsurer(k.name) === normInsurer(company.name))
  if (existing) return { key: existing.id, company }

  const ins = await fetch(`${SB_URL}/rest/v1/insurers?on_conflict=name`, {
    method: 'POST', headers: h('resolution=merge-duplicates,return=representation'),
    body: JSON.stringify({ name: company.name, status: 'active' }),
  })
  const created = ins.ok ? (await ins.json() as { id: string }[])[0] : null
  return created ? { key: created.id, company } : null
}
