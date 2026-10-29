/**
 * Employment benefits on a placement line: the in-dashboard rate engine prices the Tier A
 * insurers from the census; the Tier C insurers (no rate table on file) get the ordinary
 * placement email with the census inline. Every engine price lands in placement_quotes with
 * source 'rate_table', beside the prices insurers reply with.
 *
 *   Tier A  Income, AIA, Raffles Health, QBE, Singlife — rate tables approved, priced here.
 *   Tier B  Cigna Care Connect 1.0 — published rates; priced here once its table is loaded.
 *   Tier C  every other employee-benefits insurer contact on file — asked by email.
 */
import { enc, sbTry } from '@/lib/crm/db'
import { normInsurer } from '@/lib/insurers'
import { draftQuotation } from '@/lib/gb/draft'
import { defaultEffectiveDate } from '@/lib/gb/intake'
import { PRODUCT_BY_CODE } from '@/lib/gb/canon'
import { isHospitalCover, isSumCover, parseHospital, parseSum, parseWard, type CoverSpec } from '@/lib/gb/plan-rules'
import { toCensus } from '@/lib/hr/types'
import { EB_PRODUCT_LINES } from '@/lib/policies/types'
import type { HrSubmission } from '@/lib/hr/types'
import type { Member } from '@/lib/gb-quote'
import * as store from './store'
import { openRounds } from './workflow'
import { normaliseSpec } from './spec'
import type { PlacementDispatch, PlacementLine, PlacementQuote, PlacementRound, Spec } from './types'

// ── Tiers ───────────────────────────────────────────────────────────────────────────────────

export const TIER_A_INSURERS = ['Income', 'AIA', 'Raffles Health', 'QBE', 'Singlife'] as const
export const TIER_B_LABEL = 'Cigna Care Connect 1.0'
export type InsurerTier = 'A' | 'B' | 'C'

/** Product lines whose policies are employment benefits (policies.is_eb). */
export const isEbProductLine = (slug: string | null | undefined): boolean => (EB_PRODUCT_LINES as readonly string[]).includes(slug ?? '')

/** "Income Insurance Limited" and "NTUC Income" are the same insurer; "AIA Singapore Pte Ltd" is AIA. */
const sameInsurer = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const x = normInsurer(a), y = normInsurer(b)
  if (!x || !y || x.length < 3 || y.length < 3) return false
  return x === y || x.includes(y) || y.includes(x)
}

export const isTierA = (insurerName: string | null | undefined): boolean => TIER_A_INSURERS.some(t => sameInsurer(t, insurerName))
export const isCigna = (insurerName: string | null | undefined): boolean => sameInsurer('Cigna', insurerName)

/**
 * The tier of an insurer, given the insurers with an approved rate table on file (from
 * approvedInsurerNames). Cigna is Tier B only once its table is loaded; until then Tier C.
 */
export function tierOf(insurerName: string | null | undefined, approvedInsurers: readonly string[] = []): InsurerTier {
  if (isTierA(insurerName)) return 'A'
  if (isCigna(insurerName) && approvedInsurers.some(isCigna)) return 'B'
  return 'C'
}

/** Insurer names with an approved rate table. Empty on any read failure, so every non-A insurer is Tier C. */
export async function approvedInsurerNames(): Promise<string[]> {
  const rows = await sbTry<{ insurer_name: string | null }[]>('gb_rate_tables?status=eq.approved&select=insurer_name', [])
  return rows.map(r => r.insurer_name ?? '').filter(Boolean)
}

/** tierOf with the rate tables read from the database. */
export async function resolveTier(insurerName: string | null | undefined): Promise<InsurerTier> {
  return tierOf(insurerName, await approvedInsurerNames())
}

// ── Covers from the spec text ───────────────────────────────────────────────────────────────

const COVER_WORDS: { code: string; re: RegExp }[] = [
  { code: 'GHS',  re: /hospital\s*(?:&|and|\+)?\s*surgical|\bGHS\b|\bH\s*&\s*S\b|hospitali[sz]ation|inpatient/i },
  { code: 'EMM',  re: /maternity|\bEMM\b|(?:extended|major)\s*medical/i },
  { code: 'GTL',  re: /term\s*life|\bGTL\b|group\s*life|life\s*(?:cover|insurance|assurance)/i },
  { code: 'GCI',  re: /critical\s*illness|\bGCI\b|dread\s*disease/i },
  { code: 'GPA',  re: /personal\s*accident|\bGPA\b/i },
  { code: 'GOPC', re: /outpatient\s*(?:GP|general\s*practi\w*|primary)|\bGOPC\b|\bGP\s*(?:visits?|cover|clinic|consult\w*)|general\s*practitioner/i },
  { code: 'GOSC', re: /specialist|\bGOSC\b/i },
  { code: 'GD',   re: /dental|\bGD\b/i },
]

const WARD_HINTS: [RegExp, number][] = [
  [/\b(?:ward|class)\s*A\b|\bA\s*(?:ward|class)\b/i, 1],
  [/\bB1\b/i, 2],
  [/\bB2\b/i, 4],
]

const MONEY_RE = /(?:S?\$\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m)?\b/gi

/** The amount printed nearest the cover's name, within 60 characters either side. Null when none. */
function sumNear(text: string, re: RegExp): number | null {
  const m = text.match(re)
  if (!m || m.index == null) return null
  const from = m.index, to = m.index + m[0].length
  let best: { value: number; distance: number } | null = null
  for (const x of text.matchAll(MONEY_RE)) {
    const value = parseSum(x[0])
    if (!value || x.index == null) continue
    const distance = x.index >= to ? x.index - to : from - (x.index + x[0].length)
    if (distance > 60) continue
    if (!best || distance < best.distance) best = { value, distance }
  }
  return best?.value ?? null
}

/**
 * The covers a placement line's spec asks for, read from its words. Hospital type, ward and
 * sums assured are taken where stated. Nothing recognised → GHS alone, the default an
 * "employee benefits" request means. Pure.
 */
export function coversFromSpec(spec: Spec | null | undefined): CoverSpec[] {
  const s = normaliseSpec(spec)
  // Cover words may sit in any field; amounts are read beside them in the prose fields only,
  // so a Limit of "S$1M" is never taken as every cover's sum.
  const body = [s.scope, s.extras, s.notes].filter(Boolean).join('. ')
  const text = [body, s.limit].filter(Boolean).join('. ')
  const found = COVER_WORDS.filter(c => c.re.test(text)).map(c => c.code)
  if (found.length === 0) return [{ code: 'GHS' }]
  // EMM is a rider on hospital cover: asked alone, GHS comes with it.
  if (found.includes('EMM') && !found.includes('GHS')) found.unshift('GHS')
  const order = (c: string) => PRODUCT_BY_CODE[c]?.sortOrder ?? 999
  found.sort((a, b) => order(a) - order(b))

  const hospital = parseHospital(text)
  const wardHint = WARD_HINTS.find(([re]) => re.test(text))?.[1] ?? parseWard(text)
  const sumCovers = found.filter(isSumCover)

  return found.map(code => {
    const out: CoverSpec = { code }
    if (isHospitalCover(code)) {
      if (hospital) out.hospital = hospital
      if (wardHint) out.ward = wardHint
    }
    if (isSumCover(code)) {
      const re = COVER_WORDS.find(c => c.code === code)!.re
      // Beside the cover's name first; the Limit field only when it can belong to one cover.
      const sum = sumNear(body, re) ?? (sumCovers.length === 1 ? parseSum(s.limit) : null)
      if (sum) out.sumAssured = sum
    }
    return out
  })
}

// ── Census ──────────────────────────────────────────────────────────────────────────────────

const RELATIONSHIP_WORD: Record<string, string> = { self: 'Employee', employee: 'Employee', spouse: 'Spouse', child: 'Child' }
const relationshipWord = (r: string) => RELATIONSHIP_WORD[r.toLowerCase()] ?? r

/** The census as a plain-text table for an email body: name, relationship, date of birth, category. */
export function censusSummary(census: Member[]): string {
  const rows = census.map(m => [m.name.trim(), relationshipWord(m.relationship), m.dob ?? (m.age != null ? `age ${m.age}` : '—'), m.category.trim() || '—'])
  const head = ['Name', 'Relationship', 'Date of birth', 'Category']
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)))
  const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()
  const employees = census.filter(m => /^(self|employee)$/i.test(m.relationship)).length
  return [
    `Employee list (${census.length} lives: ${employees} employees, ${census.length - employees} dependants)`,
    '',
    line(head),
    line(widths.map(w => '-'.repeat(w))),
    ...rows.map(line),
  ].join('\n')
}

export const toMembers = (s: Pick<HrSubmission, 'employees' | 'dependants'>): Member[] => toCensus(s)

/** The list a line was priced on: the HR submission it points at, else the latest engine run's census. */
export async function censusForLine(line: PlacementLine & { census_submission_id?: string | null }, quotes: PlacementQuote[]): Promise<Member[]> {
  if (line.census_submission_id) {
    const [sub] = await sbTry<Pick<HrSubmission, 'employees' | 'dependants'>[]>(`hr_submissions?id=eq.${line.census_submission_id}&select=employees,dependants&limit=1`, [])
    if (sub) return toMembers(sub)
  }
  const run = quotes.filter(q => q.line_id === line.id && (q as EngineQuote).engine_run_id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] as EngineQuote | undefined
  if (run?.engine_run_id) {
    const [q] = await sbTry<{ census: Member[] | null }[]>(`gb_quotations?id=eq.${run.engine_run_id}&select=census&limit=1`, [])
    if (Array.isArray(q?.census)) return q.census
  }
  return []
}

// ── Pricing ─────────────────────────────────────────────────────────────────────────────────

type EngineQuote = PlacementQuote & { source?: 'insurer' | 'rate_table'; engine_run_id?: string | null; plan_label?: string | null }
type LineRow = PlacementLine & { policy_id?: string | null; census_submission_id?: string | null }

const AWAITING: PlacementDispatch['status'][] = ['drafted', 'sent', 'acknowledged', 'info_requested']
const money = (n: number) => n.toLocaleString('en-SG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export async function loadLine(lineId: string): Promise<LineRow | null> {
  const rows = await sbTry<LineRow[]>(`placement_lines?id=eq.${lineId}&limit=1`, [])
  return rows[0] ?? null
}

/** The line's current round; round 1 is opened without emailing anyone when there is none yet. */
async function currentRound(line: LineRow, rounds: PlacementRound[], actor: string): Promise<PlacementRound> {
  const existing = (line.current_round_id && rounds.find(r => r.id === line.current_round_id))
    || [...rounds].filter(r => r.line_id === line.id).sort((a, b) => b.round_no - a.round_no)[0]
  if (existing) return existing
  const [round] = await store.insert<PlacementRound>('placement_rounds', {
    placement_id: line.placement_id, line_id: line.id, round_no: 1, spec: normaliseSpec(line.spec),
    change_summary: null, reason: 'initial', source_message_id: null, opened_by: actor,
  })
  await store.patch('placement_lines', `id=eq.${line.id}`, { current_round_id: round.id, status: 'quoting' })
  return round
}

export type PriceInput = {
  census: Member[]
  covers?: CoverSpec[]
  basis?: 'new_business' | 'renewal'
  submissionId?: string | null
  actor: string
}
export type PriceResult = { quotationId: string; quotes: PlacementQuote[]; partial: number; notes: string[] }

/**
 * Prices the census at every Tier A insurer and files one placement_quotes row per insurer
 * that priced every cover. A fresh run supersedes that insurer's earlier engine price on the
 * line. Does not email anyone.
 */
export async function priceLine(lineId: string, input: PriceInput): Promise<PriceResult> {
  const line = await loadLine(lineId)
  if (!line) throw new Error('Line not found')
  const bundle = await store.loadPlacement(line.placement_id)
  const placement = bundle?.placements[0]
  if (!bundle || !placement) throw new Error('Placement not found')
  const company = await store.company(placement.company_id)
  const round = await currentRound(line, bundle.rounds, input.actor)
  const covers = input.covers?.length ? input.covers : coversFromSpec(line.spec)
  const census = input.census.filter(m => m && typeof m.name === 'string' && m.name.trim())

  const d = await draftQuotation({
    census, covers, companyName: company?.company_name ?? placement.title,
    effectiveDate: placement.inception_date ?? defaultEffectiveDate(),
    basis: input.basis ?? 'new_business', source: 'placement', createdBy: /^[0-9a-f-]{36}$/i.test(input.actor) ? input.actor : null /* gb_quotations.created_by is a uuid */,
    notesHead: [`Priced for placement line ${line.label ?? line.product_line} (${line.id}).`],
  })

  const productLabel = covers.map(c => PRODUCT_BY_CODE[c.code]?.abbrev ?? c.code).join(' + ')
  const quotes: PlacementQuote[] = []
  for (const r of d.complete) {
    await store.patchNoTs('placement_quotes', `line_id=eq.${line.id}&source=eq.rate_table&insurer_name=eq.${enc(r.insurer_name)}&status=eq.received`, { status: 'superseded' })
    const [q] = await store.insert<PlacementQuote>('placement_quotes', {
      placement_id: line.placement_id, line_id: line.id, round_id: round.id, dispatch_id: null,
      insurer_name: r.insurer_name, source: 'rate_table', engine_run_id: d.quotationId,
      premium_text: `S$${r.total.toFixed(2)} per annum incl. GST`, premium_amount: r.total, currency: 'SGD',
      plan_label: Object.keys(r.by_product).join(' + ') || null,
      summary: `${census.length} lives, ${productLabel}`,
      evidence: { premium: { excerpt: `rate table ${r.rate_table_id}`, source: 'engine' } },
      key_terms: [], exclusions: [], subjectivities: [],
      extracted_by: 'engine', status: 'received', needs_review: false,
    })
    if (q) quotes.push(q)
    await store.log({ company_id: placement.company_id, placement_id: placement.id, line_id: line.id, round_id: round.id, kind: 'quote', actor: input.actor,
      text: `${r.insurer_name} priced S$${money(r.total)} (rate table, ${census.length} lives)`, detail: { quotation_id: d.quotationId, rate_table_id: r.rate_table_id } })
  }

  const linePatch: Record<string, unknown> = {}
  if (input.submissionId) linePatch.census_submission_id = input.submissionId
  const awaiting = bundle.dispatches.some(x => x.line_id === line.id && x.round_id === round.id && AWAITING.includes(x.status))
  if (quotes.length > 0 && !awaiting) {
    linePatch.status = 'quoted'
    linePatch.next_step = `Priced at ${quotes.length} insurer${quotes.length === 1 ? '' : 's'} — choose, or ask Tier C insurers`
  } else if (quotes.length === 0) {
    linePatch.next_step = 'No insurer priced the full list — check the covers and the categories'
    await store.log({ company_id: placement.company_id, placement_id: placement.id, line_id: line.id, round_id: round.id, kind: 'info', actor: 'system',
      text: `Engine run priced no insurer in full (${d.partial} partial). ${d.notes.join(' ')}`.slice(0, 2000), detail: { quotation_id: d.quotationId } })
  }
  if (Object.keys(linePatch).length) await store.patch('placement_lines', `id=eq.${line.id}`, linePatch)

  return { quotationId: d.quotationId, quotes, partial: d.partial, notes: d.notes }
}

// ── Tier C ──────────────────────────────────────────────────────────────────────────────────

/**
 * Asks the Tier C insurers on file for this product line by email, with the census under the
 * spec. Opens the next round on this one line through openRounds (the usual drafts, one per
 * underwriter, for a person to approve). `contactIds` narrows the ask to the broker's pick.
 */
export async function openTierC(lineId: string, actor: string, contactIds?: string[], requirement?: string): Promise<{ dispatches: PlacementDispatch[]; drafts: number; unrouted: string[]; lives: number }> {
  const line = await loadLine(lineId)
  if (!line) throw new Error('Line not found')
  const bundle = await store.loadPlacement(line.placement_id)
  const placement = bundle?.placements[0]
  if (!bundle || !placement) throw new Error('Placement not found')
  const approved = await approvedInsurerNames()
  // Tier B plans quoted on request (Cigna Care Connect 2.0, April) are asked the same way as Tier C.
  const routes = (await store.insurerRoutes([line.product_line])).filter(r => tierOf(r.insurer_name, approved) !== 'A')
  if (routes.length === 0) {
    await store.log({ company_id: placement.company_id, placement_id: placement.id, line_id: line.id, kind: 'info', actor: 'system',
      text: `No Tier C insurer contact on file for ${line.label ?? line.product_line}. Add one on the Insurers page.` })
    return { dispatches: [], drafts: 0, unrouted: [line.label ?? line.product_line], lives: 0 }
  }
  const census = await censusForLine(line, bundle.quotes)
  const tierC = new Set(routes.map(r => r.email))
  // Asking Tier B or C on a line with no request out yet is the first request, not a revision.
  const asked = bundle.dispatches.some(x => x.line_id === line.id)
  const r = await openRounds(placement, [{ line, spec: line.spec, reason: asked ? 'broker' : 'initial', change_summary: asked ? `Insurers asked: ${[...new Set(routes.map(x => x.insurer_name))].join(', ')}` : null }], actor, {
    filterRoute: x => tierC.has(x.email),
    reuseEmptyRound: !asked,
    contactIds,
    extraBody: [requirement, census.length ? censusSummary(census) : null].filter(Boolean).join('\n\n') || undefined,
  })
  return { dispatches: r.dispatches, drafts: r.drafts, unrouted: r.unrouted, lives: census.length }
}

/**
 * Files a plan-builder quotation's Tier A prices on a placement line, as priceLine does for an
 * engine run, so the line shows them beside the Tier B and C replies and reads its employee list
 * from the quotation. Earlier engine prices from the same insurer are superseded.
 */
export async function attachQuotation(lineId: string, quotationId: string, actor: string): Promise<number> {
  const line = await loadLine(lineId)
  if (!line) throw new Error('Line not found')
  const bundle = await store.loadPlacement(line.placement_id)
  const placement = bundle?.placements[0]
  if (!bundle || !placement) throw new Error('Placement not found')
  const [q] = await sbTry<{ results: { rate_table_id: string; insurer_name: string; total: number; missing?: number; by_product: Record<string, number> }[] | null; member_count: number }[]>(
    `gb_quotations?id=eq.${quotationId}&select=results,member_count&limit=1`, [])
  if (!q) throw new Error('Quotation not found')
  const round = await currentRound(line, bundle.rounds, actor)
  let filed = 0
  for (const r of (q.results ?? []).filter(x => !x.missing)) {
    await store.patchNoTs('placement_quotes', `line_id=eq.${line.id}&source=eq.rate_table&insurer_name=eq.${enc(r.insurer_name)}&status=eq.received`, { status: 'superseded' })
    await store.insert<PlacementQuote>('placement_quotes', {
      placement_id: line.placement_id, line_id: line.id, round_id: round.id, dispatch_id: null,
      insurer_name: r.insurer_name, source: 'rate_table', engine_run_id: quotationId,
      premium_text: `S$${r.total.toFixed(2)} per annum incl. GST`, premium_amount: r.total, currency: 'SGD',
      plan_label: Object.keys(r.by_product).join(' + ') || null, summary: `${q.member_count} lives, plan builder`,
      evidence: { premium: { excerpt: `rate table ${r.rate_table_id}`, source: 'engine' } },
      key_terms: [], exclusions: [], subjectivities: [], extracted_by: 'engine', status: 'received', needs_review: false,
    })
    filed++
  }
  await store.log({ company_id: placement.company_id, placement_id: placement.id, line_id: line.id, round_id: round.id, kind: 'quote', actor,
    text: `Plan builder prices filed: ${filed} Tier A insurer${filed === 1 ? '' : 's'}`, detail: { quotation_id: quotationId } })
  return filed
}
