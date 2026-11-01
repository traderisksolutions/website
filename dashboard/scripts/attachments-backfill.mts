/**
 * Backfills email_attachments for stored messages that carry real files but have no rows: reads
 * each message's MIME again from the mailbox it came from, writes the rows, corrects
 * has_attachments where the only "file" was a signature logo, and queues the document clerk.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/attachments-backfill.mts dry   [days]
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/attachments-backfill.mts write [days]
 *
 * dry   reads Gmail and prints what would change. Writes nothing.
 * write writes rows, flags and clerk tasks. Idempotent: rows merge on (message_id, filename),
 *       the clerk task key is the one intake uses, so a message is never queued twice.
 * A message whose mailbox token is unavailable is counted and left for the next run.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { gmailTokenForThread, OPERATIONS_MAILBOX } from '@/lib/gmail/mailboxes'
import { attachmentRows, realFileParts, type MimePart } from '@/lib/gmail/attachments'
import { enqueue } from '@/lib/agent-tasks/queue'

const [mode, daysArg] = process.argv.slice(2)
if (mode !== 'dry' && mode !== 'write') { console.error('usage: attachments-backfill.mts dry|write [days]'); process.exit(1) }
const WRITE = mode === 'write'
const since = daysArg ? new Date(Date.now() - Number(daysArg) * 86_400_000).toISOString() : null

type Msg = { id: string; thread_id: string; gmail_message_id: string | null; sent_at: string }
const msgs: Msg[] = []
for (let off = 0; ; off += 1000) {
  const page = await sbTry<Msg[]>(`email_messages?has_attachments=eq.true&deleted_at=is.null${since ? `&sent_at=gte.${enc(since)}` : ''}&select=id,thread_id,gmail_message_id,sent_at&order=sent_at.asc&offset=${off}&limit=1000`, [])
  msgs.push(...page); if (page.length < 1000) break
}
const withRows = new Set<string>()
for (let i = 0; i < msgs.length; i += 100) {
  const ids = msgs.slice(i, i + 100).map(m => m.id)
  for (const a of await sbTry<{ message_id: string }[]>(`email_attachments?message_id=in.(${ids.join(',')})&select=message_id`, [])) withRows.add(a.message_id)
}
const todo = msgs.filter(m => !withRows.has(m.id) && m.gmail_message_id)
console.log(`${mode}: ${msgs.length} flagged messages, ${withRows.size} already have rows, ${todo.length} to read`)

const tokens = new Map<string, { token: string; mailbox: string } | null>()
const counts = { rows: 0, messagesWithFiles: 0, flagCleared: 0, noToken: 0, gmailGone: 0, queued: 0, byType: {} as Record<string, number>, byMailbox: {} as Record<string, number> }
let n = 0
for (const m of todo) {
  if (!tokens.has(m.thread_id)) tokens.set(m.thread_id, await gmailTokenForThread(m.thread_id))
  const t = tokens.get(m.thread_id)
  if (!t) { counts.noToken++; continue }
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.gmail_message_id!)}?format=full`, { headers: { Authorization: `Bearer ${t.token}` } })
  if (res.status === 401 && t.mailbox !== OPERATIONS_MAILBOX) { tokens.set(m.thread_id, null); counts.noToken++; continue }
  if (!res.ok) { counts.gmailGone++; continue }
  const payload = (await res.json() as { payload?: MimePart }).payload
  const parts = realFileParts(payload)
  if (!parts.length) {
    counts.flagCleared++
    if (WRITE) await sb(`email_messages?id=eq.${enc(m.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ has_attachments: false }) })
    continue
  }
  counts.messagesWithFiles++; counts.rows += parts.length
  counts.byMailbox[t.mailbox] = (counts.byMailbox[t.mailbox] ?? 0) + 1
  for (const p of parts) { const ext = (p.filename.split('.').pop() ?? '?').toLowerCase(); counts.byType[ext] = (counts.byType[ext] ?? 0) + 1 }
  if (WRITE) {
    const rows = attachmentRows({ messageId: m.id, threadId: m.thread_id, payload })
    await sb('email_attachments?on_conflict=message_id,filename', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) })
    await enqueue({ agent: 'document_clerk', kind: 'attachments', idem_key: `docs:${m.id}`, created_by_agent: 'system', message_id: m.id, thread_id: m.thread_id, payload: { message_id: m.id } })
    counts.queued++
  }
  if (++n % 200 === 0) console.log('read', n, 'of', todo.length)
}
console.log(JSON.stringify(counts, null, 1))
