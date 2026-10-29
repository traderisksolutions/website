/**
 * Nexus follow-ups: the pure rules. No I/O here, so every rule is tested in isolation.
 *
 *   - Due dates when the email states none (the house rule): a client waiting on TRS gets an
 *     answer within 1 working day; TRS waiting on an insurer or a client chases after 3.
 *   - Working days are Singapore working days: Saturday and Sunday are skipped. Public holidays
 *     are not modelled yet.
 *   - A due date is the end of the Singapore working day (18:00 SGT).
 *   - dedupe keys, one shape per source, so every sync can run again without opening a second row.
 */

export type OwnerParty = 'trs' | 'insurer' | 'client' | 'date'
export type FollowUpStatus = 'open' | 'done' | 'snoozed' | 'dismissed'
export type SourceKind = 'email' | 'rfq' | 'renewal' | 'debit_note' | 'claim'
export type View = 'overdue' | 'week' | 'waiting' | 'done'

export const OWNER_PARTIES: OwnerParty[] = ['trs', 'insurer', 'client', 'date']
export const VIEWS: View[] = ['overdue', 'week', 'waiting', 'done']

const SGT_MS = 8 * 3_600_000
const DAY_MS = 86_400_000
/** The hour (SGT) a due date falls at: close of the working day. */
export const DUE_HOUR_SGT = 18

/** The SGT calendar date of an instant, as YYYY-MM-DD. */
export function sgtDate(d: Date): string {
  return new Date(d.getTime() + SGT_MS).toISOString().slice(0, 10)
}

/** 18:00 SGT on a YYYY-MM-DD date, as an ISO instant. */
export function dueAtFromDate(isoDate: string): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) - SGT_MS + DUE_HOUR_SGT * 3_600_000).toISOString()
}

const isWeekend = (isoDate: string) => {
  const dow = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  return dow === 0 || dow === 6
}

const plusDays = (isoDate: string, n: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

/**
 * The SGT date `n` Singapore working days after the instant `from`: each step moves to the next
 * weekday. Friday + 1 = Monday; Saturday + 1 = Monday; Monday + 3 = Thursday.
 */
export function addWorkingDays(from: Date, n: number): string {
  let d = sgtDate(from)
  let left = Math.max(0, Math.floor(n))
  while (left > 0) {
    d = plusDays(d, 1)
    if (!isWeekend(d)) left--
  }
  // n = 0 on a weekend rolls to Monday.
  while (isWeekend(d)) d = plusDays(d, 1)
  return d
}

/**
 * The house rule, in working days, by who owes:
 *   trs (a client or insurer waiting on us) → 1
 *   insurer (we wait on an insurer)        → 3
 *   client  (we wait on a client)          → 3
 * 'date' rows always carry their own date.
 */
export const HOUSE_DAYS: Record<Exclude<OwnerParty, 'date'>, number> = { trs: 1, insurer: 3, client: 3 }

/** Due instant: the stated date when there is one and it is not before the message, else the house rule. */
export function dueFor(owner: OwnerParty, since: Date, statedDate: string | null): string | null {
  if (statedDate && /^\d{4}-\d{2}-\d{2}$/.test(statedDate) && !Number.isNaN(Date.parse(statedDate)) && statedDate >= sgtDate(since)) {
    return dueAtFromDate(statedDate)
  }
  if (owner === 'date') return null
  return dueAtFromDate(addWorkingDays(since, HOUSE_DAYS[owner]))
}

// ── dedupe keys ──────────────────────────────────────────────────────────────────────────────

/** One key per thing owed. Email rows are keyed by message and position in the reader's answer:
 *  a message is read once (follow_up_reads), so the position is stable. */
export const dedupeKey = {
  email:     (messageId: string, index: number) => `email:${messageId}:${index}`,
  rfq:       (dispatchId: string) => `rfq:${dispatchId}`,
  renewal:   (policyId: string, endDate: string) => `renewal:${policyId}:${endDate}`,
  debitNote: (debitNoteId: string) => `debit_note:${debitNoteId}`,
}

// ── views ────────────────────────────────────────────────────────────────────────────────────

export type ViewRow = {
  owner_party: OwnerParty
  owner_email: string | null
  status: FollowUpStatus
  due_at: string | null
  snoozed_until: string | null
  closed_at: string | null
}

/** Open, or snoozed with the snooze over. */
export function isLive(r: Pick<ViewRow, 'status' | 'snoozed_until'>, now: Date): boolean {
  if (r.status === 'open') return true
  return r.status === 'snoozed' && !!r.snoozed_until && Date.parse(r.snoozed_until) <= now.getTime()
}

/**
 * Which views a row belongs to. A row can sit in more than one (an overdue insurer row is both
 * overdue and waiting on others).
 *   overdue — live and due before now
 *   week    — live and due within the next 7 days
 *   waiting — live and owed by an insurer or a client
 *   done    — closed as done in the last 7 days
 */
export function viewsOf(r: ViewRow, now: Date): View[] {
  const out: View[] = []
  const t = now.getTime()
  if (isLive(r, now)) {
    const due = r.due_at ? Date.parse(r.due_at) : null
    if (due != null && due < t) out.push('overdue')
    if (due != null && due >= t && due < t + 7 * DAY_MS) out.push('week')
    if (r.owner_party === 'insurer' || r.owner_party === 'client') out.push('waiting')
  } else if (r.status === 'done' && r.closed_at && Date.parse(r.closed_at) >= t - 7 * DAY_MS) {
    out.push('done')
  }
  return out
}

/** Due-date tone for the register: overdue red, within 2 days amber. */
export function dueTone(dueAt: string | null, now: Date): 'overdue' | 'soon' | null {
  if (!dueAt) return null
  const d = Date.parse(dueAt) - now.getTime()
  if (d < 0) return 'overdue'
  if (d <= 2 * DAY_MS) return 'soon'
  return null
}

/** Overdue rows owed by insurers or clients with an address to write to: the ones "Draft all
 *  chases" acts on. RFQ rows are chased by the placement agent, so they are left out. */
export function chaseable(r: ViewRow & { counterparty_email: string | null; source_kind: SourceKind }, now: Date): boolean {
  return (r.owner_party === 'insurer' || r.owner_party === 'client') && r.source_kind !== 'rfq' && !!r.counterparty_email &&
    viewsOf(r, now).includes('overdue')
}

// ── status chip ──────────────────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`

/**
 * The register's Status chip, by precedence:
 *   Done view → "Done" (green)
 *   due before now → "Overdue · N days" (red; N in SGT calendar days, at least 1)
 *   due today / tomorrow (SGT) → "Due today" / "Due tomorrow" (amber)
 *   owed by an insurer or a client, not yet due → "Waiting" (blue)
 *   otherwise → "Due 4 Nov" (neutral), or "No date"
 */
export function statusOf(r: Pick<ViewRow, 'owner_party' | 'due_at'>, view: View, now: Date): { label: string; tone: 'red' | 'amber' | 'neutral' | 'blue' | 'green' } {
  if (view === 'done') return { label: 'Done', tone: 'green' }
  const others = r.owner_party === 'insurer' || r.owner_party === 'client'
  if (!r.due_at) return others ? { label: 'Waiting', tone: 'blue' } : { label: 'No date', tone: 'neutral' }
  const today = sgtDate(now)
  const dueDay = sgtDate(new Date(r.due_at))
  const dayGap = Math.round((Date.parse(dueDay) - Date.parse(today)) / DAY_MS)
  if (Date.parse(r.due_at) < now.getTime()) {
    const n = Math.max(1, -dayGap)
    return { label: `Overdue · ${n} ${n === 1 ? 'day' : 'days'}`, tone: 'red' }
  }
  if (dayGap === 0) return { label: 'Due today', tone: 'amber' }
  if (dayGap === 1) return { label: 'Due tomorrow', tone: 'amber' }
  if (others) return { label: 'Waiting', tone: 'blue' }
  return { label: `Due ${shortDate(dueDay)}`, tone: 'neutral' }
}
