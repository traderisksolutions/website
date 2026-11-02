/**
 * Auto-send: the drafts of a class a person has switched on go out as operations@ with no
 * approval. /api/email/send refuses machine callers by design, so this is a separate sender that
 * records the send the same way (draft sent, outbound message on the thread, case status), plus
 * sent_by_agent on the draft, an auto_sent event on the case and a line in the company ledger.
 *
 * Only a reply on an existing thread is ever auto-sent; a new conversation needs a person.
 */
import { fillVoice } from '@/lib/admin/b/voice'
import { randomUUID } from 'node:crypto'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { getGmailToken } from '@/lib/gmail-send'
import { buildRawEmail, htmlToText, type EmailAttachment, type ThreadingHeaders } from '@/lib/email-mime'
import { buildQuotedHistory, buildReferences, type ThreadMessage } from '@/lib/build-reply-thread'
import { attachmentRefBytes } from '@/lib/storage/attachment-bytes'
import { depositEvent } from '@/lib/admin/k/deposit'
import { waitingAfterSend } from '@/lib/casework/queue'
import { nowSGT } from '@/lib/sgt-time'
import { killSwitch, ladderMap, loadLadder, pauseClass } from './ladder'
import { burstHeld, capsAllow, eligibility, inSendingHours, DEFAULT_DAY_CAP, DEFAULT_RUN_CAP, OPERATIONS, type DraftForSend, type ItemForSend } from './rules'

type Row = Record<string, any>
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const ACTOR = 'agent'

export type RunResult = { considered: number; sent: number; held: { id: string; reason: string }[]; failed: { id: string; error: string }[]; skipped?: string }

const caps = () => ({ run: Number(process.env.AUTONOMY_RUN_CAP ?? DEFAULT_RUN_CAP) || DEFAULT_RUN_CAP, day: Number(process.env.AUTONOMY_DAY_CAP ?? DEFAULT_DAY_CAP) || DEFAULT_DAY_CAP })

/** Today's auto-sends, Singapore day, for the burst guard, the cap and the digest. */
export async function autoSentToday(now = new Date()): Promise<Row[]> {
  const sgt = nowSGT()
  const startSgt = new Date(Date.UTC(sgt.getFullYear(), sgt.getMonth(), sgt.getDate(), -8))   // 00:00 SGT as UTC
  return sbTry<Row[]>(`ai_drafts?sent_by_agent=eq.true&sent_at=gte.${enc(startSgt.toISOString())}&sent_at=lte.${enc(now.toISOString())}&select=id,to_email,subject,draft_class,work_item_id,sent_at,work_items(client_name)&order=sent_at.desc`, [])
}

/** One run: every eligible pending draft, within the caps, each sent and recorded. */
export async function autoSendRun(opts: { now?: Date; force?: boolean } = {}): Promise<RunResult> {
  const now = opts.now ?? new Date()
  const out: RunResult = { considered: 0, sent: 0, held: [], failed: [] }
  if (!opts.force && !inSendingHours(nowSGT())) return { ...out, skipped: 'outside sending hours' }
  const off = killSwitch()
  const ladder = ladderMap(await loadLadder())
  const autoClasses = Array.from(ladder.values()).filter(r => r.status === 'auto').map(r => r.draft_class)
  if (!autoClasses.length || off) return { ...out, skipped: off ? 'AUTONOMY_AUTOSEND=off' : 'no class is on auto' }

  const drafts = await sbTry<Row[]>(`ai_drafts?status=in.(pending,draft)&draft_class=in.(${autoClasses.map(enc).join(',')})&channel=eq.email&select=id,status,channel,email_type,draft_class,to_email,cc,subject,body,thread_id,work_item_id,context_used,sent_by_agent,attachments,contact_id&order=created_at.asc&limit=200`, [])
  out.considered = drafts.length
  if (!drafts.length) return out
  const departed = new Set((await sbTry<Row[]>('staff_departures?select=email', [])).map(r => String(r.email).toLowerCase()))
  const itemIds = Array.from(new Set(drafts.map(d => d.work_item_id).filter(Boolean)))
  const items = new Map<string, ItemForSend>()
  for (let i = 0; i < itemIds.length; i += 50) for (const it of await sbTry<Row[]>(`work_items?id=in.(${itemIds.slice(i, i + 50).join(',')})&select=id,needs_human,closed_at,later_until,later_when,owner_email`, [])) items.set(it.id, it as ItemForSend)
  const recent = (await autoSentToday(now)).map(r => ({ to: String(r.to_email ?? '').split(/[,;]\s*/)[0] ?? '', at: r.sent_at as string }))
  let sentToday = recent.length, sentThisRun = 0
  const insurerDomains = new Set<string>((await sbTry<Row[]>('companies?kind=in.(insurer,tpa)&select=domains', [])).flatMap(r => (r.domains ?? []) as string[]).map(d => d.toLowerCase()))

  for (const d of drafts) {
    const v = eligibility(d as DraftForSend, d.work_item_id ? items.get(d.work_item_id) ?? null : null, ladder, departed, off)
    if (!v.ok) { out.held.push({ id: d.id, reason: v.reason }); continue }
    if (!capsAllow(sentToday, sentThisRun, caps())) { out.held.push({ id: d.id, reason: 'cap reached' }); continue }
    if (burstHeld(recent, v.to[0], now)) { out.held.push({ id: d.id, reason: 'same recipient within 10 minutes' }); continue }
    try {
      await sendOne(d, v.to, v.cc, items.get(d.work_item_id) as Row, insurerDomains)
      out.sent++; sentThisRun++; sentToday++
      recent.push({ to: v.to[0], at: new Date().toISOString() })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      out.failed.push({ id: d.id, error: msg })
      // A refused send is a reason to stop the class until a person looks.
      await pauseClass(d.draft_class, `send failed: ${msg}`)
      if (d.work_item_id) await sbTry('work_item_events', null, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: d.work_item_id, kind: 'auto_send_failed', actor: ACTOR, detail: { draft_id: d.id, error: msg.slice(0, 500) } }) })
    }
  }
  return out
}


async function sendOne(d: Row, to: string[], cc: string[], item: Row | undefined, insurerDomains: Set<string>): Promise<void> {
  const [thread] = await sbTry<Row[]>(`email_threads?id=eq.${enc(d.thread_id)}&select=id,gmail_thread_id,subject&limit=1`, [])
  if (!thread) throw new Error('thread not found')
  // Sent in the owner's voice: greeting word, close, name, phone (src/lib/admin/b/voice.ts).
  const body = await fillVoice(String(d.body ?? ''), item?.owner_email ?? null, d.thread_id)
  const subject = String(d.subject ?? '').trim() || (thread.subject ? `Re: ${String(thread.subject).replace(/^(re|fwd?):\s*/i, '')}` : 'Trade Risk Solutions')

  // Threading and the quoted history, as the send route does them.
  const ourMessageId = `<${randomUUID()}@trade-risksol.com>`
  const threading: ThreadingHeaders = { messageId: ourMessageId }
  let plain = body
  const [prior, parts] = await Promise.all([
    sbTry<ThreadMessage[]>(`email_messages?thread_id=eq.${enc(d.thread_id)}&select=from_address,sent_at,body_text,body_html,rfc822_message_id&order=sent_at.asc`, []),
    sbTry<Row[]>(`email_participants?thread_id=eq.${enc(d.thread_id)}&role=eq.from&select=email,name`, []),
  ])
  const nameBy = new Map(parts.filter(p => p.name?.trim()).map(p => [String(p.email).toLowerCase(), String(p.name).trim()]))
  const priorMessages = prior.map(m => ({ ...m, from_name: m.from_address ? nameBy.get(String(m.from_address).toLowerCase()) ?? null : null }))
  if (priorMessages.length) {
    const q = buildQuotedHistory(priorMessages); if (q.text) plain = `${plain}\n\n${q.text}`
    const refs = buildReferences(priorMessages); threading.inReplyTo = refs.inReplyTo; threading.references = refs.references
  }
  const attachments: EmailAttachment[] = []
  for (const a of (d.attachments ?? []) as Row[]) {
    if (!a?.storage_url) continue
    const bytes = await attachmentRefBytes(String(a.storage_url))
    if (bytes) attachments.push({ filename: String(a.filename ?? 'attachment'), mimeType: String(a.mime_type ?? 'application/octet-stream'), dataB64: bytes.toString('base64') })
  }
  const raw = buildRawEmail(to.join(', '), subject, plain, null, cc, [], undefined, OPERATIONS, attachments, threading)
  const token = await getGmailToken()
  const payload: Row = { raw }; if (thread.gmail_thread_id) payload.threadId = thread.gmail_thread_id
  const res = await fetch(`${GMAIL_API}/messages/send`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const sent = await res.json()
  const sentAt = new Date().toISOString()
  let messageId = ourMessageId
  try {
    const m = await (await fetch(`${GMAIL_API}/messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`, { headers: { Authorization: `Bearer ${token}` } })).json()
    const h = (m.payload?.headers ?? []).find((x: Row) => String(x.name).toLowerCase() === 'message-id'); if (h?.value) messageId = h.value
  } catch { /* ours stands */ }

  await sb(`ai_drafts?id=eq.${enc(d.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'sent', sent_at: sentAt, sent_by_agent: true, body, to_email: to.join(', '), cc: cc.join(', ') }) })
  await sbTry('email_messages?on_conflict=gmail_message_id', null, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ thread_id: d.thread_id, gmail_message_id: sent.id, rfc822_message_id: messageId, direction: 'outbound', from_address: OPERATIONS, subject, body_text: htmlToText(plain), sent_at: sentAt, has_attachments: attachments.length > 0 }) })
  await sbTry(`email_threads?id=eq.${enc(d.thread_id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_message_at: sentAt }) })
  if (d.work_item_id) {
    const status = waitingAfterSend(to, insurerDomains)
    await sbTry(`work_items?id=eq.${enc(d.work_item_id)}&draft_id=eq.${enc(d.id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ draft_id: null }) })
    await sbTry(`work_items?id=eq.${enc(d.work_item_id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status, waiting_since: sentAt.slice(0, 10), last_activity_at: sentAt, next_action: status === 'waiting_insurer' ? 'Wait for the insurer' : 'Wait for the client' }) })
    const [ev] = await sb<Row[]>('work_item_events', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ work_item_id: d.work_item_id, kind: 'auto_sent', actor: ACTOR, detail: { draft_id: d.id, draft_class: d.draft_class, to, cc, subject, sent_at: sentAt, gmail_message_id: sent.id } }) })
    if (ev?.id) await depositEvent('work_item_events', ev.id).catch(() => 0)
  }
}
