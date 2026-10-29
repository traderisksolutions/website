/**
 * The group benefits agent: from an inbound request to a draft quotation.
 *
 * The inbox classifier (housekeeping, /api/email/classify) marks a thread `group_benefits` and
 * hands it here. This reads the request and its attachments, prices the census at every insurer
 * with a current rate table, and saves a draft quotation on the Pricing Matrix — before anyone
 * has opened the email. The broker reviews it; nothing is sent.
 *
 * Where the model is used, and where it is not:
 *   - ONE call reads the email: which covers, what the client wants of each as structured facts
 *     (ward, hospital type, sum assured, co-payment, current plan), and the census. Dates are
 *     copied verbatim and read by code, day first — never by the model. 3.8 Flash, with 30% of
 *     its allowance for thinking and 70% for the answer.
 *   - Everything after is the same engine a CSV upload runs through (draft.ts): plans chosen by
 *     rule, premiums by the quote engine, the comparison, the score. No further model calls.
 *
 * When the email states no requirement for a cover, the draft is priced at the default
 * (plan-rules.ts defaultSpec) and the quotation's notes say so. A draft is a starting price.
 *
 * Spend is attributed to the group_benefit agent, on its own key.
 */
import { callGemini } from '../ai-call'
import { GEMINI_DEEP } from '../gemini-models'
import { parseBirthDate, parseDocumentDate, todaySGT } from '../dates/dob'
import { recordHousekeeping } from '../agent-activity'
import { PRODUCT_BY_CODE } from './canon'
import { draftQuotation, DraftError } from './draft'
import { coversToRequirement } from './ladder'
import { saveBuilder } from './builder'
import type { CoverSpec, Hospital, Tier } from './plan-rules'
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

const CANON_CODES = ['GHS', 'EMM', 'GHS_FW', 'GTL', 'GCI', 'GPA', 'GADD', 'GOPC', 'GOSC', 'GD']

export type IntakeRead = {
  isRequest: boolean
  companyName: string | null
  basis: 'new_business' | 'renewal'
  currentInsurer: string | null
  /** The client's budget as an annual total in S$, when the email states one. */
  budget: number | null
  /** The budget as written, kept for the broker. */
  budgetText: string | null
  /** When the current policy renews, as YYYY-MM-DD. */
  renewalDate: string | null
  /** ISO country of the company to be insured; Tier A schemes insure Singapore companies only. */
  country: string | null
  effectiveDate: string | null
  covers: CoverSpec[]
  members: Member[]
  unreadDates: string[]
}

export type IntakeResult =
  | { status: 'skipped'; reason: string; quotationId?: string }
  | { status: 'not_a_request' }
  | { status: 'awaiting_census'; quotationId: string }
  | { status: 'joined'; quotationId: string }
  | { status: 'tier_c'; quotationId: string; country: string }
  | { status: 'drafted'; quotationId: string; insurers: number; complete: number; cheapest: number | null; dearest: number | null }
  | { status: 'failed'; reason: string }

const SYSTEM = `You read an email sent to a Singapore insurance broker and its attachments, and extract a group employee benefits request.

Return ONLY JSON:
{
  "is_group_benefits_request": boolean,
  "company_name": string | null,
  "basis": "new_business" | "renewal",
  "current_insurer": string | null,
  "renewal_date": string | null,
  "company_country": string | null,
  "budget": { "amount": number, "per": "year_total" | "employee_year" | "employee_month", "as_written": string } | null,
  "effective_date": string | null,
  "products": [{
    "code": "GHS"|"EMM"|"GHS_FW"|"GTL"|"GCI"|"GPA"|"GADD"|"GOPC"|"GOSC"|"GD",
    "requirement": string | null,
    "hospital": "private" | "government" | null,
    "ward": 1 | 2 | 4 | null,
    "co_payment": boolean | null,
    "sum_assured": number | null,
    "tier": "entry" | "top" | null,
    "current_plan": string | null
  }],
  "members": [{ "name": string, "category": string, "relationship": "self"|"spouse"|"child", "dob": string | null, "age": number | null, "occupation_class": string | null }]
}

Rules:
- is_group_benefits_request: true when the sender asks for a quotation, renewal terms or a review of group employee benefits (hospital & surgical, term life, critical illness, personal accident, outpatient GP/specialist, dental, foreign worker medical). False for claims, endorsements, member additions on an existing policy, newsletters, or anything else.
- products: the covers asked for. GHS = group hospital & surgical; EMM = extended/major medical; GHS_FW = foreign worker medical; GTL = term life; GCI = critical illness; GPA = personal accident; GADD = accidental death & dismemberment; GOPC = outpatient GP; GOSC = outpatient specialist; GD = dental. "Employee benefits" with no covers named means GHS.
- requirement: what the client wants for that cover, quoted from the email or attachment. null when nothing is stated.
- hospital, ward, co_payment, sum_assured, tier: the same requirement as facts, only where stated. "1-bedded government restructured" = government, 1. "Private 4-bed" = private, 4. "$100k life" = sum_assured 100000. "No co-payment" = false. "Basic" or "lowest" = entry; "best" or "highest" = top. Leave a field null when the email does not state it. Never invent one.
- current_plan: when the client asks for the same cover as an existing plan, its plan name as written ("Plan 1"). The insurer goes in current_insurer.
- basis: "renewal" when the client has the cover today and wants it renewed or re-marketed; else "new_business".
- effective_date: copy exactly as written. null when not stated.
- renewal_date: when the current policy renews or expires, copied exactly as written. null when not stated.
- company_country: ISO 3166 two-letter code of the country the company to be insured is registered in ("SG", "MY", "ID"). Read it from the name ("Sdn Bhd" = MY, "Pte Ltd" = SG, "PT" = ID), the address or the email. null when unclear.
- budget: only when the email states a budget or a premium ceiling. amount in SGD as a number; per = whether it is the total a year, per employee a year, or per employee a month; as_written = the words used. null when no budget is stated. Never infer one from a current premium.
- company_name: the company to be insured, as the request or census names it — which may differ from the sender's employer.
- members: one row per person in the census, dependants included. relationship: employee/staff/principal = "self". category = the grade/category column, else "Default". dob: copy EXACTLY as written, character for character; never reorder day and month. age: copy an age column if there is one, else null — never work an age out from a date of birth.
- Ignore header, total and blank rows. Never invent a member.`

type RawRead = {
  is_group_benefits_request?: boolean; company_name?: string | null; basis?: string
  current_insurer?: string | null; effective_date?: string | null
  renewal_date?: string | null; company_country?: string | null
  budget?: { amount?: number; per?: string; as_written?: string } | null
  products?: { code?: string; requirement?: string | null; hospital?: string | null; ward?: number | null
                co_payment?: boolean | null; sum_assured?: number | null; tier?: string | null; current_plan?: string | null }[]
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
  const currentInsurer = raw.current_insurer?.trim() || null
  const covers: CoverSpec[] = (raw.products ?? [])
    .filter(p => p.code && CANON_CODES.includes(p.code) && !seen.has(p.code) && seen.add(p.code))
    .map(p => ({
      code: p.code!,
      hospital: p.hospital === 'private' || p.hospital === 'government' ? p.hospital as Hospital : null,
      ward: p.ward === 1 || p.ward === 2 || p.ward === 4 ? p.ward : null,
      coPay: typeof p.co_payment === 'boolean' ? p.co_payment : null,
      sumAssured: typeof p.sum_assured === 'number' && p.sum_assured >= 1000 ? p.sum_assured : null,
      tier: p.tier === 'entry' || p.tier === 'top' ? p.tier as Tier : null,
      sameAs: p.current_plan?.trim() && currentInsurer ? { insurer: currentInsurer, plan: p.current_plan.trim() } : null,
      note: p.requirement?.trim() || null,
    }))
  const eff = parseDocumentDate(raw.effective_date ?? null)
  const ren = parseDocumentDate(raw.renewal_date ?? null)
  const iso = (d: { y: number; m: number; d: number } | null) => d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null
  const employees = members.filter(m => m.relationship === 'self').length
  const b = raw.budget
  const amount = b && typeof b.amount === 'number' && b.amount > 0 && b.amount < 50_000_000 ? b.amount : null
  // Per-employee budgets become an annual total when the census says how many employees there are.
  const budget = amount == null ? null
    : b!.per === 'employee_month' ? (employees ? amount * 12 * employees : null)
    : b!.per === 'employee_year' ? (employees ? amount * employees : null)
    : amount
  const country = typeof raw.company_country === 'string' && /^[A-Za-z]{2}$/.test(raw.company_country.trim()) ? raw.company_country.trim().toUpperCase() : null
  return {
    isRequest: !!raw.is_group_benefits_request,
    companyName: raw.company_name?.trim() || null,
    basis: raw.basis === 'renewal' ? 'renewal' : 'new_business',
    currentInsurer,
    budget: budget == null ? null : Math.round(budget),
    budgetText: amount == null ? null : (b!.as_written?.trim() || `S$${amount.toLocaleString('en-SG')}`).slice(0, 200),
    renewalDate: iso(ren),
    country,
    effectiveDate: iso(eff),
    covers: covers.length ? covers : [{ code: 'GHS' }],
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
    agent: 'group_benefit', feature: 'gb_intake_extract', model: GEMINI_DEEP, system: SYSTEM, json: true,
    temperature: 0, maxOutputTokens: 24_000, thinkingShare: 0.3, metadata: { thread_id: threadId, message_id: msg.id },
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
  const requirement = {
    categories: [{ name: 'All employees', requirement: coversToRequirement(read.covers), overrides: {} }],
    employee_categories: {}, budget: read.budget, tier_b: false,
    budget_text: read.budgetText, current_insurer: read.currentInsurer, renewal_date: read.renewalDate, country: read.country,
  }
  const open = await openRequestFor(companyName)
  const notesHead = [
    `Drafted by the group benefits agent from an email. ${tag}`,
    read.basis === 'renewal' ? `Renewal${read.currentInsurer ? `; current insurer ${read.currentInsurer}` : ''}.` : 'New business.',
    read.effectiveDate ? null : `Start date not stated; priced from ${effectiveDate}.`,
    company && company !== companyName ? `Thread filed under ${company}.` : null,
    read.unreadDates.length ? `Dates of birth not read, ages used where given: ${read.unreadDates.join('; ')}.` : null,
    read.budgetText ? `Budget: ${read.budgetText}.` : 'No budget stated.',
    read.renewalDate ? `Current policy renews ${read.renewalDate}.` : null,
  ].filter(Boolean) as string[]

  // ── The same company already has an open request: a second email joins it. ──
  if (open && !read.members.length) {
    await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${open.id}`, {
      method: 'PATCH', headers: sbH(),
      body: JSON.stringify({ notes: `${open.notes ?? ''}\nAnother email on the same request. ${tag}`.trim(), ...(read.budget && !open.requirement?.budget ? { requirement: { ...(open.requirement ?? requirement), budget: read.budget, budget_text: read.budgetText } } : {}) }),
    })
    recordHousekeeping({ action: 'gb.request_routed', subject: companyName, resourceType: 'gb_quotation', resourceId: open.id, basis: 'same company already has an open request — joined it', metadata: { thread_id: threadId } })
    return { status: 'joined', quotationId: open.id }
  }

  // ── Not a Singapore company: the five local schemes cannot insure it. Open the row for Tier C. ──
  if (read.country && read.country !== 'SG') {
    const res = await fetch(`${SB_URL}/rest/v1/gb_quotations`, {
      method: 'POST', headers: sbH('return=representation'),
      body: JSON.stringify({
        company_name: companyName, effective_date: effectiveDate, gst_rate: 0.09, basis: read.basis,
        product_codes: read.covers.map(p => PRODUCT_BY_CODE[p.code]?.name ?? p.code), rate_table_ids: [], category_map: {},
        census: read.members, results: [], member_count: read.members.length, source: 'email', created_by: null, requirement,
        notes: [...notesHead, `Company registered in ${read.country}: the Singapore Tier A schemes do not apply. Ask Tier C insurers.`].join('\n'),
      }),
    })
    if (!res.ok) throw new Error(`Draft not saved: ${res.status} ${(await res.text()).slice(0, 200)}`)
    const id = ((await res.json()) as { id: string }[])[0].id
    if (open) await supersede(open.id, id)
    recordHousekeeping({ action: 'gb.request_routed', subject: companyName, resourceType: 'gb_quotation', resourceId: id, basis: `company in ${read.country} — Tier C`, metadata: { thread_id: threadId } })
    return { status: 'tier_c', quotationId: id, country: read.country }
  }

  // ── No census: open the row anyway, so the request is on the board to chase. ──
  if (!read.members.length) {
    const res = await fetch(`${SB_URL}/rest/v1/gb_quotations`, {
      method: 'POST', headers: sbH('return=representation'),
      body: JSON.stringify({
        company_name: companyName, effective_date: effectiveDate, gst_rate: 0.09, basis: read.basis,
        product_codes: read.covers.map(p => PRODUCT_BY_CODE[p.code]?.name ?? p.code), rate_table_ids: [],
        category_map: {}, census: [], results: [], member_count: 0, source: 'email', created_by: null, requirement,
        notes: [...notesHead, 'Awaiting census: no member list in the email or its attachments.',
                ...read.covers.map(p => `${p.code}: ${p.note ?? 'no requirement stated'}`)].join('\n'),
      }),
    })
    if (!res.ok) throw new Error(`Draft not saved: ${res.status} ${(await res.text()).slice(0, 200)}`)
    const id = ((await res.json()) as { id: string }[])[0].id
    recordHousekeeping({ action: 'gb.request_routed', subject: companyName, resourceType: 'gb_quotation', resourceId: id,
                         basis: 'no census attached — row opened to chase', metadata: { thread_id: threadId } })
    return { status: 'awaiting_census', quotationId: id }
  }

  // ── The same engine a CSV upload uses. ──
  let draft
  try {
    draft = await draftQuotation({
      census: read.members, covers: read.covers, companyName, effectiveDate, basis: read.basis,
      source: 'email', notesHead, createdBy: null,
    })
  } catch (e) {
    if (e instanceof DraftError) return { status: 'failed', reason: e.message }
    throw e
  }
  const { quotationId, complete: draftComplete, partial } = draft
  if (open) await supersede(open.id, quotationId)
  // Price the draft on the requirement, as the plan builder does, so the broker opens the same
  // numbers the builder shows. The plan-rules draft stays if this fails.
  let result = draft.result, complete = draftComplete
  try {
    const built = await saveBuilder({ quotation_id: quotationId, members: read.members, categories: requirement.categories, effective_date: effectiveDate, basis: read.basis, tier_b: false, budget: read.budget, employee_categories: {} })
    await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${quotationId}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ requirement }) })
    complete = built.insurers.filter(i => i.missing === 0).map(i => ({ ...i, insurer_name: i.insurer_name, total: i.total })) as unknown as typeof complete
    result = { ...result, per_insurer: built.insurers.map(i => ({ rate_table_id: i.rate_table_id, insurer_id: null, insurer_name: i.insurer_name, by_product: i.by_product, subtotal: i.net, gst: i.gst, total: i.total, missing: i.missing })) }
  } catch (e) {
    console.error('[gb/intake] builder pricing failed; keeping the draft', e instanceof Error ? e.message : e)
  }
  const totals = complete.map(r => r.total)
  const cheapest = totals.length ? Math.min(...totals) : null
  const dearest = totals.length ? Math.max(...totals) : null
  const money = (n: number) => `S$${Math.round(n).toLocaleString('en-SG')}`
  recordHousekeeping({
    action: 'gb.request_routed', subject: companyName, resourceType: 'gb_quotation', resourceId: quotationId,
    basis: (cheapest != null
      ? `draft ${money(cheapest)}–${money(dearest!)} a year across ${complete.length} insurer${complete.length === 1 ? '' : 's'} quoting every cover asked for`
      : 'no insurer priced every cover asked for') +
      `; ${read.members.length} members${partial ? `; ${partial} insurer${partial === 1 ? '' : 's'} partial` : ''}`,
    metadata: { thread_id: threadId },
  })
  return { status: 'drafted', quotationId, insurers: result.per_insurer.length, complete: complete.length, cheapest, dearest }
}

/** "Talent Trader Group Pte Ltd" and "TALENT TRADERS GROUP PTE. LTD" are one company. */
export function normCompany(name: string | null | undefined): string {
  return String(name ?? '').toLowerCase()
    .replace(/\b(pte|ltd|limited|private|sdn|bhd|berhad|llp|inc|co|company|the|group|holdings?|singapore|sg)\b\.?/g, ' ')
    .replace(/s\b/g, '').replace(/[^a-z0-9]+/g, '')
}

type OpenRow = { id: string; company_name: string | null; member_count: number; notes: string | null; requirement: Record<string, unknown> | null; created_at: string }

/** The newest request for this company in the last 90 days that nothing has superseded. */
async function openRequestFor(companyName: string): Promise<OpenRow | null> {
  const key = normCompany(companyName)
  if (key.length < 3) return null
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const rows = await get<OpenRow>(`gb_quotations?superseded_by=is.null&created_at=gte.${since}&select=id,company_name,member_count,notes,requirement,created_at&order=created_at.desc&limit=300`)
  return rows.find(r => normCompany(r.company_name) === key) ?? null
}

async function supersede(oldId: string, newId: string): Promise<void> {
  if (oldId === newId) return
  const res = await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${oldId}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ superseded_by: newId }) })
  if (!res.ok) console.error('[gb/intake] supersede failed', oldId, res.status)
}
