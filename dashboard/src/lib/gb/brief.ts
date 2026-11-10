/**
 * The thread brief: one model read of a whole client thread, returned as facts the scenario rules
 * act on (src/lib/gb/scenarios.ts). The intake agent reads one email for a census and the covers;
 * this reads the conversation for what the client has, wants, will not trade, has ruled out and
 * has decided. Dates and money are copied as written and read by code. normaliseBrief is pure and
 * tested; readThreadBrief does the I/O.
 */
import { callGemini } from '../ai-call'
import { GEMINI_DEEP } from '../gemini-models'
import { parseDocumentDate } from '../dates/dob'
import { ownWords } from '@/lib/admin/b/relay/intent'
import { sb, sbTry, enc, isInternal } from '@/lib/crm/db'
import { parseCoPay, parseHospital, parseWard } from './plan-rules'
import type { Brief, Wish } from './scenarios'
import type { CoverKey, Requirement, Ward } from './ladder'

type Row = Record<string, any>

const COVERS: CoverKey[] = ['GHS', 'EMM', 'GOPC', 'GOSC', 'GD', 'GPA', 'GTL', 'GCI']
const MUSTS = ['ward', 'no_copay', 'dependants', 'gp', 'sp', 'dental', 'pa', 'gtl', 'gci']

export const BRIEF_SYSTEM = `You read a Singapore insurance broker's email threads with a client about group employee benefits (one conversation, sometimes split across threads) (hospital & surgical, outpatient GP and specialist, dental, personal accident, term life, critical illness). Extract what the client HAS, WANTS, will NOT trade, has RULED OUT and has DECIDED. Facts only; never invent.

Return ONLY JSON:
{
  "company": string | null,
  "basis": "renewal" | "new_business",
  "current_insurer": string | null,
  "current_plan": {
    "hospital": "private" | "government" | null, "ward": 1 | 2 | 4 | null, "limit_tier": "entry" | "top" | null, "major_medical": boolean | null,
    "gp": "nil" | "copay" | "none" | null, "specialist": "entry" | "top" | "none" | null, "dental": "entry" | "top" | "none" | null,
    "pa_sum": number | null, "gtl_sum": number | null, "gci_sum": number | null, "dependants": "medical" | "none" | null,
    "as_written": string | null
  },
  "expiring_premium": { "amount": number, "net_of_gst": boolean | null, "as_written": string } | null,
  "budget": { "amount": number, "per": "year_total" | "employee_year" | "employee_month", "net_of_gst": boolean | null, "as_written": string } | null,
  "must_haves": ["ward" | "no_copay" | "dependants" | "gp" | "sp" | "dental" | "pa" | "gtl" | "gci"],
  "wishes": [{ "cover": "GHS"|"EMM"|"GOPC"|"GOSC"|"GD"|"GPA"|"GTL"|"GCI"|"other", "change": "add"|"up"|"down"|"remove", "detail": string | null, "sum": number | null }],
  "optional": ["GHS"|"EMM"|"GOPC"|"GOSC"|"GD"|"GPA"|"GTL"|"GCI"],
  "exclude_insurers": [string], "prefer_insurers": [string],
  "renewal_date": string | null, "effective_date": string | null,
  "decisions": [string], "open": [string]
}

Rules:
- current_plan: for a renewal, the plan in force (its ward, co-payment, tiers, sums); for new business, what the brief asks for. "1-bedded private" = hospital private, ward 1. limit_tier: "top" when the plan is the insurer's Plan 1 or carries the highest annual limit named ("$300k annual limit", "Plan 1 (Private, 1-bed)"); "entry" for a basic, lowest or Plan 3/4 plan. "GP as charged, no co-pay", "GP Plan 1 (0% co)" = gp nil. specialist and dental: "top" for Plan 1 or the highest limit named, else "entry"; "none" when the client has no such cover. A sum assured "$150k" = 150000. Read these from the broker's own description of the plan too (a broker's email to an insurer listing the client's plans is the best source). Leave a field null when the thread does not say.
- as_written: the current plan in the words used, one line.
- expiring_premium: the premium the client pays today, when stated. budget: only when the client states a budget or ceiling; per = how it is stated; never infer one from the expiring premium.
- must_haves: facts the client calls a must, non-negotiable, or asks for in every message ("1 bedder private hospital is a must" → "ward"; "no co-payment" → "no_copay"; dependants must be covered → "dependants").
- wishes: changes the client asks about or would like: "can dental go to $1,000–1,500" → GD up, detail "$1,000–1,500"; "add dental" → GD add; "health screening" → other add. A broker's offer is not a wish unless the client takes it up.
- optional: covers the client calls optional, nice-to-have, or "if the budget allows".
- exclude_insurers: insurers the client told the broker to drop ("remove AIA"). prefer_insurers: insurers the client or broker leans to ("I'd lean towards Income", "add Cigna").
- decisions: what the thread has settled, one short line each, with who said it. open: questions still unanswered, one line each.
- Dates copied exactly as written. Company = the policyholder, not the sender's employer when they differ.`

export type RawBrief = {
  company?: string | null; basis?: string; current_insurer?: string | null
  current_plan?: { hospital?: string | null; ward?: number | null; limit_tier?: string | null; major_medical?: boolean | null; gp?: string | null; specialist?: string | null; dental?: string | null; pa_sum?: number | null; gtl_sum?: number | null; gci_sum?: number | null; dependants?: string | null; as_written?: string | null } | null
  expiring_premium?: { amount?: number; net_of_gst?: boolean | null; as_written?: string } | null
  budget?: { amount?: number; per?: string; net_of_gst?: boolean | null; as_written?: string } | null
  must_haves?: unknown[]; wishes?: { cover?: string; change?: string; detail?: string | null; sum?: number | null }[]; optional?: unknown[]
  exclude_insurers?: unknown[]; prefer_insurers?: unknown[]
  renewal_date?: string | null; effective_date?: string | null
  decisions?: unknown[]; open?: unknown[]
}

const str = (v: unknown, n = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
const strs = (v: unknown, n = 12) => (Array.isArray(v) ? v.map(x => str(x, 240)).filter((x): x is string => !!x).slice(0, n) : [])
const money = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 50_000_000 ? Math.round(v) : null)
const iso = (d: { y: number; m: number; d: number } | null) => d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null

/** The model's read, made safe: enums checked, sums bounded, dates read by code, the plan text
 *  parsed for a ward or co-payment the model left out. */
export function normaliseBrief(raw: RawBrief, employees = 0): Brief {
  const cp = raw.current_plan ?? {}
  const text = str(cp.as_written, 300)
  const hospital = cp.hospital === 'private' || cp.hospital === 'government' ? cp.hospital : parseHospital(text)
  const wardN = cp.ward === 1 || cp.ward === 2 || cp.ward === 4 ? cp.ward : parseWard(text)
  const current: Partial<Requirement> = {}
  if (hospital || wardN) current.ward = `${hospital === 'government' ? 'G' : 'P'}${wardN === 4 ? '4' : wardN === 2 && hospital !== 'government' ? '2' : '1'}` as Ward
  if (cp.limit_tier === 'entry' || cp.limit_tier === 'top') current.wardLevel = cp.limit_tier
  if (typeof cp.major_medical === 'boolean') current.gmm = cp.major_medical
  if (cp.gp === 'nil' || cp.gp === 'copay') current.gp = cp.gp; else if (cp.gp === 'none') current.gp = null
  else if (text && /\bgp\b|outpatient|clinic/i.test(text)) { const cop = parseCoPay(text); if (cop != null) current.gp = cop ? 'copay' : 'nil' }
  if (cp.specialist === 'entry' || cp.specialist === 'top') current.sp = cp.specialist; else if (cp.specialist === 'none') current.sp = null
  if (cp.dental === 'entry' || cp.dental === 'top') current.dental = cp.dental; else if (cp.dental === 'none') current.dental = null
  const pa = money(cp.pa_sum), gtl = money(cp.gtl_sum), gci = money(cp.gci_sum)
  if (pa) current.pa = pa
  if (gtl) current.gtl = gtl
  if (gci) current.gci = gci
  if (cp.dependants === 'medical' || cp.dependants === 'none') current.deps = cp.dependants

  const b = raw.budget
  const amount = money(b?.amount)
  const budget = amount == null ? null
    : b!.per === 'employee_month' ? (employees ? amount * 12 * employees : null)
    : b!.per === 'employee_year' ? (employees ? amount * employees : null)
    : amount
  const wishes: Wish[] = (raw.wishes ?? []).filter(w => w && (COVERS.includes(w.cover as CoverKey) || w.cover === 'other') && ['add', 'up', 'down', 'remove'].includes(w.change ?? ''))
    .map(w => ({ cover: w.cover as Wish['cover'], change: w.change as Wish['change'], detail: str(w.detail, 160), sum: money(w.sum) })).slice(0, 12)
  return {
    company: str(raw.company),
    basis: raw.basis === 'renewal' ? 'renewal' : 'new_business',
    currentInsurer: str(raw.current_insurer, 80),
    current, currentPlanText: text,
    expiringPremium: money(raw.expiring_premium?.amount),
    budget, budgetText: amount == null ? null : str(b?.as_written) ?? `S$${amount.toLocaleString('en-SG')}`,
    budgetNetOfGst: typeof b?.net_of_gst === 'boolean' ? b.net_of_gst : null,
    mustHaves: strs(raw.must_haves).filter(m => MUSTS.includes(m)),
    wishes,
    optional: strs(raw.optional).filter((c): c is CoverKey => COVERS.includes(c as CoverKey)),
    excludeInsurers: strs(raw.exclude_insurers, 8), preferInsurers: strs(raw.prefer_insurers, 8),
    renewalDate: iso(parseDocumentDate(raw.renewal_date ?? null)), effectiveDate: iso(parseDocumentDate(raw.effective_date ?? null)),
    decisions: strs(raw.decisions), open: strs(raw.open),
  }
}

const trim = (s: string | null | undefined, n: number) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n)
const bare = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()

/** The conversation as text: every live message of each thread in order (own words, quoted history
 *  cut), then the files that read as text, spreadsheets excluded (the census is read by code
 *  elsewhere). Several threads when the client's benefits conversation is split across them. */
export async function threadCorpus(threadIds: string[]): Promise<{ subject: string | null; company: string | null; text: string; messages: number }> {
  const ids = Array.from(new Set(threadIds))
  const threads = await sb<Row[]>(`email_threads?id=in.(${ids.map(enc).join(',')})&select=id,subject,last_message_at,companies(company_name)`)
  if (!threads.length) throw new Error('This thread no longer exists.')
  threads.sort((a, b) => String(a.last_message_at ?? '').localeCompare(String(b.last_message_at ?? '')))
  const msgs = await sbTry<Row[]>(`email_messages?thread_id=in.(${ids.map(enc).join(',')})&deleted_at=is.null&select=id,thread_id,direction,from_address,body_text,sent_at,has_attachments&order=sent_at.asc&limit=120`, [])
  const atts = await sbTry<Row[]>(`email_attachments?thread_id=in.(${ids.map(enc).join(',')})&parsed_text=not.is.null&select=filename,mime_type,parsed_text&order=created_at.desc&limit=30`, [])
  const seen = new Set<string>()
  let budget = 24_000
  const files = atts.filter(a => !/sheet|excel|csv/i.test(a.mime_type ?? '') && !/\.(xlsx|xls|csv)$/i.test(a.filename) && !/\.(png|gif|jpe?g)$/i.test(a.filename) && !seen.has(a.filename) && seen.add(a.filename))
    .map(a => { const t = trim(a.parsed_text, Math.min(4_000, Math.max(0, budget))); budget -= t.length; return t ? `# FILE: ${a.filename}\n${t}` : '' }).filter(Boolean)
  let msgBudget = 70_000
  const section = (t: Row) => {
    const lines = msgs.filter(m => m.thread_id === t.id).map(m => {
      const who = isInternal(bare(m.from_address)) ? 'BROKER' : 'CLIENT/OTHER'
      const x = trim(ownWords(m.body_text), Math.min(3_000, Math.max(0, msgBudget))); msgBudget -= x.length
      return `--- ${String(m.sent_at).slice(0, 16)} ${who} ${m.from_address}${m.has_attachments ? ' (files attached)' : ''}\n${x}`
    })
    return `THREAD: ${t.subject ?? ''}\nMESSAGES, oldest first:\n${lines.join('\n\n')}`
  }
  const main = threads.find(t => t.id === ids[0]) ?? threads[0]
  const text = [`COMPANY ON FILE: ${main.companies?.company_name ?? 'none'}`, ...threads.map(section), files.join('\n\n')].filter(Boolean).join('\n\n')
  return { subject: main.subject ?? null, company: main.companies?.company_name ?? null, text, messages: msgs.length }
}

export async function readThreadBrief(threadIds: string[], employees: number, by: string | null): Promise<{ brief: Brief; model: string; messages: number }> {
  const corpus = await threadCorpus(threadIds)
  const r = await callGemini({
    agent: 'group_benefit', feature: 'gb_brief', model: GEMINI_DEEP, system: BRIEF_SYSTEM, json: true, temperature: 0,
    maxOutputTokens: 6_000, thinkingShare: 0.3, metadata: { thread_id: threadIds[0], threads: threadIds.length, by, messages: corpus.messages },
    parts: [{ text: corpus.text }],
  })
  if (!r.text) throw new Error(r.error ?? 'The model returned nothing.')
  let raw: RawBrief
  try { raw = JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as RawBrief } catch { throw new Error('The model’s read was not valid JSON.') }
  const brief = normaliseBrief(raw, employees)
  if (!brief.company) brief.company = corpus.company
  return { brief, model: GEMINI_DEEP, messages: corpus.messages }
}
