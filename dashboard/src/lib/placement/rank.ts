/**
 * Which insurers to ask for a line, best first, each with the reasons a broker reads before
 * agreeing. The top five with a contact are ticked; the broker can untick any or add more.
 * Pure: no I/O, so the ranking is testable and every suggestion can be explained.
 */

export const SUGGEST_LIMIT = 5

export type ProductContact = { contact_id: string; email: string; name: string | null; is_default: boolean; role_title: string | null }

export type InsurerProduct = {
  id: string
  insurer_company_id: string
  insurer_name: string
  product_line: string
  name: string
  accepts: string[]
  declines: string[]
  min_premium: number | null
  max_lives: number | null
  notes: string | null
  status: 'active' | 'paused'
  contacts: ProductContact[]
}

/** Last twelve months of requests for a product. */
export type ProductStats = {
  asked: number
  quoted: number
  declined: number
  won: number
  avg_days: number | null
  last_asked: string | null
  /** Industries of clients the product declined, with the month it happened ("2026-08"). */
  declined_industries: { industry: string; month: string }[]
}
export const NO_STATS: ProductStats = { asked: 0, quoted: 0, declined: 0, won: 0, avg_days: null, last_asked: null, declined_industries: [] }

export type Suggestion = {
  product: InsurerProduct
  /** The person a request goes to: the default contact, else the first. Null = none on file. */
  contact: ProductContact | null
  score: number
  picked: boolean
  /** True when the product says it will not take this client; listed last, never ticked. */
  excluded: boolean
  reasons: string[]
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()

/** "F&B" matches "f and b restaurants"; "Construction" matches "construction and civil works". */
export function industryMatches(rule: string, industry: string | null | undefined): boolean {
  const a = norm(rule), b = norm(industry)
  if (!a || !b) return false
  return a === b || b.includes(a) || a.includes(b)
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthName = (ym: string) => MONTH[Number(ym.slice(5, 7)) - 1] ?? ym

export function defaultContact(p: InsurerProduct): ProductContact | null {
  return p.contacts.find(c => c.is_default) ?? [...p.contacts].sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))[0] ?? null
}

export function rankProducts(
  products: InsurerProduct[],
  stats: Map<string, ProductStats>,
  client: { industry: string | null; lives?: number | null; budget?: number | null },
  limit = SUGGEST_LIMIT,
): Suggestion[] {
  const out: Suggestion[] = products.filter(p => p.status === 'active').map(p => {
    const s = stats.get(p.id) ?? NO_STATS
    const reasons: string[] = []
    let score = 0
    let excluded = false
    const ind = client.industry

    const refuses = ind ? p.declines.find(d => industryMatches(d, ind)) : undefined
    if (refuses) { excluded = true; reasons.push(`Won't take ${refuses}`) }
    if (ind && p.accepts.length) {
      const takes = p.accepts.find(a => industryMatches(a, ind))
      if (takes) { score += 3; reasons.push(`Takes ${takes}`) }
      else { score -= 1; reasons.push(`${ind} not on its list`) }
    }
    if (client.lives != null && p.max_lives != null && client.lives > p.max_lives) { excluded = true; reasons.push(`Up to ${p.max_lives} lives; this is ${client.lives}`) }
    if (client.budget != null && p.min_premium != null && client.budget < p.min_premium) { score -= 2; reasons.push(`Minimum premium ${p.min_premium.toLocaleString('en-SG')}`) }

    const pastDecline = ind ? s.declined_industries.find(d => industryMatches(d.industry, ind)) : undefined
    if (pastDecline) { score -= 2; reasons.push(`Declined ${pastDecline.industry} in ${monthName(pastDecline.month)}`) }
    if (s.asked >= 2) {
      score += 2 * (s.quoted / s.asked)
      reasons.push(`Quoted ${s.quoted} of last ${s.asked}`)
    } else if (s.asked === 0) {
      reasons.push('Not asked in the last 12 months')
    }
    if (s.won > 0) { score += Math.min(2, s.won * 0.5); reasons.push(`Won ${s.won}`) }
    if (s.avg_days != null && s.avg_days <= 2) { score += 0.5; reasons.push(`Replies in ${s.avg_days.toFixed(1)} days`) }

    const contact = defaultContact(p)
    if (!contact) reasons.push('No contact on file')
    return { product: p, contact, score, picked: false, excluded, reasons }
  })

  out.sort((a, b) => Number(a.excluded) - Number(b.excluded) || b.score - a.score || a.product.insurer_name.localeCompare(b.product.insurer_name) || a.product.name.localeCompare(b.product.name))
  // One product per insurer is ticked: asking the same insurer twice for one line looks careless.
  const insurers = new Set<string>()
  let n = 0
  for (const s of out) {
    if (n >= limit) break
    if (s.excluded || !s.contact || insurers.has(s.product.insurer_company_id)) continue
    s.picked = true
    insurers.add(s.product.insurer_company_id)
    n++
  }
  return out
}

/** Stats per product from the raw request rows. A request counts for its product, or for the insurer's product on that line when it predates products. */
export function computeStats(
  products: Pick<InsurerProduct, 'id' | 'insurer_company_id' | 'product_line'>[],
  dispatches: { id: string; insurer_product_id: string | null; insurer_company_id: string | null; product_line: string | null; status: string; sent_at: string | null; client_industry: string | null }[],
  quotes: { dispatch_id: string | null; status: string; created_at: string }[],
): Map<string, ProductStats> {
  const byKey = new Map(products.map(p => [`${p.insurer_company_id}|${p.product_line}`, p.id]))
  const firstQuote = new Map<string, string>()
  const won = new Set<string>()
  for (const q of quotes) {
    if (!q.dispatch_id) continue
    const prev = firstQuote.get(q.dispatch_id)
    if (!prev || q.created_at < prev) firstQuote.set(q.dispatch_id, q.created_at)
    if (q.status === 'selected') won.add(q.dispatch_id)
  }
  const acc = new Map<string, ProductStats & { days: number[] }>()
  for (const d of dispatches) {
    if (d.status === 'drafted' || d.status === 'withdrawn') continue
    const pid = d.insurer_product_id ?? (d.insurer_company_id && d.product_line ? byKey.get(`${d.insurer_company_id}|${d.product_line}`) : undefined)
    if (!pid) continue
    const s = acc.get(pid) ?? { ...NO_STATS, declined_industries: [], days: [] }
    s.asked++
    const fq = firstQuote.get(d.id)
    if (fq || d.status === 'quoted') s.quoted++
    if (d.status === 'declined') {
      s.declined++
      if (d.client_industry && d.sent_at) s.declined_industries.push({ industry: d.client_industry, month: d.sent_at.slice(0, 7) })
    }
    if (won.has(d.id)) s.won++
    if (fq && d.sent_at) s.days.push((Date.parse(fq) - Date.parse(d.sent_at)) / 86_400_000)
    if (d.sent_at && (!s.last_asked || d.sent_at > s.last_asked)) s.last_asked = d.sent_at
    acc.set(pid, s)
  }
  const out = new Map<string, ProductStats>()
  for (const [pid, { days, ...s }] of acc) {
    s.declined_industries.sort((a, b) => b.month.localeCompare(a.month))
    out.set(pid, { ...s, avg_days: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null })
  }
  return out
}
