/**
 * Says when Gmail has stopped reaching the dashboard: a push subscription within a day of lapsing,
 * or a mailbox with no email in 24 hours on a working day. Written to error_logs (feature
 * gmail_watch), where the dashboard shows it. Called by the hourly admin sweep. The browser used to
 * cover this by re-reading Gmail every 90 seconds; this is the check that replaced it.
 */
import { listMailboxes, type Mailbox } from './mailboxes'
import { logError } from '@/lib/error-log'
import { isWorkingDay } from '@/lib/admin/b/dates'

const HOUR = 3_600_000

/** Pure. The problems with one mailbox at `now`, in words; empty when it is fine. */
export function mailboxProblems(m: Pick<Mailbox, 'email' | 'status' | 'watch_expiration' | 'last_ingest_at'>, now: Date): string[] {
  if (m.status !== 'active') return []
  const out: string[] = []
  const exp = m.watch_expiration ? Date.parse(m.watch_expiration) : NaN
  if (Number.isNaN(exp)) out.push(`${m.email}: no Gmail push subscription on record`)
  else if (exp < now.getTime()) out.push(`${m.email}: Gmail push subscription lapsed ${m.watch_expiration}`)
  else if (exp - now.getTime() < 24 * HOUR) out.push(`${m.email}: Gmail push subscription lapses within a day (${m.watch_expiration})`)
  const singapore = new Date(now.getTime() + 8 * HOUR)
  const workingHours = isWorkingDay(singapore.toISOString()) && singapore.getUTCHours() >= 12
  const last = m.last_ingest_at ? Date.parse(m.last_ingest_at) : NaN
  if (workingHours && (Number.isNaN(last) || now.getTime() - last > 24 * HOUR)) out.push(`${m.email}: no email received in 24 hours`)
  return out
}

export async function checkMailboxes(now = new Date()): Promise<string[]> {
  const boxes = await listMailboxes().catch(() => [] as Mailbox[])
  const problems = boxes.flatMap(m => mailboxProblems(m, now))
  for (const message of problems) void logError({ source: 'gmail', feature: 'gmail_watch', message, metadata: { checked_at: now.toISOString() } })
  return problems
}
