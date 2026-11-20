/**
 * The Inbox list as pages (20 Nov 2026). The server holds one row per thread (inbox-index.ts):
 * when it last moved, its filing, its owner, its mailboxes and who wrote last. This file decides,
 * without reading anything, which rows a view holds, the counts per view and one page of ids.
 * Visibility is decided before these run (src/lib/mail/visibility.ts); a page never holds a
 * thread the viewer may not see. Pure. Tested in src/__tests__/inbox-list.test.ts.
 */
import { inMailbox, type MailboxFilter } from './visibility'
import { PERSONAL_DOMAINS } from '@/components/engagement/types'

export const INBOX_VIEWS = ['all', 'needs_reply', 'awaiting_client', 'unlinked', 'unassigned'] as const
export type InboxView = typeof INBOX_VIEWS[number]
export type InboxCounts = Record<InboxView, number>

/** Rows per page: the list loads 100, then 100 more on scroll or More. */
export const PAGE_SIZE = 100

export type IndexRow = {
  id: string
  /** last_message_at, ISO. The list is newest first. */
  at: string
  companyId: string | null
  owner: string | null
  mailboxes: string[]
  /** Who wrote the last real message (auto-replies and TRS-only forwards skipped). */
  last: 'inbound' | 'outbound' | null
}

export const parseView = (v: string | null | undefined): InboxView =>
  (INBOX_VIEWS as readonly string[]).includes(String(v)) ? v as InboxView : 'all'

export function inView(r: IndexRow, view: InboxView): boolean {
  switch (view) {
    case 'all':             return true
    case 'needs_reply':     return r.last === 'inbound'
    case 'awaiting_client': return r.last === 'outbound'
    case 'unlinked':        return !r.companyId
    case 'unassigned':      return !!r.companyId && !r.owner
  }
}

export function countViews(rows: readonly IndexRow[]): InboxCounts {
  const out = Object.fromEntries(INBOX_VIEWS.map(v => [v, 0])) as InboxCounts
  for (const r of rows) for (const v of INBOX_VIEWS) if (inView(r, v)) out[v]++
  return out
}

export const newestFirst = (a: IndexRow, b: IndexRow) => String(b.at).localeCompare(String(a.at))

/**
 * One page. `rows` are the viewer's visible threads; `matched` (when a search ran) the ids it
 * found. Counts follow the mailbox pill and the search; the total is the view's.
 */
export function inboxPage(rows: readonly IndexRow[], opts: { view: InboxView; mailbox: MailboxFilter; matched?: ReadonlySet<string> | null; offset: number; limit?: number }) {
  const limit = Math.max(1, Math.min(PAGE_SIZE, opts.limit ?? PAGE_SIZE))
  const offset = Math.max(0, Math.floor(opts.offset) || 0)
  const scoped = rows
    .filter(r => !opts.matched || opts.matched.has(r.id))
    .filter(r => inMailbox(opts.mailbox, r.mailboxes))
    .sort(newestFirst)
  const counts = countViews(scoped)
  const inThisView = scoped.filter(r => inView(r, opts.view))
  const ids = inThisView.slice(offset, offset + limit).map(r => r.id)
  const next = offset + limit
  return { ids, total: inThisView.length, counts, nextOffset: next < inThisView.length ? next : null }
}

const AUTOMATED = /^(no-?reply|do[-_]?not[-_]?reply|mailer-daemon|postmaster|notifications?)\b/i

/** The domain most of the thread's outside addresses share; null when none qualifies. */
export function outsideDomain(emails: readonly string[]): string | null {
  const tally = new Map<string, number>()
  for (const raw of emails) {
    const e = String(raw ?? '').trim().toLowerCase()
    const [local, domain] = e.split('@')
    if (!local || !domain || !domain.includes('.')) continue
    if (domain === 'trade-risksol.com' || PERSONAL_DOMAINS.has(domain) || AUTOMATED.test(local)) continue
    tally.set(domain, (tally.get(domain) ?? 0) + 1)
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
}
