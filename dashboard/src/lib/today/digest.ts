/**
 * The to-do digest: one email per person, from operations@, listing their Today items with a link
 * to each. 08:30 SGT on working days lists everything; 14:00 lists only what arrived since the
 * morning, and sends nothing when nothing did. buildDigest is pure (digest.test.ts).
 */
import { sendGmailNotification } from '@/lib/gmail-send'
import { sbTry } from '@/lib/crm/db'
import { isWorkingDay } from '@/lib/admin/b/dates'
import { OPERATIONS_MAILBOX } from '@/lib/mail/visibility'
import { loadToday, type TodayItem } from './data'
import { todoSections, TODO_SECTIONS, type TodoSection } from './todo'

const MAX_LINES = 12
/** Items older than this with no deadline in sight are counted, not listed: the morning email is for what moves. */
const LIVE_DAYS = 14
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
const day = (iso: string | null) => iso ? new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : null

export type Digest = { to: string; subject: string; html: string; count: number }

/** 00:30 UTC = 08:30 SGT of the day `now` falls in (Singapore). */
export function morningCutoff(now: Date): Date {
  const sgt = new Date(now.getTime() + 8 * 3600_000)
  return new Date(Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth(), sgt.getUTCDate(), 0, 30))
}

/**
 * One person's digest, or null when they have nothing. `afternoon` keeps only the items that moved
 * since the morning cutoff. Unowned items are counted, not listed: they belong to whoever picks them up.
 */
export function buildDigest(items: readonly TodayItem[], owner: string, origin: string, now: Date, afternoon = false): Digest | null {
  const since = afternoon ? morningCutoff(now).toISOString() : null
  const liveFrom = new Date(now.getTime() - LIVE_DAYS * 86_400_000).toISOString()
  const dueBy = new Date(now.getTime() + LIVE_DAYS * 86_400_000).toISOString().slice(0, 10)
  const isLive = (i: TodayItem) => (i.last_activity_at ?? '') >= liveFrom || (!!i.deadline && i.deadline <= dueBy) || i.pending.level === 'red'
  const owned = items.filter(i => i.owner_email?.toLowerCase() === owner.toLowerCase() && i.group !== 'read' && i.group !== 'later')
  const mine = owned.filter(i => (!since || (i.last_activity_at ?? '') >= since) && isLive(i))
  const older = afternoon ? 0 : owned.length - mine.length
  const sections = todoSections(mine, 'all', owner)
  const count = sections.send.length + sections.act.length + sections.decide.length
  if (count === 0) return null
  const unowned = items.filter(i => !i.owner_email && i.group !== 'read' && (!since || (i.last_activity_at ?? '') >= since)).length
  const date = now.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }).replace(',', '')
  const line = (i: TodayItem) => {
    const due = i.deadline ? ` · due ${day(i.deadline)}` : ''
    const why = i.pending.level === 'red' || i.pending.level === 'amber' ? ` · ${esc(i.pending.reason.toLowerCase())}` : ''
    return `<li style="margin:0 0 6px"><a href="${origin}/today/${i.id}" style="color:#0f1412">${esc(i.client)} — ${esc(i.title)}</a><span style="color:#6f7a74">${due}${why}</span></li>`
  }
  const block = (key: Exclude<TodoSection, 'read'>) => {
    const rows = sections[key]
    if (!rows.length) return ''
    const label = TODO_SECTIONS.find(s => s.key === key)!.label
    const more = rows.length > MAX_LINES ? `<li style="color:#6f7a74">${rows.length - MAX_LINES} more on Today</li>` : ''
    return `<h3 style="margin:18px 0 8px;font-size:14px">${label} · ${rows.length}</h3><ul style="margin:0;padding-left:18px">${rows.slice(0, MAX_LINES).map(line).join('')}${more}</ul>`
  }
  const subject = afternoon ? `New since this morning · ${count} item${count === 1 ? '' : 's'} · ${date}` : `To do · ${count} item${count === 1 ? '' : 's'} · ${date}`
  const html = [
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#0f1412;max-width:640px">`,
    `<p style="margin:0 0 4px;font-size:16px;font-weight:600">${esc(subject)}</p>`,
    `<p style="margin:0;color:#6f7a74">Send, Edit, Ask AI and Later are on the <a href="${origin}/" style="color:#0f1412">home page</a>.</p>`,
    block('send'), block('decide'), block('act'),
    unowned ? `<p style="margin:18px 0 0;color:#6f7a74">${unowned} unassigned item${unowned === 1 ? '' : 's'} on <a href="${origin}/today" style="color:#0f1412">Today</a>.</p>` : '',
    older > 0 ? `<p style="margin:8px 0 0;color:#6f7a74">${older} older item${older === 1 ? '' : 's'} with no deadline in the next ${LIVE_DAYS} days, on <a href="${origin}/today" style="color:#0f1412">Today</a>.</p>` : '',
    `</div>`,
  ].join('')
  return { to: owner, subject, html, count }
}

export type DigestRun = { sent: { to: string; count: number }[]; skipped: string[]; dry?: boolean }

export async function sendTodoDigests(opts: { afternoon?: boolean; dry?: boolean; now?: Date } = {}): Promise<DigestRun> {
  const now = opts.now ?? new Date()
  const out: DigestRun = { sent: [], skipped: [], dry: opts.dry }
  if (!isWorkingDay(new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10))) { out.skipped.push('not a working day'); return out }
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const items = await loadToday(now)
  const staff = new Set((await sbTry<{ email: string }[]>('app_users?active=is.true&select=email', [])).map(r => r.email.toLowerCase()))
  const owners = Array.from(new Set(items.map(i => i.owner_email?.toLowerCase()).filter((e): e is string => !!e)))
  for (const owner of owners) {
    if (!staff.has(owner)) { out.skipped.push(`${owner}: not an active user`); continue }
    const d = buildDigest(items, owner, origin, now, opts.afternoon)
    if (!d) { out.skipped.push(`${owner}: nothing${opts.afternoon ? ' new' : ''}`); continue }
    if (!opts.dry) await sendGmailNotification({ from: OPERATIONS_MAILBOX, to: d.to, subject: d.subject, htmlBody: d.html })
    out.sent.push({ to: d.to, count: d.count })
  }
  return out
}
