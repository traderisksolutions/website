/**
 * The group benefits agent: from an inbound request to a draft quotation.
 *
 * The inbox classifier (housekeeping, /api/email/classify) marks a thread `group_benefits` and
 * hands it here. This reads the request and its attachments, prices the census at every insurer
 * with a current rate table, and saves a draft quotation on the Pricing Matrix — before anyone
 * has opened the email. The broker reviews it; nothing is sent.
 *
 * Where the model is used, and where it is not:
 *   - One call reads the email: which covers are asked for, what the client wants of each, the
 *     census. Dates are copied verbatim and read by code, day first — never by the model.
 *   - One call per product picks each insurer's plan tier closest to that requirement
 *     (gb-plan-match.ts), from tiers the rate table actually prices.
 *   - The premiums, the comparison and the score are the same deterministic code a broker's
 *     own quote runs through (quotation.ts, compare-quotation.ts).
 *
 * When the email states no requirement for a cover, the draft is priced against DEFAULT_TARGET
 * and the quotation's notes say so, line by line. A draft is a starting price, not advice.
 *
 * Spend is attributed to the group_benefit agent, on its own key.
 */
import { callGemini } from '../ai-call'
import { GEMINI_FLASH } from '../gemini-models'
import { fetchAllRows } from '../postgrest-all'
import { parseBirthDate, parseDocumentDate, todaySGT } from '../dates/dob'
import { recordHousekeeping } from '../agent-activity'
import { suggestPlanMatch, type MatchProduct } from '../gb-plan-match'
import { PRODUCT_BY_CODE } from './canon'
import { resolveProduct } from './resolve'
import { createQuotation } from './quotation'
import { compareQuotation } from './compare-quotation'
import { DEFAULT_SETTINGS } from './score'
import type { Member } from '../gb-quote'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}
async function get<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbH(), cache: 'no-store' })
  if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return await res.json() as T[]
}

/** What a draft is priced against when the email states nothing for that cover. Private 1-bed
 *  is the common Singapore SME corporate standard; every other cover starts at the entry tier. */
export const DEFAULT_TARGET: Record<string, string> = {
  GHS: 'Private hospital, 1-bedded ward',
  EMM: 'The entry-level plan (lowest benefit tier offered)',
  GHS_FW: 'The plan meeting the MOM minimum',
  GTL: 'The entry-level plan (lowest sum assured offered)',
  GCI: 'The entry-level plan (lowest sum assured offered)',
  GPA: 'The entry-level plan (lowest sum assured offered)',
  GADD: 'The entry-level plan (lowest sum assured offered)',
  GOPC: 'The entry-level plan (lowest benefit tier offered)',
  GOSC: 'The entry-level plan (lowest benefit tier offered)',
  GD: 'The entry-level plan (lowest benefit tier offered)',
}

const CANON_CODES = Object.keys(DEFAULT_TARGET)

export type IntakeRead = {
  isRequest: boolean
  companyName: string | null
  basis: 'new_business' | 'renewal'
  currentInsurer: string | null
  effectiveDate: string | null
  products: { code: string; requirement: string | null }[]
  members: Member[]
  unreadDates: string[]
}

export type IntakeResult =
  | { status: 'skipped'; reason: string; quotationId?: string }
  | { status: 'not_a_request' }
  | { status: 'awaiting_census'; quotationId: string }
  | { status: 'drafted'; quotationId: string; insurers: number; complete: number; cheapest: number | null; dearest: number | null }

const SYSTEM = `You read an email sent to a Singapore insurance broker and its attachments, and extract a group employee benefits request.

Return ONLY JSON:
{
  "is_group_benefits_request": boolean,
  "company_name": string | null,
  "basis": "new_business" | "renewal",
  "current_insurer": string | null,
  "effective_date": string | null,
  "products": [{ "code": "GHS"|"EMM"|"GHS_FW"|"GTL"|"GCI"|"GPA"|"GADD"|"GOPC"|"GOSC"|"GD", "requirement": string | null }],
  "members": [{ "name": string, "category": string, "relationship": "self"|"spouse"|"child", "dob": string | null, "age": number | null, "occupation_class": string | null }]
}

Rules:
- is_group_benefits_request: true when the sender asks for a quotation, renewal terms or a review of group employee benefits (hospital & surgical, term life, critical illness, personal accident, outpatient GP/specialist, dental, foreign worker medical). False for claims, endorsements, member additions on an existing policy, newsletters, or anything else.
- products: the covers asked for. GHS = group hospital & surgical; EMM = extended/major medical; GHS_FW = foreign worker medical; GTL = term life; GCI = critical illness; GPA = personal accident; GADD = accidental death & dismemberment; GOPC = outpatient GP; GOSC = outpatient specialist; GD = dental. "Employee benefits" with no covers named means GHS.
- requirement: what the client wants for that cover, quoted or closely paraphrased from the email or the attachment (ward class, hospital type, limit, sum assured, co-payment, current plan). null when nothing is stated. Never invent one.
- basis: "renewal" when the client has the cover today and wants it renewed or re-marketed; else "new_business".
- effective_date: copy exactly as written. null when not stated.
- company_name: the company to be insured, as the request or census names it — which may differ from the sender's employer.
- members: one row per person in the census, dependants included. relationship: employee/staff/principal = "self". category = the grade/category column, else "Default". dob: copy EXACTLY as written, character for character; never reorder day and month. age: copy an age column if there is one, else null — never work an age out from a date of birth.
- Ignore header, total and blank rows. Never invent a member.`

type RawRead = {
  is_group_benefits_request?: boolean; company_name?: string | null; basis?: string
  current_insurer?: string | null; effective_date?: string | null
  products?: { code?: string; requirement?: string | null }[]
  members?: { name?: string; category?: string; relationship?: string; dob?: string | null; age?: number | null; occupation_class?: string | null }[]
}

/** The model's read, made safe: codes checked, dates read day-first by code, unreadable dates
 *  cleared and listed, never guessed. Pure, so it is tested without a model. */
export function normaliseRead(raw: RawRead): IntakeRead {
  const unreadDates: string[] = []
  const members: Member[] = (raw.members ?? [])
    .filter(m => typeof m.name === 'string' && m.name.trim())
    .map(m => {
      const rel = m.relationship === 'spouse' || m.relationship === 'child' ? m.relationship : 'self'
      let dob: string | null = null
      if (m.dob) {
        const d = parseBirthDate(m.dob)
        if (d) dob = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
        else unreadDates.push(`${m.name}: "${m.dob}"`)
      }
      // A date of birth that reads wins: the engine ages it on the policy start date. A stated
      // age is used only without one — and the model is told never to work an age out itself.
      const age = !dob && typeof m.age === 'number' && m.age > 0 && m.age < 120 ? Math.floor(m.age) : null
      return { name: m.name!.trim(), category: (m.category ?? '').trim() || 'Default', relationship: rel, dob, age,
               occupation_class: m.occupation_class ? String(m.occupation_class) : null } as Member
    })
  const seen = new Set<string>()
  const products = (raw.products ?? [])
    .filter(p => p.code && CANON_CODES.includes(p.code) && !seen.has(p.code) && seen.add(p.code))
    .map(p => ({ code: p.code!, requirement: p.requirement?.trim() || null }))
  const eff = parseDocumentDate(raw.effective_date ?? null)
  return {
    isRequest: !!raw.is_group_benefits_request,
    companyName: raw.company_name?.trim() || null,
    basis: raw.basis === 'renewal' ? 'renewal' : 'new_business',
    currentInsurer: raw.current_insurer?.trim() || null,
    effectiveDate: eff ? `${eff.y}-${String(eff.m).padStart(2, '0')}-${String(eff.d).padStart(2, '0')}` : null,
    products: products.length ? products : [{ code: 'GHS', requirement: null }],
    members,
    unreadDates,
  }
}

/** The first of next month, Singapore time — when no start date is given. */
export function defaultEffectiveDate(): string {
  const t = todaySGT()
  const y = t.m === 12 ? t.y + 1 : t.y, m = t.m === 12 ? 1 : t.m + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/**
 * The label an insurer prices a canonical cover under, given everything the client asked for
 * and what is already priced on that table.
 *
 * Never a label overlapping a cover already priced: AIA sells "GP" alone and "GP + SP" as a
 * bundle, and pricing both for a GP + SP request charges GP twice. Among the rest, the label
 * covering most of what was asked for wins ("GTL + GACI" for a GTL and GCI request), then the
 * one carrying least that was not asked for ("GTL" over "GTL + GACI" for GTL alone), then the
 * narrower. A bundle with an unrequested cover is used only when nothing narrower is priced
 * ("GHS+EMM" for AIA's GHS).
 */
export function titleFor(code: string, titles: string[], requested: string[] = [code], covered: Set<string> = new Set()): string | null {
  const want = new Set(requested)
  const cands = titles
    .map(t => ({ t, codes: resolveProduct(t).codes }))
    .filter(x => x.codes.includes(code) && !x.codes.some(c => covered.has(c)))
    .map(x => ({ ...x,
      asked: x.codes.filter(c => want.has(c)).length,
      extra: x.codes.filter(c => !want.has(c)).length }))
  cands.sort((a, b) => b.asked - a.asked || a.extra - b.extra || a.codes.length - b.codes.length || a.t.localeCompare(b.t))
  return cands[0]?.t ?? null
}

/** Census categories that are foreign workers — the people GHS-FW is for. */
export const isForeignWorkerCategory = (c: string) => /work\s*permit|\bwp\b|s[\s-]*pass|foreign|\bfw\b|migrant/i.test(c)

type Table = { id: string; insurer_id: string | null; insurer_name: string | null; effective_date: string | null }
type RateKey = { rate_table_id: string; product_code: string; plan_code: string }
type PlanRow = { rate_table_id: string; product_code: string; plan_code: string; plan_name: string | null
                 hospital_type: string | null; beds: string | null; canon_codes: string[] | null }
type BenRow = { rate_table_id: string; plan_code: string | null; category: string | null; benefit_name: string; value_text: string | null }

/** Approved tables, newest per insurer — the same choice the New quote wizard offers. */
async function currentTables(): Promise<Table[]> {
  const all = await get<Table>('gb_rate_tables?status=eq.approved&select=id,insurer_id,insurer_name,effective_date')
  const latest = new Map<string, Table>()
  for (const t of all) {
    const k = t.insurer_id ?? `name:${t.insurer_name ?? ''}`
    const cur = latest.get(k)
    if (!cur || (t.effective_date ?? '') > (cur.effective_date ?? '')) latest.set(k, t)
  }
  return Array.from(latest.values())
}

/** Wait for the ingest's attachment extraction, which runs alongside the classifier. */
async function attachmentsFor(threadId: string, messageId: string | null, expectAttachments: boolean) {
  type Att = { filename: string; mime_type: string | null; parsed_text: string | null }
  const q = `email_attachments?thread_id=eq.${threadId}&select=filename,mime_type,parsed_text&order=created_at.asc`
  for (let i = 0; i < 8; i++) {
    const rows = await get<Att & { message_id?: string }>(messageId ? `${q}&message_id=eq.${messageId}` : q)
    const ready = rows.length > 0 && rows.every(r => r.parsed_text != null)
    if (!expectAttachments || ready) return messageId ? (await get<Att>(q)) : rows
    await new Promise(r => setTimeout(r, 15_000))
  }
  return await get<Att>(q)
}

const isSheet = (f: string, m: string | null) => /sheet|excel|csv/i.test(m ?? '') || /\.(xlsx|xlsm|xls|csv)$/i.test(f)

export async function runGroupBenefitIntake(threadId: string, messageId: string | null): Promise<IntakeResult> {
  // ── Once per message. A re-run of the same email does not open a second draft. ──
  const tag = `[message:${messageId ?? 'none'}] [thread:${threadId}]`
  const existing = await get<{ id: string }>(`gb_quotations?notes=like.*${encodeURIComponent(`[message:${messageId ?? 'none'}]`)}*&select=id&limit=1`)
  if (existing[0]) return { status: 'skipped', reason: 'already drafted', quotationId: existing[0].id }

  const [thread] = await get<{ id: string; subject: string | null; company_id: string | null }>(
    `email_threads?id=eq.${threadId}&select=id,subject,company_id&limit=1`)
  if (!thread) return { status: 'skipped', reason: 'thread not found' }
  const msgs = await get<{ id: string; subject: string | null; body_text: string | null; has_attachments: boolean | null }>(
    messageId ? `email_messages?id=eq.${messageId}&select=id,subject,body_text,has_attachments&limit=1`
              : `email_messages?thread_id=eq.${threadId}&direction=eq.inbound&order=sent_at.desc&select=id,subject,body_text,has_attachments&limit=1`)
  const msg = msgs[0]
  if (!msg) return { status: 'skipped', reason: 'no inbound message' }

  const company = thread.company_id
    ? (await get<{ company_name: string }>(`companies?id=eq.${thread.company_id}&select=company_name&limit=1`))[0]?.company_name ?? null
    : null

  // ── Read the request. Spreadsheets first — that is where a census lives. ──
  const atts = await attachmentsFor(threadId, msg.id, !!msg.has_attachments)
  const seen = new Set<string>()
  const files = atts.filter(a => (a.parsed_text ?? '').trim().length > 10 && !seen.has(a.filename) && seen.add(a.filename))
    .sort((a, b) => Number(isSheet(b.filename, b.mime_type)) - Number(isSheet(a.filename, a.mime_type)))
  let budget = 40_000
  const corpus = files.map(f => {
    const t = (f.parsed_text ?? '').slice(0, Math.max(0, Math.min(budget, 25_000)))
    budget -= t.length
    return t ? `# ATTACHMENT: ${f.filename}\n${t}` : ''
  }).filter(Boolean).join('\n\n')

  const { text, error } = await callGemini({
    agent: 'group_benefit', feature: 'gb_intake_extract', model: GEMINI_FLASH, system: SYSTEM, json: true,
    temperature: 0, maxOutputTokens: 24_000, metadata: { thread_id: threadId, message_id: msg.id },
    parts: [{ text: `SUBJECT: ${msg.subject ?? thread.subject ?? ''}\n\nEMAIL:\n${(msg.body_text ?? '').slice(0, 8000)}\n\n${corpus}` }],
  })
  if (!text) return { status: 'skipped', reason: error ?? 'model returned nothing' }
  let raw: RawRead
  try { raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as RawRead } catch { return { status: 'skipped', reason: 'unreadable model output' } }
  const read = normaliseRead(raw)
  if (!read.isRequest) return { status: 'not_a_request' }

  // The insured as the request names it; the thread's filed company is the sender's employer,
  // which for a group or an outsourced HR desk is not the policyholder.
  const companyName = read.companyName ?? company ?? thread.subject ?? 'Group benefits request'
  const effectiveDate = read.effectiveDate ?? defaultEffectiveDate()
  const notesHead = [
    `Drafted by the group benefits agent from an email. ${tag}`,
    read.basis === 'renewal' ? `Renewal${read.currentInsurer ? `; current insurer ${read.currentInsurer}` : ''}.` : 'New business.',
    read.effectiveDate ? null : `Start date not stated; priced from ${effectiveDate}.`,
    company && company !== companyName ? `Thread filed under ${company}.` : null,
    read.unreadDates.length ? `Dates of birth not read, ages used where given: ${read.unreadDates.join('; ')}.` : null,
  ].filter(Boolean) as string[]

  // ── No census: open the row anyway, so the request is on the board to chase. ──
  if (!read.members.length) {
    const res = await fetch(`${SB_URL}/rest/v1/gb_quotations`, {
      method: 'POST', headers: sbH('return=representation'),
      body: JSON.stringify({
        company_name: companyName, effective_date: effectiveDate, gst_rate: 0.09, basis: read.basis,
        product_codes: read.products.map(p => PRODUCT_BY_CODE[p.code]?.name ?? p.code), rate_table_ids: [],
        category_map: {}, census: [], results: [], member_count: 0, source: 'email', created_by: null,
        notes: [...notesHead, 'Awaiting census: no member list in the email or its attachments.',
                ...read.products.map(p => `${p.code}: ${p.requirement ?? 'no requirement stated'}`)].join('\n'),
      }),
    })
    if (!res.ok) throw new Error(`Draft not saved: ${res.status} ${(await res.text()).slice(0, 200)}`)
    const id = ((await res.json()) as { id: string }[])[0].id
    recordHousekeeping({ action: 'gb.request_routed', subject: companyName, resourceType: 'gb_quotation', resourceId: id,
                         basis: 'no census attached — row opened to chase', metadata: { thread_id: threadId } })
    return { status: 'awaiting_census', quotationId: id }
  }

  // ── What each insurer prices, per requested cover. ──
  const tables = await currentTables()
  if (!tables.length) return { status: 'skipped', reason: 'no approved rate tables' }
  const ids = tables.map(t => `"${t.id}"`).join(',')
  const [rateKeys, plans, bens] = await Promise.all([
    fetchAllRows<RateKey>(`${SB_URL}/rest/v1/gb_rates?rate_table_id=in.(${ids})&select=rate_table_id,product_code,plan_code`, sbH()),
    fetchAllRows<PlanRow>(`${SB_URL}/rest/v1/gb_plans?rate_table_id=in.(${ids})&select=rate_table_id,product_code,plan_code,plan_name,hospital_type,beds,canon_codes`, sbH()),
    fetchAllRows<BenRow>(`${SB_URL}/rest/v1/gb_benefits?rate_table_id=in.(${ids})&select=rate_table_id,plan_code,category,benefit_name,value_text`, sbH()),
  ])

  const categories = Array.from(new Set(read.members.map(m => m.category)))
  // Foreign-worker medical is for work-permit and S Pass holders, and replaces GHS for them.
  // Without a category marking them, GHS-FW is not priced at all rather than charged to everyone.
  const fwCats = categories.filter(isForeignWorkerCategory)
  const askedFw = read.products.some(p => p.code === 'GHS_FW')
  const categoriesFor = (code: string): string[] =>
    !askedFw ? categories
      : code === 'GHS_FW' ? fwCats
      : code === 'GHS' || code === 'EMM' ? categories.filter(c => !fwCats.includes(c))
      : categories
  const requested = read.products.map(p => p.code)
  const coveredOn = (tid: string) => new Set(Object.keys(categoryMap[tid] ?? {}).flatMap(t => resolveProduct(t).codes))
  const categoryMap: Record<string, Record<string, Record<string, string>>> = {}
  const titlesUsed = new Set<string>()
  const lines: string[] = []

  for (const want of read.products) {
    const canonName = PRODUCT_BY_CODE[want.code]?.name ?? want.code
    const target = want.requirement ?? DEFAULT_TARGET[want.code]
    const cats = categoriesFor(want.code)
    if (!cats.length) {
      lines.push(want.code === 'GHS_FW'
        ? 'GHS_FW: not priced. No work-permit or S Pass category in the census.'
        : `${want.code}: not priced. Every category is on foreign-worker cover.`)
      continue
    }
    const entries: (MatchProduct & { title: string })[] = []
    for (const t of tables) {
      const titles = Array.from(new Set(rateKeys.filter(r => r.rate_table_id === t.id).map(r => r.product_code)))
      // Already priced on this table inside a bundle chosen for an earlier cover.
      if (coveredOn(t.id).has(want.code)) continue
      const title = titleFor(want.code, titles, requested, coveredOn(t.id))
      if (!title) continue
      const codes = Array.from(new Set(rateKeys.filter(r => r.rate_table_id === t.id && r.product_code === title).map(r => r.plan_code)))
      entries.push({
        title, rate_table_id: t.id, insurer_name: t.insurer_name ?? 'Unknown', product_title: canonName,
        // Offered tiers are the ones the rate table prices; the plan row adds ward and hospital.
        plans: codes.map(code => {
          const row = plans.find(p => p.rate_table_id === t.id && p.plan_code === code &&
            (p.product_code === title || (p.canon_codes ?? []).includes(want.code)))
          return { plan_code: code, plan_name: row?.plan_name ?? null, hospital_type: row?.hospital_type ?? null, beds: row?.beds ?? null }
        }),
        benefits: bens.filter(b => b.rate_table_id === t.id).map(b => ({ plan_code: b.plan_code, category: b.category, benefit_name: b.benefit_name, value_text: b.value_text })),
      })
    }
    if (!entries.length) { lines.push(`${want.code}: no insurer prices this cover.`); continue }

    const { suggestions, error: matchError } = await suggestPlanMatch(canonName, target, entries)
    const picked: string[] = []
    for (const e of entries) {
      const s = suggestions.find(x => x.rate_table_id === e.rate_table_id)
      if (!s) continue
      titlesUsed.add(e.title)
      categoryMap[e.rate_table_id] ??= {}
      categoryMap[e.rate_table_id][e.title] = Object.fromEntries(cats.map(c => [c, s.plan_code]))
      picked.push(`${e.insurer_name} ${s.plan_code}`)
    }
    lines.push(`${want.code}: priced against "${target}"${want.requirement ? '' : ' (not stated in the email; default)'}` +
      (picked.length ? `. ${picked.join('; ')}.` : `. No plan matched${matchError ? ` (${matchError})` : ''}.`))
  }

  const tableIds = Object.keys(categoryMap)
  if (!tableIds.length) return { status: 'skipped', reason: `no insurer plan matched: ${lines.join(' ')}` }

  const { quotationId, result } = await createQuotation({
    company_name: companyName, effective_date: effectiveDate, basis: read.basis,
    products: Array.from(titlesUsed), rate_table_ids: tableIds, category_map: categoryMap,
    census: read.members, source: 'email', notes: [...notesHead, ...lines].join('\n'),
  }, null)
  if (!quotationId) throw new Error('Draft quotation not saved')

  // Covers that could be priced at all; one with no one to price it for is not held against anyone.
  const wanted = read.products.map(p => p.code).filter(c => categoriesFor(c).length > 0)
  // The value score opens filtered to the covers asked for, so an insurer quoting fewer of them
  // is shown with the reason rather than ranked cheapest. The broker can clear it.
  await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${quotationId}`, {
    method: 'PATCH', headers: sbH(),
    body: JSON.stringify({ priorities: JSON.stringify({ score: { ...DEFAULT_SETTINGS, filters: { ...DEFAULT_SETTINGS.filters, requiredProducts: wanted } } }) }),
  }).catch(() => {})

  // Compare now, so the value score is ready when the broker opens it. A failure here leaves a
  // priced draft with a Compare button — not worth failing the draft for.
  await compareQuotation(quotationId).catch(e => console.error('[gb-intake] compare failed:', e))

  // A premium for fewer covers is not comparable with one for all of them. The range is drawn
  // only from insurers that priced every requested cover; the rest are counted, not ranged.
  const complete = result.per_insurer.filter(r => r.total > 0 && !r.missing && wanted.every(c => coveredOn(r.rate_table_id).has(c)))
  const partial = result.per_insurer.length - complete.length
  const priced = complete
  const totals = priced.map(r => r.total)
  const cheapest = totals.length ? Math.min(...totals) : null
  const dearest = totals.length ? Math.max(...totals) : null
  const money = (n: number) => `S$${Math.round(n).toLocaleString('en-SG')}`
  recordHousekeeping({
    action: 'gb.request_routed', subject: companyName, resourceType: 'gb_quotation', resourceId: quotationId,
    basis: (cheapest != null
      ? `draft ${money(cheapest)}–${money(dearest!)} a year across ${priced.length} insurer${priced.length === 1 ? '' : 's'} quoting every cover asked for`
      : 'no insurer priced every cover asked for') +
      `; ${read.members.length} members${partial ? `; ${partial} insurer${partial === 1 ? '' : 's'} partial` : ''}`,
    metadata: { thread_id: threadId },
  })
  return { status: 'drafted', quotationId, insurers: result.per_insurer.length, complete: complete.length, cheapest, dearest }
}
