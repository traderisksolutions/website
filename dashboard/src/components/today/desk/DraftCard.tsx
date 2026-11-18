'use client'

/**
 * One unsent email on Today: who it goes to, the subject and the message, Edit and Send. Send runs
 * the same path as the thread rail (edit the draft, sign it as the sender, /api/email/send), so a
 * draft sends the same way wherever it is opened. Nothing sends without the click.
 */
import { useEffect, useState } from 'react'
import { Btn, inputCls, textareaCls } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { useConfirm } from '@/components/ui/confirm'
import { toProblem } from '@/lib/email/recipients'
import { timeAgo } from '@/lib/format'
import type { DeskDraft } from '@/lib/today/desk'

let senderOnce: Promise<string | null> | null = null
/** The signed-in person's own mailbox, else the first they may send from. */
function sender(): Promise<string | null> {
  senderOnce ??= fetch('/api/email/available-senders', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : []))
    .then((rows: { email: string; type: string }[]) => (Array.isArray(rows) && rows.length ? rows.find(r => r.type === 'personal')?.email ?? rows[0].email : null))
    .catch(() => null)
  return senderOnce
}

export async function sendDraft(d: DeskDraft, e: { to: string; cc: string; subject: string; body: string }): Promise<void> {
  const problem = toProblem(e.to)
  if (problem) throw new Error(problem)
  if (!e.to.includes('@')) throw new Error('Add a recipient.')
  if (!e.body.trim()) throw new Error('The message is empty.')
  await callApi(`/api/drafts/${d.id}`, { method: 'PATCH', body: { to: e.to.trim(), cc: e.cc || null, subject: e.subject, body: e.body } })
  const { draftId } = await callApi<{ draftId: string }>(`/api/drafts/${d.id}`, { method: 'POST', body: { action: 'prepare' } })
  const copy = e.cc.split(/[,;\s]+/).map(x => x.trim()).filter(x => x.includes('@'))
  await callApi('/api/email/send', { method: 'POST', body: { draftId, toEmail: e.to.trim(), customSubject: e.subject, fromEmail: await sender() ?? undefined, cc: copy.length ? copy : undefined, attachments: d.attachments.length ? d.attachments : undefined } })
  if (d.workItemId) await callApi(`/api/work/${d.workItemId}`, { method: 'POST', body: { action: 'sent' } }).catch(() => null)
}

export function DraftCard({ draft: d, onSent, onDiscarded, startEditing = false, bare = false }: {
  draft: DeskDraft; onSent: (to: string) => void; onDiscarded: () => void; startEditing?: boolean; bare?: boolean
}) {
  const confirm = useConfirm()
  const [editing, setEditing] = useState(startEditing)
  const [full, setFull] = useState(false)
  const [to, setTo] = useState(d.to)
  const [cc, setCc] = useState(d.cc)
  const [subject, setSubject] = useState(d.subject)
  const [body, setBody] = useState(d.body)
  const [busy, setBusy] = useState<'send' | 'discard' | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setTo(d.to); setCc(d.cc); setSubject(d.subject); setBody(d.body) }, [d.id, d.to, d.cc, d.subject, d.body])

  async function send() {
    setBusy('send'); setError(null)
    try { await sendDraft(d, { to, cc, subject, body }); onSent(to.trim()) } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function discard() {
    if (!(await confirm({ title: 'Discard this email?', body: `To ${d.person ?? d.to}. The thread stays on Today.`, action: 'Discard', danger: true }))) return
    setBusy('discard'); setError(null)
    try { await callApi('/api/engagement/draft', { method: 'PATCH', body: { draftId: d.id, status: 'rejected' } }); onDiscarded() } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  const frame = bare ? '' : 'rounded-[10px] border border-trs-line-2 bg-white'
  if (editing) return (
    <div className={`${frame} flex flex-col gap-2 p-3.5`}>
      <label className="grid grid-cols-[64px_1fr] items-center gap-2 text-[12.5px] text-trs-muted">To<input aria-label="To" value={to} onChange={e => setTo(e.target.value)} className={inputCls} /></label>
      <label className="grid grid-cols-[64px_1fr] items-center gap-2 text-[12.5px] text-trs-muted">Cc<input aria-label="Cc" value={cc} onChange={e => setCc(e.target.value)} className={inputCls} /></label>
      <label className="grid grid-cols-[64px_1fr] items-center gap-2 text-[12.5px] text-trs-muted">Subject<input aria-label="Subject" value={subject} onChange={e => setSubject(e.target.value)} className={inputCls} /></label>
      <textarea aria-label="Message" value={body} onChange={e => setBody(e.target.value)} rows={Math.min(22, Math.max(8, body.split('\n').length + 1))} className={`${textareaCls} leading-[1.5] resize-y`} />
      {d.attachments.length > 0 && <p className="m-0 text-[12.5px] text-trs-muted">Attached: {d.attachments.map(a => a.filename).join(', ')}</p>}
      {error && <p className="m-0 text-[13px] text-trs-neg" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Btn size="xs" level="tertiary" onClick={discard} disabled={!!busy} className="mr-auto">{busy === 'discard' ? 'Discarding…' : 'Discard'}</Btn>
        <Btn size="xs" onClick={() => { setEditing(false); setError(null) }} disabled={!!busy}>Cancel</Btn>
        <Btn size="xs" level="primary" onClick={send} loading={busy === 'send'} disabled={!!busy}>Send</Btn>
      </div>
    </div>
  )

  return (
    <article className={`${frame} flex flex-col gap-1.5 p-3.5 min-w-0`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
        <span className="text-[13px] font-semibold text-trs-ink truncate" title={d.to}>{d.person ?? d.to}</span>
        {d.cc && <span className="text-[12px] text-trs-muted truncate">Cc {d.cc}</span>}
        <span className="ml-auto text-[12px] text-trs-muted">{d.label} · drafted {timeAgo(d.createdAt)}</span>
      </div>
      <div className="text-[13.5px] font-medium text-trs-ink">{d.subject || '(no subject)'}</div>
      <div className={`text-[13px] leading-[1.5] text-trs-ink-2 whitespace-pre-line ${full ? '' : 'line-clamp-6'}`}>{d.body}</div>
      {d.body.split('\n').length > 6 || d.body.length > 480
        ? <button type="button" onClick={() => setFull(f => !f)} aria-expanded={full} className="self-start border-0 bg-transparent p-0 text-[12.5px] text-trs-green-2 underline underline-offset-[3px] cursor-pointer">{full ? 'Show less' : 'Show full email'}</button>
        : null}
      {d.attachments.length > 0 && <p className="m-0 text-[12.5px] text-trs-muted">Attached: {d.attachments.map(a => a.filename).join(', ')}</p>}
      {d.removed.length > 0 && <p className="m-0 text-[12.5px] text-trs-warn">Removed from To: {d.removed.join(', ')}. Each company gets its own email.</p>}
      {error && <p className="m-0 text-[13px] text-trs-neg" role="alert">{error}</p>}
      <div className="mt-1 flex justify-end gap-2">
        <Btn size="xs" onClick={() => setEditing(true)} disabled={!!busy}>Edit</Btn>
        <Btn size="xs" level="primary" onClick={send} loading={busy === 'send'} disabled={!!busy}>Send</Btn>
      </div>
    </article>
  )
}
