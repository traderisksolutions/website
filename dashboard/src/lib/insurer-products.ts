/**
 * Insurer products: what each insurer offers per product line, what it will and will not take,
 * and who to ask. The Insurers page edits these; the placement router reads them. Server-side
 * only (service key through @/lib/crm/db).
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { displayName, listInsurerCompanies } from '@/lib/insurers'
import { computeStats, rankProducts, type InsurerProduct, type ProductContact, type ProductStats, type Suggestion } from '@/lib/placement/rank'

const YEAR_MS = 365 * 86_400_000

type ProductRow = Omit<InsurerProduct, 'insurer_name' | 'contacts'> & {
  companies: { company_name: string } | null
  insurer_product_contacts: { contact_id: string; is_default: boolean; role_title: string | null; contacts: { email: string | null; first_name: string | null; last_name: string | null } | null }[]
}
const SELECT = 'id,insurer_company_id,product_line,name,accepts,declines,min_premium,max_lives,notes,status,companies(company_name),insurer_product_contacts(contact_id,is_default,role_title,contacts(email,first_name,last_name))'

function toProduct(r: ProductRow): InsurerProduct {
  const contacts: ProductContact[] = r.insurer_product_contacts.flatMap(c => c.contacts?.email ? [{
    contact_id: c.contact_id, email: c.contacts.email.toLowerCase(), is_default: c.is_default, role_title: c.role_title,
    name: [c.contacts.first_name, c.contacts.last_name].filter(Boolean).join(' ').trim() || null,
  }] : [])
  const { companies, insurer_product_contacts: _, ...rest } = r
  return { ...rest, min_premium: rest.min_premium == null ? null : Number(rest.min_premium), insurer_name: displayName(companies?.company_name ?? 'Unknown insurer'), contacts }
}

/** Every product, or those for the given lines; active and paused alike unless asked. */
export async function listProducts(opts: { productLines?: string[]; activeOnly?: boolean; insurerCompanyId?: string } = {}): Promise<InsurerProduct[]> {
  const f: string[] = []
  if (opts.productLines?.length) f.push(`product_line=in.(${opts.productLines.map(enc).join(',')})`)
  if (opts.activeOnly) f.push('status=eq.active')
  if (opts.insurerCompanyId) f.push(`insurer_company_id=eq.${opts.insurerCompanyId}`)
  const rows = await sbTry<ProductRow[]>(`insurer_products?select=${SELECT}${f.length ? '&' + f.join('&') : ''}&order=product_line.asc,name.asc`, [])
  return rows.map(toProduct)
}

export async function getProduct(id: string): Promise<InsurerProduct | null> {
  const rows = await sbTry<ProductRow[]>(`insurer_products?id=eq.${id}&select=${SELECT}&limit=1`, [])
  return rows[0] ? toProduct(rows[0]) : null
}

/** Last twelve months of requests and quotes, rolled up per product. */
export async function productStats(products: InsurerProduct[], now = new Date()): Promise<Map<string, ProductStats>> {
  if (products.length === 0) return new Map()
  const since = new Date(now.getTime() - YEAR_MS).toISOString()
  type D = { id: string; insurer_product_id: string | null; insurer_company_id: string | null; status: string; sent_at: string | null; placement_lines: { product_line: string } | null; placements: { companies: { industry: string | null } | null } | null }
  const [ds, qs] = await Promise.all([
    sbTry<D[]>(`placement_dispatches?created_at=gte.${enc(since)}&select=id,insurer_product_id,insurer_company_id,status,sent_at,placement_lines(product_line),placements(companies(industry))&limit=5000`, []),
    sbTry<{ dispatch_id: string | null; status: string; created_at: string }[]>(`placement_quotes?created_at=gte.${enc(since)}&dispatch_id=not.is.null&select=dispatch_id,status,created_at&limit=10000`, []),
  ])
  return computeStats(products, ds.map(d => ({
    id: d.id, insurer_product_id: d.insurer_product_id, insurer_company_id: d.insurer_company_id, status: d.status, sent_at: d.sent_at,
    product_line: d.placement_lines?.product_line ?? null, client_industry: d.placements?.companies?.industry ?? null,
  })), qs)
}

// ── Writes ──────────────────────────────────────────────────────────────────────────────────

export type ProductInput = {
  name?: string; product_line?: string; accepts?: string[]; declines?: string[]
  min_premium?: number | null; max_lives?: number | null; notes?: string | null; status?: 'active' | 'paused'
}
const list = (xs: string[] | undefined) => xs ? [...new Set(xs.map(x => x.trim()).filter(Boolean))].slice(0, 40) : undefined

export async function createProduct(insurerCompanyId: string, input: ProductInput & { name: string; product_line: string }, actor: string): Promise<InsurerProduct> {
  const insurers = await listInsurerCompanies()
  if (!insurers.some(i => i.id === insurerCompanyId)) throw new Error('Insurer not found')
  const [row] = await sb<{ id: string }[]>('insurer_products', { method: 'POST', body: JSON.stringify({
    insurer_company_id: insurerCompanyId, product_line: input.product_line, name: input.name.trim(),
    accepts: list(input.accepts) ?? [], declines: list(input.declines) ?? [], min_premium: input.min_premium ?? null,
    max_lives: input.max_lives ?? null, notes: input.notes?.trim() || null, created_by: actor,
  }) }).catch(e => { if (/duplicate|unique/i.test(String(e))) throw new Error('That insurer already has a product with this name on this line'); throw e })
  return (await getProduct(row.id))!
}

export async function updateProduct(id: string, input: ProductInput): Promise<InsurerProduct> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.product_line !== undefined) patch.product_line = input.product_line
  if (input.accepts !== undefined) patch.accepts = list(input.accepts)
  if (input.declines !== undefined) patch.declines = list(input.declines)
  if (input.min_premium !== undefined) patch.min_premium = input.min_premium
  if (input.max_lives !== undefined) patch.max_lives = input.max_lives
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  if (input.status !== undefined) patch.status = input.status
  const rows = await sb<{ id: string }[]>(`insurer_products?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  if (!rows[0]) throw new Error('Product not found')
  return (await getProduct(id))!
}

/** The contact row for an email, created if new. */
async function contactFor(email: string, name: string | null): Promise<string> {
  const e = email.trim().toLowerCase()
  const found = await sbTry<{ id: string }[]>(`contacts?email=ilike.${enc(e)}&select=id&limit=1`, [])
  if (found[0]) return found[0].id
  const [first, ...rest] = (name ?? '').trim().split(/\s+/).filter(Boolean)
  const [made] = await sb<{ id: string }[]>('contacts', { method: 'POST', body: JSON.stringify({ email: e, first_name: first || null, last_name: rest.join(' ') || null, source: 'insurer_directory' }) })
  return made.id
}

/** Adds a person to a product. The first person, or one marked default, becomes the default. */
export async function addProductContact(productId: string, input: { email: string; name?: string | null; role_title?: string | null; is_default?: boolean }): Promise<InsurerProduct> {
  const p = await getProduct(productId)
  if (!p) throw new Error('Product not found')
  const contactId = await contactFor(input.email, input.name ?? null)
  const makeDefault = input.is_default === true || p.contacts.length === 0
  if (makeDefault) await sb(`insurer_product_contacts?product_id=eq.${productId}`, { method: 'PATCH', body: JSON.stringify({ is_default: false }) })
  await sb('insurer_product_contacts?on_conflict=product_id,contact_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ product_id: productId, contact_id: contactId, is_default: makeDefault, role_title: input.role_title?.trim() || null }),
  })
  return (await getProduct(productId))!
}

export async function setDefaultContact(productId: string, contactId: string): Promise<InsurerProduct> {
  await sb(`insurer_product_contacts?product_id=eq.${productId}`, { method: 'PATCH', body: JSON.stringify({ is_default: false }) })
  const rows = await sb<unknown[]>(`insurer_product_contacts?product_id=eq.${productId}&contact_id=eq.${contactId}`, { method: 'PATCH', body: JSON.stringify({ is_default: true }) })
  if (rows.length === 0) throw new Error('That person is not on this product')
  return (await getProduct(productId))!
}

/** Takes a person off a product. If they were the default, the next person becomes it. */
export async function removeProductContact(productId: string, contactId: string): Promise<InsurerProduct> {
  await sb(`insurer_product_contacts?product_id=eq.${productId}&contact_id=eq.${contactId}`, { method: 'DELETE' })
  const p = await getProduct(productId)
  if (!p) throw new Error('Product not found')
  if (p.contacts.length && !p.contacts.some(c => c.is_default)) return setDefaultContact(productId, p.contacts[0].contact_id)
  return p
}

/** A new insurer is a company of kind 'insurer'. Returns the existing one when the name already exists. */
export async function createInsurer(name: string, domain: string | null): Promise<{ id: string; name: string }> {
  const existing = (await listInsurerCompanies()).find(i => i.name.toLowerCase() === name.trim().toLowerCase())
  if (existing) return { id: existing.id, name: existing.name }
  const d = domain?.trim().toLowerCase().replace(/^https?:\/\/|^www\.|\/.*$/g, '') || null
  const [row] = await sb<{ id: string; company_name: string }[]>('companies', { method: 'POST', body: JSON.stringify({
    // owner_emails is NOT NULL on companies; an insurer has no TRS owner.
    company_name: name.trim(), kind: 'insurer', domain: d, domains: d ? [d] : [], owner_emails: [],
  }) })
  return { id: row.id, name: displayName(row.company_name) }
}

// ── Suggestions ─────────────────────────────────────────────────────────────────────────────

/**
 * The ranked insurers for each line, for this client: up to five ticked, with reasons. A line
 * with no products on the Insurers page is absent; the caller falls back to the old contact list.
 */
export async function suggestInsurers(productLines: string[], companyId: string | null): Promise<Record<string, Suggestion[]>> {
  const products = await listProducts({ productLines, activeOnly: true })
  if (products.length === 0) return {}
  const [stats, company] = await Promise.all([
    productStats(products),
    companyId ? sbTry<{ industry: string | null }[]>(`companies?id=eq.${companyId}&select=industry&limit=1`, []).then(r => r[0] ?? null) : Promise.resolve(null),
  ])
  const out: Record<string, Suggestion[]> = {}
  for (const line of productLines) {
    const forLine = products.filter(p => p.product_line === line)
    if (forLine.length) out[line] = rankProducts(forLine, stats, { industry: company?.industry ?? null })
  }
  return out
}
