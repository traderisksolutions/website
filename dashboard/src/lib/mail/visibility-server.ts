/** The mailbox reads behind src/lib/mail/visibility.ts: which Gmail accounts hold each thread. */
import { sbTry, enc } from '@/lib/crm/db'
import { canSeeThread } from './visibility'

/** Thread id → the mailboxes it was read from (email_thread_aliases). Threads with none are absent. */
export async function mailboxesByThread(ids: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const rows = await sbTry<{ thread_id: string; mailbox: string }[]>(`email_thread_aliases?thread_id=in.(${chunk.join(',')})&select=thread_id,mailbox`, [])
    for (const r of rows) {
      const list = out.get(r.thread_id) ?? []
      if (!list.includes(r.mailbox)) list.push(r.mailbox)
      out.set(r.thread_id, list)
    }
  }
  return out
}

export async function threadVisibleTo(threadId: string, viewer: string | null | undefined): Promise<boolean> {
  if (viewer == null) return true
  const rows = await sbTry<{ mailbox: string }[]>(`email_thread_aliases?thread_id=eq.${enc(threadId)}&select=mailbox`, [])
  return canSeeThread(viewer, rows.map(r => r.mailbox))
}

/** The 403 body every thread read returns for a colleague's private thread. */
export const PRIVATE_THREAD = { error: 'This thread is in a colleague’s mailbox.' }
