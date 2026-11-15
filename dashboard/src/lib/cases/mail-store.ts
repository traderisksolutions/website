/**
 * The reads behind Today › Mail (mail.ts): every thread, its label, its client and the open case
 * it is on, less the threads in a colleague's mailbox. No model is called here.
 */
import { SB_URL, sbHeaders } from '@/lib/sb'
import { fetchAllRows, PAGE } from '@/lib/postgrest-all'
import { sb } from '@/lib/crm/db'
import { directory } from '@/lib/admin/k/deposit'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { labelled, mailView, type MailFilter, type MailRow, type MailView } from './mail'
import { relevanceOf } from './relevance'

type Row = Record<string, any>
type ThreadRow = { id: string; subject: string | null; display_subject: string | null; company_id: string | null; last_message_at: string | null; label: string | null; label_by: string | null; label_basis: string | null; label_at: string | null }
const all = <T = Row>(path: string) => fetchAllRows<T>(`${SB_URL}/rest/v1/${path}`, sbHeaders())

/** The threads read from a recorded mailbox. The table has no id column, so it pages on its own key. */
async function aliasedThreadIds(): Promise<string[]> {
  const out = new Set<string>()
  for (let offset = 0; ; offset += PAGE) {
    const rows = await sb<{ thread_id: string }[]>(`email_thread_aliases?select=thread_id&order=mailbox,gmail_thread_id&limit=${PAGE}&offset=${offset}`)
    for (const r of rows) out.add(r.thread_id)
    if (rows.length < PAGE) return Array.from(out)
  }
}

export async function mailRows(viewer: string | null, today: string): Promise<MailRow[]> {
  const [threads, open, aliased, dir] = await Promise.all([
    all<ThreadRow>(`email_threads?deleted_at=is.null&select=id,subject,display_subject,company_id,last_message_at,label,label_by,label_basis,label_at&order=last_message_at.desc.nullslast`),
    all(`work_items?closed_at=is.null&select=id,title,work_item_threads(thread_id)`),
    aliasedThreadIds(),
    directory(),
  ])
  const onOpen = new Map<string, { id: string; title: string | null }>()
  for (const w of open) for (const l of w.work_item_threads ?? []) onOpen.set(l.thread_id, { id: w.id, title: w.title ?? null })
  // A thread no mailbox recorded is the team's; only the others need the mailbox check.
  const mine = await visibleThreadIds(aliased, viewer)
  const held = new Set(aliased)
  const out: MailRow[] = []
  for (const t of threads) {
    if (held.has(t.id) && !mine.has(t.id)) continue
    const { label, set_by } = labelled(t)
    out.push({
      id: t.id, subject: t.display_subject ?? t.subject ?? null, last_message_at: t.last_message_at ?? null,
      company: t.company_id ? { id: t.company_id, name: dir.byId.get(t.company_id)?.company_name ?? null } : null,
      label, set_by, relevance: relevanceOf({ lastMessageAt: t.last_message_at, label, onOpenCase: onOpen.has(t.id) }, today),
      case: onOpen.get(t.id) ?? null,
    })
  }
  return out
}

export async function mailByLabel(viewer: string | null, filter: MailFilter, today: string): Promise<MailView> {
  return mailView(await mailRows(viewer, today), filter)
}
