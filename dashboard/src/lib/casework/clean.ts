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

export type Party = 'client' | 'insurer'
export type CaseDraft = { reply_in_thread: string; to: string[]; cc: string[]; subject: string; body: string; attach: string[]; party?: Party }
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
  /** The other party's email on the same matter (insurer chase + client update): sent together. */
  pair_draft: CaseDraft | null
  pair_withheld: string | null
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

/** One proposed draft checked against the case. A draft that fails any rule is withheld, never repaired. */
export function checkDraft(raw: unknown, threads: string[], ctx: CaseContext, known: Set<string>): { draft: CaseDraft | null; withheld: string | null } {
  const d = raw as Record<string, unknown> | null | undefined
  if (!d || typeof d !== 'object') return { draft: null, withheld: null }
  const to = (Array.isArray(d.to) ? d.to : []).map(email).filter((x): x is string => !!x)
  const cc = (Array.isArray(d.cc) ? d.cc : []).map(email).filter((x): x is string => !!x)
  const body = str(d.body, 6000)
  const thread = typeof d.reply_in_thread === 'string' && threads.includes(d.reply_in_thread) ? d.reply_in_thread : null
  const strangers = [...to, ...cc].filter(a => !known.has(a))
  const attach = (Array.isArray(d.attach) ? d.attach : []).filter((f): f is string => typeof f === 'string')
  const missing = attach.filter(f => !ctx.attachments.includes(f))
  if (!thread) return { draft: null, withheld: 'it does not reply on one of the case threads' }
  if (to.length === 0) return { draft: null, withheld: 'it has no recipient' }
  if (!body) return { draft: null, withheld: 'it has no body' }
  if (strangers.length) return { draft: null, withheld: `${strangers.join(', ')} ${strangers.length === 1 ? 'is' : 'are'} not on the case` }
  if (missing.length) return { draft: null, withheld: `the case holds no file named ${missing.join(', ')}` }
  if (signedByLeaver(body, ctx.departedNames ?? [])) return { draft: null, withheld: 'it is signed by someone who has left' }
  const party = d.party === 'client' || d.party === 'insurer' ? d.party : null
  return { draft: { reply_in_thread: thread, to, cc: cc.filter(a => !to.includes(a)), subject: str(d.subject, 200) ?? '', body, attach, ...(party ? { party } : {}) }, withheld: null }
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
  let pair: CaseDraft | null = null
  let pairWithheld: string | null = null
  if (status !== 'done') {
    const main = checkDraft(r.draft, threads, ctx, known)
    draft = main.draft; withheld = main.withheld
    if (draft && r.pair_draft) {
      const p = checkDraft(r.pair_draft, threads, ctx, known)
      if (!p.draft) pairWithheld = p.withheld
      else if (!draft.party || !p.draft.party || draft.party === p.draft.party) pairWithheld = 'a pair needs one client and one insurer email'
      else pair = p.draft
    }
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
    pair_draft: pair,
    pair_withheld: pairWithheld,
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

/** Words that carry a matter's identity: no reply/forward/reminder prefixes, refs or stop words. */
export function titleTokens(title: string): Set<string> {
  const t = title.toLowerCase().replace(/^(\s*(re|fw|fwd|aw|wg|\d+(st|nd|rd|th)?\s*reminder|reminder|urgent|final notice)\s*[:\-–]\s*)+/i, '')
  const stop = new Set(['the', 'and', 'for', 'of', 'to', 'in', 'on', 'at', 'a', 'an', 'with', 'from', 'by', 'pte', 'ltd', 'llp', 'inc', 'co', 'claim', 'policy', 'insurance', 'renewal', 'quotation', 'quote', 'request', 'pending', 'further', 'action', 'update', 'status'])
  return new Set(t.split(/[^a-z0-9]+/).filter(w => w.length > 2 && !stop.has(w)))
}

/**
 * The open item a new case duplicates, if any: one sharing a thread, the policy number, or
 * most of its title words. Pure; null when the case is new.
 */
export function twinOf(c: Pick<CleanCase, 'title' | 'policy_number' | 'threads'>, open: { id: string; title: string; policy_number: string | null; threads: string[] }[]): string | null {
  const threads = new Set(c.threads)
  const byThread = open.find(o => o.threads.some(t => threads.has(t)))
  if (byThread) return byThread.id
  const pn = (c.policy_number ?? '').replace(/\s+/g, '').toLowerCase()
  if (pn.length >= 6) { const byPolicy = open.find(o => (o.policy_number ?? '').replace(/\s+/g, '').toLowerCase() === pn); if (byPolicy) return byPolicy.id }
  const mine = titleTokens(c.title)
  if (mine.size < 3) return null
  let best: { id: string; score: number } | null = null
  for (const o of open) {
    const theirs = titleTokens(o.title)
    if (theirs.size < 3) continue
    let shared = 0; for (const w of mine) if (theirs.has(w)) shared++
    const score = shared / Math.min(mine.size, theirs.size)
    if (score >= 0.75 && (!best || score > best.score)) best = { id: o.id, score }
  }
  return best?.id ?? null
}
