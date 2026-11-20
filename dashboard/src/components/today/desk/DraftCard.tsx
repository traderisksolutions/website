'use client'

/**
 * One unsent email on Today: who it goes to, the subject and the message, its files, Edit, Save and
 * Send. Send runs the same path as the thread rail (edit the draft, sign it as the sender,
 * /api/email/send), so a draft sends the same way wherever it is opened. Nothing sends without the
 * click. Discard and redo writes the email again from its thread (one model call, on the button).
 */
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Paperclip } from 'lucide-react'
import { Btn, InlineSpinner, inputCls, textareaCls } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { useConfirm } from '@/components/ui/confirm'
import { toProblem } from '@/lib/email/recipients'
import { timeAgo } from '@/lib/format'
import { uploadAttachment } from '@/lib/upload-attachment'
import { MAX_ATTACHMENTS, draftThread, editedAt, previewHref, suggestFiles, threadHref, type DeskAttachment, type DeskDraft, type ThreadFile } from '@/lib/today/desk'
import { AttachmentRow } from './AttachmentRow'
import { CommissionCheck, type CommissionState } from '@/components/email/CommissionCheck'
import { InlineConfirm } from './InlineConfirm'

let senderOnce: Promise<string | null> | null = null
/** The signed-in person's own mailbox, else the first they may send from. */
function sender(): Promise<string | null> {
  senderOnce ??= fetch('/api/email/available-senders', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : []))
    .then((rows: { email: string; type: string }[]) => (Array.isArray(rows) && rows.length ? rows.find(r => r.type === 'personal')?.email ?? rows[0].email : null))
    .catch(() => null)
  return senderOnce
}

export async function sendDraft(d: DeskDraft, e: { to: string; cc: string; subject: string; body: string; attachments?: DeskAttachment[] }): Promise<void> {
  const problem = toProblem(e.to)
  if (problem) throw new Error(problem)
  if (!e.to.includes('@')) throw new Error('Add a recipient.')
  if (!e.body.trim()) throw new Error('The message is empty.')
  await callApi(`/api/drafts/${d.id}`, { method: 'PATCH', body: { to: e.to.trim(), cc: e.cc || null, subject: e.subject, body: e.body } })
  const { draftId } = await callApi<{ draftId: string }>(`/api/drafts/${d.id}`, { method: 'POST', body: { action: 'prepare' } })
  const copy = e.cc.split(/[,;\s]+/).map(x => x.trim()).filter(x => x.includes('@'))
  const files = e.attachments ?? d.attachments
  await callApi('/api/email/send', { method: 'POST', body: { draftId, toEmail: e.to.trim(), customSubject: e.subject, fromEmail: await sender() ?? undefined, cc: copy.length ? copy : undefined, attachments: files.length ? files : undefined } })
  if (d.workItemId) await callApi(`/api/work/${d.workItemId}`, { method: 'POST', body: { action: 'sent' } }).catch(() => null)
}

const nameOf = (d: DeskDraft) => d.person ?? d.to

export function DraftCard({ draft: d, onSent, onDiscarded, onSaved, onRedone, threads, startEditing = false, bare = false }: {
  draft: DeskDraft; onSent: (to: string) => void; onDiscarded: () => void
  /** After Save or a change of files: the notice to show. */
  onSaved?: (notice: string) => void
  /** After Discard and redo: the notice to show. */
  onRedone?: (notice: string) => void
  /** Every thread on the client's row, for suggested files; the draft's own thread is offered first. */
  threads?: string[]
  startEditing?: boolean; bare?: boolean
}) {
  const confirm = useConfirm()
  const [editing, setEditing] = useState(startEditing)
  const [full, setFull] = useState(false)
  const [to, setTo] = useState(d.to)
  const [cc, setCc] = useState(d.cc)
  const [subject, setSubject] = useState(d.subject)
  const [body, setBody] = useState(d.body)
  const [files, setFiles] = useState<DeskAttachment[]>(d.attachments)
  const [savedAt, setSavedAt] = useState<string | null>(editedAt(d))
  const [busy, setBusy] = useState<'send' | 'discard' | 'save' | 'redo' | 'files' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  // Emails to a client run the commission check (Jarod, 20 Nov 2026); Send waits for it.
  const toClient = d.side === 'client' && files.length > 0
  const [check, setCheck] = useState<CommissionState | null>(null)
  const blocked = toClient && !check?.ready
  useEffect(() => { setTo(d.to); setCc(d.cc); setSubject(d.subject); setBody(d.body) }, [d.id, d.to, d.cc, d.subject, d.body])
  useEffect(() => { setFiles(d.attachments) }, [d.id, d.attachments])
  useEffect(() => { setSavedAt(editedAt(d)) }, [d])

  const thread = draftThread(d)
  const label = (s: string) => `Email to ${nameOf(d)}, ${s || '(no subject)'}`

  async function send() {
    setBusy('send'); setError(null)
    try { await sendDraft(d, { to, cc, subject, body, attachments: toClient && check ? check.attachments : files }); onSent(to.trim()) } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function save() {
    const problem = toProblem(to)
    if (problem) { setError(problem); return }
    if (!body.trim()) { setError('The message is empty.'); return }
    setBusy('save'); setError(null)
    try {
      await callApi(`/api/drafts/${d.id}`, { method: 'PATCH', body: { to: to.trim(), cc: cc || null, subject, body } })
      setSavedAt(new Date().toISOString()); setEditing(false)
      onSaved?.(`${label(subject)}: saved.`)
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function discard() {
    if (!(await confirm({ title: 'Discard this email?', body: `To ${nameOf(d)}. The thread stays on Today.`, action: 'Discard', danger: true }))) return
    setBusy('discard'); setError(null)
    try { await callApi('/api/engagement/draft', { method: 'PATCH', body: { draftId: d.id, status: 'rejected' } }); onDiscarded() } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function redo() {
    setBusy('redo'); setError(null)
    try {
      await callApi(`/api/drafts/${d.id}`, { method: 'POST', body: { action: 'redo', note: note.trim() || undefined } })
      setNote('')
      onRedone?.(`${label(d.subject)}: discarded and written again.`)
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function saveFiles(next: DeskAttachment[], notice: string) {
    setBusy('files'); setError(null)
    try {
      const r = await callApi<{ attachments: DeskAttachment[] }>(`/api/drafts/${d.id}`, { method: 'PATCH', body: { attachments: next } })
      setFiles(r.attachments); setSavedAt(new Date().toISOString())
      onSaved?.(`${label(subject)}: ${notice}.`)
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  const filesBlock = (
    <DraftFiles files={files} busy={busy === 'files'} disabled={!!busy && busy !== 'files'} ownThread={thread} threads={threads ?? (thread ? [thread] : [])}
      onAdd={add => saveFiles([...files, ...add.filter(a => !files.some(f => f.filename.toLowerCase() === a.filename.toLowerCase()))], add.length === 1 ? `${add[0].filename} attached` : `${add.length} files attached`)}
      onRemove={a => saveFiles(files.filter(f => f !== a), `${a.filename} removed`)}
      onError={setError} />
  )
  const commission = toClient && <CommissionCheck attachments={files} onChange={setCheck} context={{ resource_type: 'ai_draft', resource_id: d.id }} />
  const updated = savedAt && <span className="text-[12px] font-medium text-trs-green" title={new Date(savedAt).toLocaleString('en-SG')}>Updated {timeAgo(savedAt)}</span>
  const threadLink = thread && <Link href={threadHref(thread)} className="inline-flex items-center gap-1 text-[12px] text-trs-green-2 underline-offset-[3px] hover:underline" target="_blank"><ExternalLink size={12} aria-hidden /> Open thread</Link>
  const frame = bare ? '' : 'rounded-[10px] border border-trs-line-2 bg-white'

  if (editing) return (
    <Drop onFiles={fs => uploadFiles(fs, files, saveFiles, setError, setBusy)} className={`${frame} flex flex-col gap-2 p-3.5`}>
      <div className="flex flex-wrap items-center gap-2">{threadLink}<span className="flex-1" />{updated}</div>
      <label className="grid grid-cols-[64px_1fr] items-center gap-2 text-[12.5px] text-trs-muted">To<input aria-label="To" value={to} onChange={e => setTo(e.target.value)} className={inputCls} /></label>
      <label className="grid grid-cols-[64px_1fr] items-center gap-2 text-[12.5px] text-trs-muted">Cc<input aria-label="Cc" value={cc} onChange={e => setCc(e.target.value)} className={inputCls} /></label>
      <label className="grid grid-cols-[64px_1fr] items-center gap-2 text-[12.5px] text-trs-muted">Subject<input aria-label="Subject" value={subject} onChange={e => setSubject(e.target.value)} className={inputCls} /></label>
      <textarea aria-label="Message" value={body} onChange={e => setBody(e.target.value)} rows={Math.min(22, Math.max(8, body.split('\n').length + 1))} className={`${textareaCls} leading-[1.5] resize-y`} />
      {filesBlock}
      {commission}
      {error && <p className="m-0 text-[13px] text-trs-neg" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Btn size="xs" level="tertiary" onClick={discard} disabled={!!busy} className="mr-auto">{busy === 'discard' ? 'Discarding…' : 'Discard'}</Btn>
        <Btn size="xs" level="tertiary" onClick={() => { setEditing(false); setError(null) }} disabled={!!busy}>Cancel</Btn>
        <Btn size="xs" onClick={save} loading={busy === 'save'} disabled={!!busy}>Save</Btn>
        <Btn size="xs" level="primary" onClick={send} loading={busy === 'send'} disabled={!!busy || blocked}>Send</Btn>
      </div>
    </Drop>
  )

  return (
    <Drop onFiles={fs => uploadFiles(fs, files, saveFiles, setError, setBusy)} className={`${frame} flex flex-col gap-1.5 p-3.5 min-w-0`} as="article">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
        <span className="text-[13px] font-semibold text-trs-ink truncate" title={d.to}>{nameOf(d)}</span>
        {d.cc && <span className="text-[12px] text-trs-muted truncate">Cc {d.cc}</span>}
        <span className="ml-auto text-[12px] text-trs-muted">{d.label} · drafted {timeAgo(d.createdAt)}</span>
      </div>
      {(threadLink || updated) && <div className="flex flex-wrap items-center gap-2">{threadLink}<span className="flex-1" />{updated}</div>}
      <div className="text-[13.5px] font-medium text-trs-ink">{d.subject || '(no subject)'}</div>
      <div className={`text-[13px] leading-[1.5] text-trs-ink-2 whitespace-pre-line ${full ? '' : 'line-clamp-6'}`}>{d.body}</div>
      {d.body.split('\n').length > 6 || d.body.length > 480
        ? <button type="button" onClick={() => setFull(f => !f)} aria-expanded={full} className="self-start border-0 bg-transparent p-0 text-[12.5px] text-trs-green-2 underline underline-offset-[3px] cursor-pointer">{full ? 'Show less' : 'Show full email'}</button>
        : null}
      {filesBlock}
      {commission}
      {d.removed.length > 0 && <p className="m-0 text-[12.5px] text-trs-warn">Removed from To: {d.removed.join(', ')}</p>}
      {busy === 'redo' && <InlineSpinner label="Writing the email again…" />}
      {error && <p className="m-0 text-[13px] text-trs-neg" role="alert">{error}</p>}
      <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto">
          <InlineConfirm label="Discard and redo" question="Discard and write again?" action="Redo" danger={false} onConfirm={redo} busy={busy === 'redo'} disabled={!!busy && busy !== 'redo'}>
            <input aria-label="What to change" placeholder="What to change (optional)" value={note} onChange={e => setNote(e.target.value)} className={`${inputCls} !h-8 w-[220px] text-[13px]`} />
          </InlineConfirm>
        </span>
        <Btn size="xs" onClick={() => setEditing(true)} disabled={!!busy}>Edit</Btn>
        <Btn size="xs" level="primary" onClick={send} loading={busy === 'send'} disabled={!!busy || blocked}>Send</Btn>
      </div>
    </Drop>
  )
}

/** Local files dropped or chosen: each uploaded to Drive, then attached in one save. */
async function uploadFiles(
  list: File[], current: DeskAttachment[],
  save: (next: DeskAttachment[], notice: string) => Promise<void>,
  setError: (e: string | null) => void, setBusy: (b: 'files' | null) => void,
) {
  if (!list.length) return
  if (current.length + list.length > MAX_ATTACHMENTS) { setError(`At most ${MAX_ATTACHMENTS} attachments on one email.`); return }
  setBusy('files'); setError(null)
  try {
    const added: DeskAttachment[] = []
    for (const f of list) added.push({ filename: f.name, mime_type: f.type || null, storage_url: await uploadAttachment(f) })
    await save([...current.filter(c => !added.some(a => a.filename.toLowerCase() === c.filename.toLowerCase())), ...added], added.length === 1 ? `${added[0].filename} attached` : `${added.length} files attached`)
  } catch (e) { setError(errText(e)); setBusy(null) }
}

/** A card that takes files dropped from the computer. */
function Drop({ onFiles, className, children, as = 'div' }: { onFiles: (files: File[]) => void; className: string; children: React.ReactNode; as?: 'div' | 'article' }) {
  const [over, setOver] = useState(false)
  const Tag = as
  return (
    <Tag className={`${className} ${over ? 'outline outline-2 outline-offset-[-2px] outline-trs-green' : ''}`}
      onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setOver(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false) }}
      onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files)) }}>
      {children}
      {over && <span className="text-[12.5px] font-medium text-trs-green">Drop to attach</span>}
    </Tag>
  )
}

/** The email's files, Remove per file, and Add file: files from the client's threads (key documents first) or from the computer. */
function DraftFiles({ files, busy, disabled, ownThread, threads, onAdd, onRemove, onError }: {
  files: DeskAttachment[]; busy: boolean; disabled: boolean; ownThread: string | null; threads: string[]
  onAdd: (a: DeskAttachment[]) => Promise<void>; onRemove: (a: DeskAttachment) => Promise<void>; onError: (e: string) => void
}) {
  const [picking, setPicking] = useState(false)
  const [found, setFound] = useState<ThreadFile[] | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const threadKey = threads.join(',')
  useEffect(() => {
    if (!picking || found) return
    void Promise.all(threadKey.split(',').filter(Boolean).map(id =>
      fetch(`/api/email/attachments/for-thread?thread_id=${encodeURIComponent(id)}`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : [])).then((rows: Omit<ThreadFile, 'threadId'>[]) => (Array.isArray(rows) ? rows.map(f => ({ ...f, threadId: id })) : []))
        .catch(() => [] as ThreadFile[]),
    )).then(all => setFound(all.flat()))
  }, [picking, found, threadKey])
  const offered = found ? suggestFiles(found, ownThread, files) : []

  return (
    <div className="flex flex-col gap-1.5 border-t border-trs-line pt-2" aria-label="Attachments">
      {files.length > 0 && <ul className="m-0 flex list-none flex-col gap-1 p-0">{files.map(a => <AttachmentRow key={a.storage_url + a.filename} file={a} busy={busy} onRemove={() => onRemove(a)} />)}</ul>}
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="xs" level="tertiary" onClick={() => setPicking(p => !p)} aria-expanded={picking} disabled={disabled || busy}><Paperclip size={13} /> {picking ? 'Close files' : 'Add file'}</Btn>
        <span className="text-[12px] text-trs-subtle">{files.length ? `${files.length} attached · ` : ''}drop files here</span>
        {busy && <InlineSpinner label="Saving files…" />}
        <input ref={input} type="file" multiple hidden aria-label="Upload files" onChange={e => {
          const list = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (!list.length) return
          if (files.length + list.length > MAX_ATTACHMENTS) { onError(`At most ${MAX_ATTACHMENTS} attachments on one email.`); return }
          void (async () => {
            try {
              const added: DeskAttachment[] = []
              for (const f of list) added.push({ filename: f.name, mime_type: f.type || null, storage_url: await uploadAttachment(f) })
              await onAdd(added)
            } catch (err) { onError(errText(err)) }
          })()
        }} />
      </div>
      {picking && (
        <div className="flex flex-col gap-1 rounded-[8px] border border-trs-line-2 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-semibold text-trs-ink">Files on the client’s threads</span>
            <Btn size="xs" level="tertiary" onClick={() => input.current?.click()} disabled={busy}>From computer</Btn>
          </div>
          {!found ? <InlineSpinner label="Reading the threads’ files…" />
            : offered.length === 0 ? <span className="text-[12.5px] text-trs-muted">No other files on these threads.</span>
              : (
                <ul className="m-0 flex max-h-[220px] list-none flex-col gap-1 overflow-auto p-0">
                  {offered.slice(0, 40).map(f => {
                    const href = previewHref(f)
                    return (
                      <li key={f.id} className="flex min-w-0 items-center gap-2 text-[13px]">
                        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-trs-ink hover:underline" title={`Open ${f.filename}`}>{f.filename}</a> : <span className="min-w-0 flex-1 truncate">{f.filename}</span>}
                        <span className="flex-none font-mono text-[11.5px] text-trs-muted">{f.created_at ? timeAgo(f.created_at) : ''}</span>
                        <Btn size="xs" onClick={() => void onAdd([{ filename: f.filename, mime_type: f.mime_type ?? null, storage_url: f.storage_url }])} disabled={busy || files.length >= MAX_ATTACHMENTS}>Attach</Btn>
                      </li>
                    )
                  })}
                </ul>
              )}
        </div>
      )}
    </div>
  )
}
