/** The mailbox reads behind src/lib/mail/visibility.ts: which Gmail accounts hold each thread, and who was on it. */
import { sbTry, enc } from '@/lib/crm/db'
import { canSeeThread, OPERATIONS_MAILBOX } from './visibility'

const chunks = <T,>(xs: readonly T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

/** Thread ids on which this address appears as a sender or recipient. */
async function threadsWith(ids: readonly string[], email: string): Promise<Set<string>> {
  const out = new Set<string>()
  for (const c of chunks(ids, 100)) {
    const [parts, sent] = await Promise.all([
      sbTry<{ thread_id: string }[]>(`email_participants?thread_id=in.(${c.join(',')})&email=eq.${enc(email)}&select=thread_id`, []),
      sbTry<{ thread_id: string }[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&from_address=ilike.${enc('*' + email + '*')}&select=thread_id`, []),
    ])
    for (const r of [...parts, ...sent]) out.add(r.thread_id)
  }
  return out
}

/**
 * Thread id → the mailboxes it was read from (email_thread_aliases), with operations@ added when it
 * was on the email, since its own reads recorded no alias before 10 Nov 2026. Threads with none are absent.
 */
export async function mailboxesByThread(ids: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  for (const c of chunks(ids, 100)) {
    const rows = await sbTry<{ thread_id: string; mailbox: string }[]>(`email_thread_aliases?thread_id=in.(${c.join(',')})&select=thread_id,mailbox`, [])
    for (const r of rows) {
      const list = out.get(r.thread_id) ?? []
      if (!list.includes(r.mailbox)) list.push(r.mailbox)
      out.set(r.thread_id, list)
    }
  }
  const privateIds = Array.from(out.entries()).filter(([, m]) => !m.includes(OPERATIONS_MAILBOX)).map(([id]) => id)
  if (privateIds.length) for (const id of await threadsWith(privateIds, OPERATIONS_MAILBOX)) out.get(id)!.push(OPERATIONS_MAILBOX)
  return out
}

/** For a list: which threads the viewer may see. Cron and secret calls (viewer null) see all. */
export async function visibleThreadIds(ids: readonly string[], viewer: string | null | undefined): Promise<Set<string>> {
  if (viewer == null) return new Set(ids)
  const boxes = await mailboxesByThread(ids)
  const maybe = ids.filter(id => !canSeeThread(viewer, boxes.get(id) ?? []))
  const on = maybe.length ? await threadsWith(maybe, viewer) : new Set<string>()
  return new Set(ids.filter(id => canSeeThread(viewer, boxes.get(id) ?? [], on.has(id) ? [viewer] : [])))
}

export async function threadVisibleTo(threadId: string, viewer: string | null | undefined): Promise<boolean> {
  if (viewer == null) return true
  return (await visibleThreadIds([threadId], viewer)).has(threadId)
}

/** The 403 body every thread read returns for a colleague's private thread. */
export const PRIVATE_THREAD = { error: 'This thread is in a colleague’s mailbox.' }
