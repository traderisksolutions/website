/**
 * The read behind Today › Mail (mail.ts): one call to today_mail
 * (supabase/migrations/20261115_today_mail.sql), which answers the counts and the newest rows of
 * one view, less the threads in a colleague's mailbox. No model is called here.
 */
import { sb } from '@/lib/crm/db'
import { mailRowOf, type MailFilter, type MailRaw, type MailView } from './mail'

export async function mailByLabel(viewer: string | null, filter: MailFilter, today: string): Promise<MailView> {
  const r = await sb<{ counts: MailView['counts']; total: number; threads: MailRaw[] }>('rpc/today_mail', {
    method: 'POST',
    body: JSON.stringify({ p_viewer: viewer, p_today: today, p_relevance: filter.relevance, p_label: filter.label, p_limit: filter.limit }),
  })
  return { counts: r.counts, total: r.total, threads: r.threads.map(mailRowOf) }
}
