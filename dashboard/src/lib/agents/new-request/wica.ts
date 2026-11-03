/**
 * WICA sub-agent for a new request. Pure; tested in src/lib/agents/__tests__/new-request.test.ts.
 *
 * The checks Nathan makes before a WICA request goes to market (threads Jun–Nov 2026):
 *   - each category of work has a headcount and annual wages; wages sent as a monthly figure or
 *     as one total for many people are caught by the wage per head
 *   - the job scope of each category is known (insurers rate by the work done, not by the title)
 *   - claims history includes injuries reported to MOM (insurers check MOM's records; an
 *     undeclared claim re-prices the quote)
 *   - non-manual staff earning over S$2,600 a month are outside compulsory WICA: the client decides
 *   - work permit or S Pass holders also need foreign worker medical insurance, and non-Malaysian
 *     work permit holders a security bond (MOM)
 */
import type { LineReviewer } from './types'
import { parseMoney } from '@/lib/placement/spec'

export type Category = { name: string; heads: number | null; wages: number | null }

const MONEY = /(?:s\$|sgd|\$)\s*[\d,]+(?:\.\d+)?\s*(?:k|m|million)?\b|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d{5,}(?:\.\d+)?\b|\b\d+(?:\.\d+)?\s*(?:k|m|million)\b/i

/** "Office: 16, S$1,321,520; Site: 18, S$539,322" → categories. Lines or semicolons separate them. */
export function parseCategories(text: string | null | undefined): Category[] {
  return String(text ?? '').split(/;|\n/).map(s => s.trim()).filter(Boolean).map(part => {
    const cut = part.search(/:|\s[-–]\s/)
    const name = (cut > 0 ? part.slice(0, cut) : part.replace(/[\d$,.]+.*$/, '')).trim()
    const body = cut > 0 ? part.slice(cut + 1) : part.slice(name.length)
    const mm = body.match(MONEY)
    const wages = mm ? parseMoney(mm[0])?.amount ?? null : null
    const h = (mm ? body.replace(mm[0], ' ') : body).match(/\b(\d{1,4})\b/)
    return { name, heads: h ? Number(h[1]) || null : null, wages }
  }).filter(c => c.name && (c.heads != null || c.wages != null))
}

const GENERIC = /^(staff|workers?|employees?|all|total|others?|general|headcount|manpower)$/i
const NON_MANUAL = /\b(office|admin\w*|management|manager|director|sales|clerical|account\w*|finance|hr|executive|professional|it|engineer(?:s|ing)? \(office\))\b/i
const FOREIGN = /\b(work permit|wp holders?|foreign workers?|s ?pass|migrant workers?)\b/i
const MALAYSIAN_ONLY = /\b(all|only) malaysians?\b/i
export const NON_MANUAL_THRESHOLD = 2600

export const reviewWica: LineReviewer = (line, ctx) => {
  const x = line.spec.fields ?? {}
  const asks: string[] = [], notes: string[] = []
  let hold = false
  const cats = parseCategories(x.categories)
  for (const c of cats) {
    if (c.heads == null || c.wages == null) { asks.push(`For "${c.name}": the number of employees and their total estimated annual wages`); hold = true; continue }
    const monthly = c.wages / c.heads / 12
    if (monthly < 800) { asks.push(`For "${c.name}": please confirm S$${c.wages.toLocaleString('en-SG')} is the total annual wages of all ${c.heads}, not a monthly or per-person figure`); hold = true; notes.push(`${c.name}: S$${Math.round(monthly)} a month per head, below any full-time wage; likely monthly or per-person`) }
    if (NON_MANUAL.test(c.name) && monthly > NON_MANUAL_THRESHOLD) notes.push(`${c.name}: about S$${Math.round(monthly).toLocaleString('en-SG')} a month per head. Non-manual staff above S$${NON_MANUAL_THRESHOLD.toLocaleString('en-SG')} are outside compulsory WICA; confirm with the client whether to include them`)
  }
  if (cats.length && cats.every(c => GENERIC.test(c.name))) { asks.push('The job scope of each group of employees: what they do day to day, and whether the work is manual, at a site or in an office'); hold = true }
  if (!String(x.claims_history ?? '').trim()) asks.push('Work injury claims in the last 3 years, including any reported to MOM, or "nil"')
  const requested = new Set(ctx.lines.map(l => l.product_line))
  const companions = []
  if (FOREIGN.test(ctx.text) && !requested.has('foreign_worker_medical')) companions.push({ product_line: 'foreign_worker_medical', ask: 'Work permit and S Pass holders also need foreign worker medical insurance under MOM rules. Would you like us to quote it with the WICA?', why: 'foreign workers mentioned, no FWMI asked' })
  if (FOREIGN.test(ctx.text) && !MALAYSIAN_ONLY.test(ctx.text) && !requested.has('foreign_worker_bond')) companions.push({ product_line: 'foreign_worker_bond', ask: 'Non-Malaysian work permit holders need a S$5,000 security bond each. Would you like us to arrange the bonds?', why: 'foreign workers mentioned, no bond asked' })
  return { asks, hold, notes, companions }
}
