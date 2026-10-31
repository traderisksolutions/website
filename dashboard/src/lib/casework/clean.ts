/**
 * The case worker's answer, checked against the threads it read. Pure, so every rule is tested.
 *
 * The model proposes; this decides what may be stored. A draft that would go to an address not
 * on the case, attach a file the case does not hold, or rest on a quote that is not in the mail
 * is not stored as ready to send. Facts it cannot prove are dropped, never repaired.
 */

export const CASE_TYPES = ['claim', 'renewal', 'new_quote', 'endorsement', 'member_movement', 'premium_billing', 'documents', 'enquiry', 'other'] as const
export const STATUSES = ['trs_to_act', 'waiting_client', 'waiting_insurer', 'stalled', 'done'] as const
export type CaseType = typeof CASE_TYPES[number]
export type CaseStatus = typeof STATUSES[number]

export type CaseDraft = { reply_in_thread: string; to: string[]; cc: string[]; subject: string; body: string; attach: string[] }
export type CleanCase = {
  /** An open item this case updates; null opens a new item. */
  item_id: string | null
  client: string | null
  case_type: CaseType
  title: string
  threads: string[]
  insurer: string | null
  policy_number: string | null
  status: CaseStatus
  waiting_since: string | null
  last_activity: string | null
  summary: string | null
  next_action: string | null
  deadline: string | null
  deadline_basis: string | null
  draft: CaseDraft | null
  /** Why a proposed draft was not kept, so the queue can say "draft withheld: …". */
  draft_withheld: string | null
  suggested_owner: string | null
  owner_basis: string | null
  needs_human: string | null
  evidence: { thread: string; quote: string }[]
  confidence: 'high' | 'medium' | 'low'
}

/** What the case actually holds: its threads, every address on them, every file, all text. */
export type CaseContext = {
  threadIds: string[]
  addresses: string[]
  attachments: string[]
  /** Every message body on the case, joined; quotes must be found here. */
  text: string
  /** Staff who can own work today. Departed staff are not in this list. */
  staff: string[]
  /** Open work items the model was shown, so it updates them rather than opening duplicates. */
  itemIds?: string[]
  /** First names of staff who have left; a draft may mention them but not be signed by them. */
  departedNames?: string[]
  today: string
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const isoDate = (v: unknown) => typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v)) ? v : null
const str = (v: unknown, max: number) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
const squash = (s: string) => s.toLowerCase().replace(/[\s>*_"“”‘’'`]+/g, ' ').trim()
const email = (v: unknown) => {
  const m = typeof v === 'string' ? v.match(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/) : null
  return m ? m[0].toLowerCase() : null
}

/** A quote is evidence only if it is in the mail, allowing for spacing and quote marks. */
export function quoteFound(quote: string, text: string): boolean {
  const q = squash(quote).replace(/^\.+|\.+$/g, '').replace(/…/g, '...')
  if (q.length < 8) return false
  const hay = squash(text)
  return q.split(/\s*\.\.\.\s*/).filter(p => p.length >= 8).every(p => hay.includes(p))
}

/** The signature is the last two non-empty lines; a leaver named there means the draft speaks as them. */
export function signedByLeaver(body: string, names: string[]): boolean {
  const tail = body.split('\n').map(l => l.trim()).filter(Boolean).slice(-2).join(' ').toLowerCase()
  return names.some(n => n.length >= 3 && new RegExp(`\\b${n.toLowerCase().replace(/[^a-z]/g, '')}\\b`).test(tail))
}

export function parseAnswer(raw: unknown): unknown[] {
  let obj: unknown = raw
  if (typeof raw === 'string') {
    const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    try { obj = JSON.parse(s) } catch { return [] }
  }
  if (Array.isArray(obj)) return obj
  const cases = (obj as { cases?: unknown })?.cases
  return Array.isArray(cases) ? cases : []
}

export function cleanCase(raw: unknown, ctx: CaseContext): CleanCase | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const threads = (Array.isArray(r.threads) ? r.threads : []).filter((t): t is string => typeof t === 'string' && ctx.threadIds.includes(t))
  const title = str(r.title, 140)
  if (!title || threads.length === 0) return null

  const status = (STATUSES as readonly string[]).includes(String(r.status)) ? r.status as CaseStatus : 'trs_to_act'
  const evidence = (Array.isArray(r.evidence) ? r.evidence : [])
    .map(e => ({ thread: String((e as { thread?: unknown })?.thread ?? ''), quote: String((e as { quote?: unknown })?.quote ?? '').slice(0, 300) }))
    .filter(e => ctx.threadIds.includes(e.thread) && quoteFound(e.quote, ctx.text))
    .slice(0, 6)

  let confidence = (['high', 'medium', 'low'] as const).find(c => c === r.confidence) ?? 'low'
  // A status nobody can point to in the mail is a guess.
  if (evidence.length === 0 && confidence !== 'low') confidence = 'low'

  const deadline = isoDate(r.deadline)
  const owner = email(r.suggested_owner)
  const known = new Set(ctx.addresses.map(a => a.toLowerCase()))

  let draft: CaseDraft | null = null
  let withheld: string | null = null
  const d = r.draft as Record<string, unknown> | null | undefined
  if (d && typeof d === 'object' && status !== 'done') {
    const to = (Array.isArray(d.to) ? d.to : []).map(email).filter((x): x is string => !!x)
    const cc = (Array.isArray(d.cc) ? d.cc : []).map(email).filter((x): x is string => !!x)
    const body = str(d.body, 6000)
    const thread = typeof d.reply_in_thread === 'string' && threads.includes(d.reply_in_thread) ? d.reply_in_thread : null
    const strangers = [...to, ...cc].filter(a => !known.has(a))
    const attach = (Array.isArray(d.attach) ? d.attach : []).filter((f): f is string => typeof f === 'string')
    const missing = attach.filter(f => !ctx.attachments.includes(f))
    if (!thread) withheld = 'it does not reply on one of the case threads'
    else if (to.length === 0) withheld = 'it has no recipient'
    else if (!body) withheld = 'it has no body'
    else if (strangers.length) withheld = `${strangers.join(', ')} ${strangers.length === 1 ? 'is' : 'are'} not on the case`
    else if (missing.length) withheld = `the case holds no file named ${missing.join(', ')}`
    else if (signedByLeaver(body, ctx.departedNames ?? [])) withheld = 'it is signed by someone who has left'
    else draft = { reply_in_thread: thread, to, cc: cc.filter(a => !to.includes(a)), subject: str(d.subject, 200) ?? '', body, attach }
  }

  return {
    item_id: typeof r.item_id === 'string' && (ctx.itemIds ?? []).includes(r.item_id) ? r.item_id : null,
    client: str(r.client, 160),
    case_type: (CASE_TYPES as readonly string[]).includes(String(r.case_type)) ? r.case_type as CaseType : 'other',
    title,
    threads,
    insurer: str(r.insurer, 120),
    policy_number: str(r.policy_number, 80),
    status,
    waiting_since: isoDate(r.waiting_since),
    last_activity: isoDate(r.last_activity),
    summary: str(r.summary, 800),
    next_action: status === 'done' ? null : str(r.next_action, 300),
    deadline,
    deadline_basis: deadline ? str(r.deadline_basis, 200) : null,
    draft,
    draft_withheld: withheld,
    suggested_owner: owner && ctx.staff.includes(owner) ? owner : null,
    owner_basis: str(r.owner_basis, 200),
    needs_human: str(r.needs_human, 400),
    evidence,
    confidence,
  }
}

/**
 * Queue order: what TRS must do and is late first, then the rest of TRS's moves by deadline,
 * then stalled chases, then waiting. Done items drop out.
 */
export function queueRank(c: Pick<CleanCase, 'status' | 'deadline' | 'needs_human' | 'waiting_since'>, today: string): number {
  const days = (iso: string | null) => iso ? Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000) : null
  const due = days(c.deadline)
  if (c.status === 'done') return 9_000
  let base = { trs_to_act: 0, stalled: 1_000, waiting_insurer: 3_000, waiting_client: 3_000 }[c.status] ?? 5_000
  if (c.needs_human) base -= 500
  if (due !== null && due < 0) base -= 400
  return base + (due ?? 365)
}
