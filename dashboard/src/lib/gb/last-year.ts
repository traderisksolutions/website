/**
 * Last year's policy, read from the client's own documents: the policy schedule, its endorsements
 * and the debit note. The broker drops them in the right-hand box of New quotation; a model reads
 * every page (scans included) into a fixed shape; code bounds and checks it here.
 *
 * What it gives the renewal: the insurer and product, the plan each category holds per cover (as
 * the insurer names it, "Plan 3 · Private 1-bed · 0%"), what those plans mean as numbers, and last
 * year's premium per cover. That premium is the anchor every option is measured against.
 *
 * Rules: the newest endorsement wins for each value it changes, and the change is listed; premium by
 * cover must add up to the stated total, else the read says so. No premium is ever made up: a value
 * the documents do not state is null.
 *
 * normaliseLastYear and scheduleFromLastYear are pure; tested in src/__tests__/gb-last-year.test.ts.
 */
import type { HospitalFacts, LifeFacts, Schedule, ScheduleCover } from './current'
import { ALL, planValue } from './current'

export const LAST_YEAR_COVERS = ['GHS', 'EMM', 'GOPC', 'GOSC', 'GD', 'GTL', 'GCI', 'GPA'] as const
export type LastYearCover = typeof LAST_YEAR_COVERS[number]
export const LAST_YEAR_COVER_WORD: Record<LastYearCover, string> = {
  GHS: 'Hospital & Surgical', EMM: 'Major Medical', GOPC: 'Outpatient GP', GOSC: 'Outpatient Specialist',
  GD: 'Dental', GTL: 'Term Life', GCI: 'Critical Illness', GPA: 'Personal Accident',
}

export type CategoryFacts = {
  hospital: 'private' | 'government' | null
  beds: 1 | 2 | 4 | null
  limitKind: 'per_disability' | 'annual' | null
  limit: number | null
  coins: 0 | 20 | 25 | null
  gmm: number | null
  gpCopay: number | null
  spLimit: number | null
  dentalLimit: number | null
  life: LifeFacts | null
  pa: number | null
}
export type LastYearCategory = { name: string; lives: number | null; plans: Partial<Record<LastYearCover, string>>; facts: CategoryFacts }
export type LastYearDoc = { file: string; kind: 'schedule' | 'endorsement' | 'debit_note' | 'invoice' | 'other'; date: string | null }
export type LastYear = {
  insurer: string | null
  product: string | null
  policyNumber: string | null
  periodFrom: string | null
  periodTo: string | null
  lives: number | null
  categories: LastYearCategory[]
  premiumByCover: Partial<Record<LastYearCover, number>>
  total: number | null
  /** True when premium by cover adds up to the total (within S$1 a cover); null when either is missing. */
  sumMatches: boolean | null
  documents: LastYearDoc[]
  changes: { file: string; date: string | null; what: string }[]
  conflicts: string[]
}

const str = (v: unknown, n = 160): string | null => { const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''; return s ? s.slice(0, n) : null }
/** A money amount from a number or text ("S$1,234.50", "1234"); null for anything else or out of range. */
export const amount = (v: unknown, max = 50_000_000): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^0-9.]/g, '')) : NaN
  return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n * 100) / 100 : null
}
const iso = (v: unknown): string | null => { const s = str(v, 20); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null }
const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[]): T | null => allowed.includes(v as T) ? v as T : null

function facts(raw: Record<string, unknown> | null | undefined): CategoryFacts {
  const r = raw ?? {}
  const lifeRaw = (r.life ?? null) as { kind?: unknown; n?: unknown } | null
  const lifeKind = oneOf(lifeRaw?.kind, ['multiple', 'sum'] as const)
  const lifeN = amount(lifeRaw?.n)
  return {
    hospital: oneOf(r.hospital, ['private', 'government'] as const),
    beds: oneOf(Number(r.beds), [1, 2, 4] as const),
    limitKind: oneOf(r.limitKind, ['per_disability', 'annual'] as const),
    limit: amount(r.limit, 5_000_000),
    coins: oneOf(Number(r.coins ?? NaN), [0, 20, 25] as const),
    gmm: amount(r.gmm, 5_000_000),
    gpCopay: r.gpCopay === 0 || r.gpCopay === '0' ? 0 : amount(r.gpCopay, 500),
    spLimit: amount(r.spLimit, 1_000_000),
    dentalLimit: amount(r.dentalLimit, 100_000),
    life: lifeKind && lifeN ? { kind: lifeKind, n: lifeKind === 'multiple' && lifeN > 60 ? 0 : lifeN } : null,
    pa: amount(r.pa, 10_000_000),
  }
}

/** Bounds and parses the model's read. Pure. */
export function normaliseLastYear(raw: unknown): LastYear {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const premiumByCover: Partial<Record<LastYearCover, number>> = {}
  const pbc = (r.premiumByCover ?? {}) as Record<string, unknown>
  for (const c of LAST_YEAR_COVERS) { const v = amount(pbc[c]); if (v != null) premiumByCover[c] = v }
  const total = amount(r.total)
  const parts = Object.values(premiumByCover)
  const sumMatches = total != null && parts.length ? Math.abs(parts.reduce((a, b) => a + b, 0) - total) <= Math.max(1, parts.length) : null
  const categories: LastYearCategory[] = (Array.isArray(r.categories) ? r.categories : []).slice(0, 20).map((c: Record<string, unknown>) => {
    const plans: Partial<Record<LastYearCover, string>> = {}
    const pr = (c?.plans ?? {}) as Record<string, unknown>
    for (const k of LAST_YEAR_COVERS) { const v = str(pr[k], 80); if (v) plans[k] = v }
    return { name: str(c?.name, 80) ?? 'All employees', lives: amount(c?.lives, 100_000), plans, facts: facts(c?.facts as Record<string, unknown>) }
  })
  const kinds = ['schedule', 'endorsement', 'debit_note', 'invoice', 'other'] as const
  return {
    insurer: str(r.insurer, 80), product: str(r.product, 80), policyNumber: str(r.policyNumber, 60),
    periodFrom: iso(r.periodFrom), periodTo: iso(r.periodTo), lives: amount(r.lives, 100_000),
    categories, premiumByCover, total, sumMatches,
    documents: (Array.isArray(r.documents) ? r.documents : []).slice(0, 30).map((d: Record<string, unknown>) => ({ file: str(d?.file, 160) ?? 'Document', kind: oneOf(d?.kind, kinds) ?? 'other', date: iso(d?.date) })),
    changes: (Array.isArray(r.changes) ? r.changes : []).slice(0, 30).map((d: Record<string, unknown>) => ({ file: str(d?.file, 160) ?? 'Endorsement', date: iso(d?.date), what: str(d?.what, 240) ?? '' })).filter(c => c.what),
    conflicts: (Array.isArray(r.conflicts) ? r.conflicts : []).map(x => str(x, 240)).filter((x): x is string => !!x).slice(0, 20),
  }
}

/** The plan number in a label: "Plan 3 · Private 1-bed · 0%" → "3", "GHS 2A" → "2a", "3" → "3". */
export const planKey = (s: string | null | undefined): string | null => {
  const m = String(s ?? '').match(/(?:plan|ghs|gtl|gmm|emm|gp|sp|gd|dental)?\s*([0-9]+[a-z]?)\b/i)
  return m ? m[1].toLowerCase() : null
}

const COVER_OF: Record<ScheduleCover, LastYearCover> = { GHS: 'GHS', EMM: 'EMM', GOPC: 'GOPC', GOSC: 'GOSC', GD: 'GD', GTL: 'GTL' }

/**
 * What each census plan value means, from last year's policy: a census value "3" under GHS takes the
 * facts of the category whose hospital plan is Plan 3. A census with no plan columns (ALL) and one
 * category takes that category. Values with no match are left out, so the broker sets them. Pure.
 */
export function scheduleFromLastYear(ly: LastYear, values: Record<ScheduleCover, { value: string }[]>): Partial<Schedule> {
  const out: Partial<Schedule> = {}
  const byPlan = (cover: LastYearCover, v: string): LastYearCategory | null => {
    if (v === ALL) return ly.categories.length === 1 ? ly.categories[0] : null
    const k = planKey(planValue(v))
    // The cover's own plan first; a category that does not name it is matched on its hospital plan.
    const hits = ly.categories.filter(c => planKey(c.plans[cover]) === k)
    if (!hits.length) hits.push(...ly.categories.filter(c => !c.plans[cover] && (planKey(c.plans.GHS) === k || planKey(c.name) === k)))
    return hits.length ? hits[0] : null
  }
  for (const sc of Object.keys(COVER_OF) as ScheduleCover[]) {
    const cover = COVER_OF[sc]
    for (const { value } of values[sc] ?? []) {
      const c = byPlan(cover, value)
      if (!c) continue
      const f = c.facts
      if (sc === 'GHS') {
        if (!f.hospital || !f.beds || !f.limitKind || !f.limit) continue
        const h: HospitalFacts = { hospital: f.hospital, beds: f.beds, limitKind: f.limitKind, limit: f.limit, coins: f.coins ?? 0 }
        out.GHS = { ...(out.GHS ?? {}), [value]: h }
      } else if (sc === 'EMM') out.EMM = { ...(out.EMM ?? {}), [value]: f.gmm }
      else if (sc === 'GOPC') { if (f.gpCopay != null) out.GOPC = { ...(out.GOPC ?? {}), [value]: f.gpCopay } }
      else if (sc === 'GOSC') { if (f.spLimit != null) out.GOSC = { ...(out.GOSC ?? {}), [value]: f.spLimit } }
      else if (sc === 'GD') { if (f.dentalLimit != null) out.GD = { ...(out.GD ?? {}), [value]: f.dentalLimit } }
      else if (sc === 'GTL') { if (f.life) out.GTL = { ...(out.GTL ?? {}), [value]: f.life } }
    }
  }
  return out
}

export const LAST_YEAR_PROMPT = `You read a Singapore employee benefits policy from the client's own documents: a policy schedule, endorsements, a debit note or invoice. Read every page, scans included.

Return ONLY a JSON object, no prose:
{
  "insurer": "QBE Insurance (Singapore)" | null,
  "product": "Steadfast MCare+" | null,
  "policyNumber": string | null,
  "periodFrom": "YYYY-MM-DD" | null, "periodTo": "YYYY-MM-DD" | null,
  "lives": number | null,
  "categories": [ {
    "name": "Management" | "Staff" | "All employees" | the document's own category name,
    "lives": number | null,
    "plans": { "GHS": "Plan 3 · Private 1-bed · 0%", "EMM": ..., "GOPC": ..., "GOSC": ..., "GD": ..., "GTL": ..., "GCI": ..., "GPA": ... },
    "facts": {
      "hospital": "private" | "government" | null, "beds": 1 | 2 | 4 | null,
      "limitKind": "per_disability" | "annual" | null, "limit": number | null,
      "coins": 0 | 20 | 25 | null,
      "gmm": number | null, "gpCopay": number | null, "spLimit": number | null, "dentalLimit": number | null,
      "life": { "kind": "multiple" | "sum", "n": number } | null,
      "pa": number | null
    }
  } ],
  "premiumByCover": { "GHS": number, "EMM": number, "GOPC": number, "GOSC": number, "GD": number, "GTL": number, "GCI": number, "GPA": number },
  "total": number | null,
  "documents": [ { "file": "file name", "kind": "schedule" | "endorsement" | "debit_note" | "invoice" | "other", "date": "YYYY-MM-DD" | null } ],
  "changes": [ { "file": "Endorsement 2.pdf", "date": "YYYY-MM-DD", "what": "Staff dental Plan 3 to Plan 2" } ],
  "conflicts": [ "Specialist limit: schedule S$1,500, Endorsement 2 S$2,000; newest used" ]
}

Rules:
- Covers: GHS hospital and surgical, EMM major medical, GOPC outpatient GP, GOSC outpatient specialist, GD dental, GTL term life, GCI critical illness, GPA personal accident. Leave a cover out when the policy does not have it.
- Plan names exactly as the insurer writes them.
- "limit" is the hospital and surgical overall limit: per disability or an annual policy limit, as the schedule states. "beds" is the ward entitlement. "coins" is the co-insurance percent on hospital bills.
- "gpCopay" in S$ per visit (0 for none). "spLimit" and "dentalLimit" are annual limits in S$.
- Life cover: a multiple of monthly salary as {"kind":"multiple","n":24}; a fixed sum as {"kind":"sum","n":100000}.
- Premiums: the annual premium for the policy period, in S$, net of GST when the document shows both. Copy figures exactly; never compute or estimate one. null when not stated.
- Endorsements: apply them in date order; the newest wins for each value it changes. List each change in "changes"; list any disagreement between documents in "conflicts".
- If a value is not on the documents, use null. Do not guess.`

/** Reads the documents with one model call. Server only. Null text from the model is an error, never an empty read. */
export async function readLastYear(files: { name: string; mime: string; bytes: Buffer }[]): Promise<{ read: LastYear } | { error: string }> {
  const { callGemini } = await import('@/lib/ai-call')
  const { GEMINI_DEEP } = await import('@/lib/gemini-models')
  const { parseJsonLoose } = await import('@/lib/crm/ai')
  const parts = files.flatMap(f => [{ text: `File: ${f.name}` }, { inline_data: { mime_type: f.mime, data: f.bytes.toString('base64') } }])
  const { text, error } = await callGemini({
    agent: 'group_benefit', feature: 'gb_last_year_read', model: GEMINI_DEEP, system: LAST_YEAR_PROMPT,
    parts: [...parts, { text: 'Read these documents and return the JSON.' }], maxOutputTokens: 16_000, thinkingShare: 0.3, temperature: 0,
  })
  if (!text) return { error: error ?? 'The documents could not be read.' }
  const raw = parseJsonLoose<unknown>(text)
  if (!raw) return { error: 'The read did not come back in the expected shape. Try again.' }
  return { read: normaliseLastYear(raw) }
}
