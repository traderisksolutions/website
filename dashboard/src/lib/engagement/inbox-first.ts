/**
 * The Inbox's first screen, read on the server (src/app/engagement/page.tsx) so the page paints with
 * it and makes no API call for it: the first page of the default view (every thread the viewer may
 * see, 100 newest first, with the counts and the mailbox names), the engaged form leads, the saved
 * drafts, the staff, and the open thread with what the rail shows first (next-actions bar, referral
 * reading, stored summaries, the company's card).
 *
 * Visibility is the routes': the list is inboxConversations (visibleRows, visibleThreadIds,
 * personalMailboxes), the thread is readThread (threadVisibleTo), and the rail's reads run only when
 * threadVisibleTo passes for the viewer, as in /api/threads/[id]/bar and /referral. A colleague's
 * private thread is never the default selection; a deep link to one opens with the 403 message.
 */
import { db, rows } from '@/lib/db/client'
import { inboxConversations, type InboxPageMeta } from '@/lib/mail/inbox-conversations'
import { readThread } from '@/lib/mail/thread-read'
import { threadVisibleTo } from '@/lib/mail/visibility-server'
import { loadBar, type Bar } from '@/lib/chief/bar'
import { threadReferral, type ThreadReferral } from '@/lib/crm/thread-referral'
import type { CompanyCard } from '@/lib/engagement/company-card'
import { listStaff, type StaffMember } from '@/lib/crm/staff'
import { editOptions } from '@/lib/today/data'
import { EMAIL_SOURCES, ENGAGED_STATUSES, type Lead, type StoredSummary, type ThreadState } from '@/components/engagement/types'
import type { DraftRow } from '@/components/engagement/ConversationList'
import { seesAllMail } from '@/lib/mail/visibility'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What the rail shows first for the open thread; a part that failed is absent and the rail reads it itself. */
export type RailFirst = { threadId: string; bar?: Bar; referral?: ThreadReferral; summaries?: StoredSummary[] }

export type InboxFirst = {
  /** The first page of the default view (all, every mailbox, no search). */
  rows: Lead[]
  page: InboxPageMeta
  formLeads: Lead[]
  /** Null when the read failed: the navigator reads them itself. */
  drafts: DraftRow[] | null
  /** Staff names for the Mailbox pill; null when the list has no personal mailbox. */
  staffNames: Record<string, string> | null
  team: { me: string | null; staff: StaffMember[] }
  selectedId: string | null
  /** The deep link (?lead= or ?thread=) matched a row: the page opens on the thread on a phone. */
  deepLinked: boolean
  thread: ThreadState | null
  rail: RailFirst | null
  cards: Record<string, CompanyCard>
}

const soft = <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback)
const optional = <T,>(p: Promise<T>): Promise<T | undefined> => p.catch(() => undefined)

/** Engaged inbound leads, as the page filtered /api/leads: the newest 200, email sources at Contacted or beyond. */
async function engagedFormLeads(): Promise<Lead[]> {
  const list = await rows('Inbox form leads', db().from('inbound_leads').select('*').order('created_at', { ascending: false }).limit(200))
  return list.filter(l => EMAIL_SOURCES.has(l.source) && ENGAGED_STATUSES.has(l.status ?? ''))
    .map(l => ({ ...l, created_at: l.created_at ?? '', status: l.status ?? '' }) as Lead)
}

/** Saved new-email drafts, newest first, as GET /api/engagement/drafts. */
async function newEmailDrafts(): Promise<DraftRow[]> {
  const list = await rows('Inbox drafts', db().from('ai_drafts').select('id,to_email,cc,subject,body,attachments,created_at')
    .eq('status', 'draft').order('created_at', { ascending: false }).limit(100))
  return list.map(d => ({ ...d, cc: d.cc as DraftRow['cc'], attachments: (d.attachments ?? null) as DraftRow['attachments'] }))
}

/** Stored summaries of a thread, newest first, as GET /api/engagement/thread-summaries. */
async function summariesOf(threadId: string): Promise<StoredSummary[]> {
  const list = await rows('Thread summaries', db().from('thread_summaries').select('id,summary,next_action,draft_reply,created_at')
    .eq('thread_id', threadId).order('created_at', { ascending: false }))
  return list.map(s => ({ ...s, created_at: s.created_at ?? '' }))
}

/** The open thread for the reading pane: the messages, or the 403 message for a colleague's private thread. */
async function threadState(threadId: string | null, email: string | null, viewer: string | null): Promise<ThreadState> {
  try {
    const read = await readThread(threadId, email, viewer)
    if (read.private) return { loading: false, thread: null, messages: [], error: read.private.error ?? 'This email lives in a colleague’s inbox.' }
    return { loading: false, thread: (read.thread ?? null) as ThreadState['thread'], messages: read.messages as ThreadState['messages'], error: null }
  } catch {
    // The page shows no thread rather than an error, as fetchThread did on a failed answer.
    return { loading: false, thread: null, messages: [], error: null }
  }
}

/** What the rail reads first, only for a thread the viewer may see. */
async function railFirst(threadId: string, viewer: string | null): Promise<RailFirst | null> {
  if (!(await soft(threadVisibleTo(threadId, viewer), false))) return null
  const [bar, referral, summaries] = await Promise.all([
    optional(loadBar(threadId)), optional(threadReferral(threadId)), optional(summariesOf(threadId)),
  ])
  return { threadId, bar: bar ?? undefined, referral, summaries }
}

export async function inboxFirst(viewer: string | null, link: string | null): Promise<InboxFirst> {
  const include = link?.trim() || null
  // A deep link to a thread: its reads start with the list's.
  const linkedThread = include && UUID.test(include)
    ? { id: include, state: threadState(include, null, viewer), rail: soft(railFirst(include, viewer), null) }
    : null
  // The default pill: Operations, or every mailbox for the developer account (Jarod, 20 Nov 2026).
  const sp = new URLSearchParams({ paged: '1', offset: '0', view: 'all', mailbox: seesAllMail(viewer) ? 'all' : 'operations' })
  if (include) sp.set('include', include)
  // List first (21 Nov 2026): the first screen carries the list, counts and mailbox names; the
  // selected thread, its rail and company cards load in the browser a moment later, so the list
  // no longer waits for them. A deep link's thread was started alongside the list and comes with it.
  const [list, formLeads, drafts, staff, staffNames] = await Promise.all([
    inboxConversations(sp, viewer),
    soft(engagedFormLeads(), []),
    soft(newEmailDrafts(), null),
    soft(listStaff(), []),
    // The Mailbox pill names the personal mailboxes the developer account sees.
    seesAllMail(viewer)
      ? soft(editOptions({}).then(o => Object.fromEntries(o.staff.map(s => [s.email.toLowerCase(), s.name]))), null)
      : Promise.resolve(null),
  ])
  const page = list.page!
  const threads = list.rows.map(r => ({ ...r, source: 'thread' as const }))

  // The selection, as the page made it: the deep-linked row, else the newest one the viewer may open.
  const all = [...formLeads, ...threads]
  const linked = include ? all.find(l => l.id === include || l.thread_id === include) : undefined
  const newest = [...all].filter(l => !l.private).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  const selectedId = linked?.id ?? newest?.id ?? null
  const lead = linked ?? null
  const tid = lead?.thread_id ?? null
  const reuse = linkedThread && tid === linkedThread.id ? linkedThread : null
  const [thread, rail] = reuse ? await Promise.all([reuse.state, reuse.rail]) : [null, null]
  const cardList: (readonly [string, CompanyCard] | null)[] = []
  return {
    rows: threads, page, formLeads, drafts, staffNames, team: { me: viewer, staff },
    selectedId, deepLinked: !!linked, thread, rail,
    cards: Object.fromEntries(cardList.filter((c): c is readonly [string, CompanyCard] => !!c)),
  }
}
