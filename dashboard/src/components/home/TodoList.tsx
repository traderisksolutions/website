'use client'

/**
 * The home to-do: every item that needs a person, in four sections (Send, To act, Decide, Read),
 * most pressing first, with the work done in place. Send opens the draft for a last look and
 * sends it through /api/email/send; Ask AI rewrites a draft as instructed, or writes the first
 * one from the case's thread; Nexus opens a case; Later holds the item. A case with paired drafts
 * (the client update beside the insurer email) opens the review page, where both are sent together.
 * Above the sections, Suggested: what the mail makes possible (a census to price), one line and a Yes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Btn, Chip, LinkBtn, Segmented, Spinner } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { CASE_TYPE, LaterMenu, ThreadModal, fmtDate } from '@/components/assistant/shared'
import { oneRecipient } from '@/lib/email/recipients'
import { classify, defaultSchedule, expectsReply } from '@/lib/followups/rules'
import { todoSections, todoCount, TODO_SECTIONS, type TodoSection } from '@/lib/today/todo'
import type { ItemDetail, TodayDraft, TodayItem } from '@/lib/today/data'
import type { ThreadSuggestion } from '@/lib/chief/suggest'
import { doneHref, doneLabel, doneSummary } from '@/lib/chief/suggest-links'

type Who = 'mine' | 'all'
type Edit = { to: string; cc: string; subject: string; body: string }
type Panel = { id: string; mode: 'send' | 'ask' } | null
const PER_SECTION = 8

const asEdit = (d: TodayDraft): Edit => ({ to: d.to, cc: d.cc ?? '', subject: d.subject, body: d.body })
const changed = (e: Edit, d: TodayDraft) => e.to !== d.to || e.cc !== (d.cc ?? '') || e.subject !== d.subject || e.body !== d.body
const withRefs = (a: TodayDraft['attachments']) => a.filter(x => x.storage_url).map(x => ({ filename: x.filename, mime_type: x.mime_type ?? undefined, storage_url: x.storage_url as string }))
/** The chase a draft gets unless the person changes it on the review page: the default for its party and type. */
function chaseDefault(d: TodayDraft): { days: number; auto: boolean } {
  const party = d.party === 'insurer' ? 'insurer' : d.party === 'client' ? 'client' : 'other'
  const type = classify({ subject: d.subject, body: d.body, party, draftKind: d.kind })
  return { days: expectsReply(type, d.body) ? defaultSchedule(party, type).firstAfterDays : 0, auto: false }
}
const inputCls = 'w-full min-w-0 h-8 rounded-[7px] border border-trs-line-2 bg-white px-2.5 text-[13.5px] text-trs-ink outline-none focus:border-trs-ink'

export function TodoList() {
  const [items, setItems] = useState<TodayItem[] | null>(null)
  const [me, setMe] = useState<string | null>(null)
  const [who, setWho] = useState<Who>('mine')
  const [panel, setPanel] = useState<Panel>(null)
  const [thread, setThread] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState<Record<string, boolean>>({})
  const [suggested, setSuggested] = useState<ThreadSuggestion[]>([])

  const load = useCallback(() => Promise.all([
    callApi<{ items: TodayItem[]; me: string | null }>('/api/today')
      .then(d => { setItems(d.items); setMe(d.me); if (d.me && !d.items.some(i => i.owner_email === d.me)) setWho('all') }),
    callApi<{ items: ThreadSuggestion[] }>('/api/suggestions').then(d => setSuggested(d.items)).catch(() => setSuggested([])),
  ]).catch(e => setError(errText(e))), [])
  useEffect(() => { void load() }, [load])

  const sections = useMemo(() => todoSections(items ?? [], who, me), [items, who, me])
  const total = todoCount(sections)
  const done = (msg: string) => { setNotice(msg); setError(null); setPanel(null); void load() }
  const fail = (e: unknown) => setError(errText(e))

  return (
    <section aria-label="To do" className="rounded-[14px] border border-trs-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-5 py-3 border-b border-trs-line">
        <div className="flex items-baseline gap-2">
          <h2 className="m-0 text-[17px] font-medium text-trs-ink">To do</h2>
          {items && <span className="font-mono text-[12px] text-trs-muted">{total}{sections.send.length ? ` · ${sections.send.length} to send` : ''}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Segmented<Who> value={who} onChange={setWho} label="Owner" options={[
            { value: 'mine', label: 'Mine', count: todoCount(todoSections(items ?? [], 'mine', me)) },
            { value: 'all', label: 'Everyone', count: todoCount(todoSections(items ?? [], 'all', me)) },
          ]} />
          <LinkBtn size="xs" href="/today">Today</LinkBtn>
        </div>
      </div>
      {(error || notice) && (
        <p className={`m-0 px-4 md:px-5 py-2 text-[13px] border-b border-trs-line ${error ? 'text-trs-neg' : 'text-trs-ink'}`} role={error ? 'alert' : 'status'}>{error ?? notice}</p>
      )}
      {!items && !error && <div className="px-5 py-4"><Spinner label="Loading the list…" /></div>}
      {suggested.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-4 md:px-5 py-2 bg-trs-canvas border-b border-trs-line">
            <h3 className="m-0 text-[12px] font-medium uppercase tracking-[0.06em] text-trs-ink-2">Suggested</h3>
            <span className="font-mono text-[11.5px] text-trs-muted">{suggested.length}</span>
          </div>
          {suggested.map(s => <SuggestedRow key={`${s.threadId}:${s.key}`} s={s} onThread={setThread} onDone={done} onError={fail} />)}
        </div>
      )}
      {items && total === 0 && suggested.length === 0 && <p className="m-0 px-5 py-4 text-[13.5px] text-trs-muted">Nothing to do{who === 'mine' ? ' for you' : ''}.</p>}
      {items && TODO_SECTIONS.map(s => {
        const rows = sections[s.key]
        if (!rows.length) return null
        const shown = more[s.key] ? rows : rows.slice(0, PER_SECTION)
        return (
          <div key={s.key}>
            <div className="flex items-center justify-between px-4 md:px-5 py-2 bg-trs-canvas border-b border-trs-line">
              <h3 className="m-0 text-[12px] font-medium uppercase tracking-[0.06em] text-trs-ink-2">{s.label}</h3>
              <span className="font-mono text-[11.5px] text-trs-muted">{rows.length}</span>
            </div>
            {shown.map(i => (
              <Row key={i.id} item={i} section={s.key} panel={panel?.id === i.id ? panel.mode : null}
                onPanel={m => setPanel(m ? { id: i.id, mode: m } : null)} onThread={setThread} onDone={done} onError={fail} />
            ))}
            {rows.length > PER_SECTION && (
              <div className="px-4 md:px-5 py-2 border-b border-trs-line">
                <button type="button" onClick={() => setMore(m => ({ ...m, [s.key]: !m[s.key] }))} className="bg-transparent border-0 p-0 text-[13px] text-trs-muted cursor-pointer hover:underline">
                  {more[s.key] ? 'Show fewer' : `All ${rows.length}`}
                </button>
              </div>
            )}
          </div>
        )
      })}
      <ThreadModal threadId={thread} onClose={() => setThread(null)} />
    </section>
  )
}

/** One suggestion from the mail: the file, the client, and a Yes that runs the action in place. */
function SuggestedRow({ s, onThread, onDone, onError }: { s: ThreadSuggestion; onThread: (id: string) => void; onDone: (m: string) => void; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<{ summary: string; quotationId: string } | null>(s.done ? { summary: doneSummary(s), quotationId: s.done.quotationId } : null)
  const post = (body: unknown) => callApi<{ quotationId: string; summary: string }>(`/api/threads/${s.threadId}/bar`, { method: 'POST', body })
  const yes = () => { setBusy('yes'); post({ action: 'suggest', key: s.key }).then(r => { setResult(r); onDone(`${r.summary}: ${s.company ?? s.subject ?? ''}`) }).catch(onError).finally(() => setBusy(null)) }
  const notNow = () => { setBusy('no'); post({ action: 'dismiss', key: s.key }).then(() => onDone(`Not now: ${s.title}.`)).catch(onError).finally(() => setBusy(null)) }
  return (
    <div className="px-4 md:px-5 py-3 border-b border-trs-line">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone="blue">Employee benefits</Chip>
            <span className="text-[12.5px] text-trs-muted truncate">{[s.company, fmtDate(s.receivedAt)].filter(Boolean).join(' · ')}</span>
          </div>
          <p className="m-0 mt-1 text-[14.5px] font-medium leading-snug text-trs-ink">{s.title}</p>
          <p className="m-0 mt-0.5 text-[13px] text-trs-ink-2 break-words">{s.detail}{s.subject ? ` · ${s.subject}` : ''}</p>
          {result && <p className="m-0 mt-1 text-[13px] text-trs-ink-2">{result.summary} · <Link href={doneHref(s, result.quotationId)} className="text-trs-ink">{doneLabel(s)}</Link></p>}
        </div>
        <div className="flex flex-wrap items-start md:justify-end gap-1.5">
          {!result && <Btn size="xs" level="primary" loading={busy === 'yes'} onClick={yes}>Yes, {s.yes.charAt(0).toLowerCase()}{s.yes.slice(1)}</Btn>}
          {!result && <Btn size="xs" level="secondary" loading={busy === 'no'} onClick={notNow}>Not now</Btn>}
          <Btn size="xs" level="secondary" onClick={() => onThread(s.threadId)}>Thread</Btn>
        </div>
      </div>
    </div>
  )
}

function Row({ item: i, section, panel, onPanel, onThread, onDone, onError }: {
  item: TodayItem; section: TodoSection; panel: 'send' | 'ask' | null
  onPanel: (m: 'send' | 'ask' | null) => void; onThread: (id: string) => void; onDone: (m: string) => void; onError: (e: unknown) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [edit, setEdit] = useState<Edit | null>(i.draft ? asEdit(i.draft) : null)
  const [instruction, setInstruction] = useState('')
  useEffect(() => { setEdit(i.draft ? asEdit(i.draft) : null) }, [i.draft])

  const run = (label: string, fn: () => Promise<string>) => {
    setBusy(label)
    fn().then(onDone).catch(onError).finally(() => setBusy(null))
  }
  const work = (body: unknown) => callApi<{ draftId?: string }>(`/api/work/${i.id}`, { method: 'POST', body })

  const send = () => run('send', async () => {
    if (!i.draft || !edit) throw new Error('There is no draft to send.')
    const r = oneRecipient(edit.to, edit.cc || null)
    if (r.removed.length) throw new Error(`To takes one company. Send ${r.removed.join(', ')} their own email.`)
    if (changed(edit, i.draft)) await work({ action: 'edit_draft', to: edit.to, cc: edit.cc || null, subject: edit.subject, body: edit.body })
    const { draftId } = await work({ action: 'prepare_send' })
    const out = await callApi<{ gmailMessageId?: string }>('/api/email/send', { method: 'POST', body: { draftId, toEmail: r.to, cc: r.cc, attachments: withRefs(i.draft.attachments) } })
    // The chase travels with the email; a failure to record it never undoes the send.
    const c = chaseDefault(i.draft)
    if (out?.gmailMessageId) await callApi('/api/followups', { method: 'POST', body: { draft_id: draftId, gmail_message_id: out.gmailMessageId, days: c.days, auto: c.auto } }).catch(() => null)
    await work({ action: 'sent' })
    return `Sent to ${r.to}.`
  })
  const ask = () => run('ask', async () => {
    if (i.draft && !instruction.trim()) throw new Error('Say what to change.')
    await callApi(`/api/work/${i.id}/ask`, { method: 'POST', body: { instruction: instruction.trim() || undefined } })
    setInstruction('')
    return i.draft ? `Draft rewritten: ${i.title}.` : `Draft ready: ${i.title}.`
  })
  const seen = () => run('seen', async () => { await callApi(`/api/today/${i.id}`, { method: 'POST', body: { action: 'seen' } }); return `Read: ${i.title}.` })
  const openThread = () => run('thread', async () => {
    const d = await callApi<{ item: ItemDetail }>(`/api/today/${i.id}`)
    const t = d.item.threads[0]
    if (!t) throw new Error('No email thread on this case.')
    onThread(t.id)
    return ''
  })

  const nexus = i.company_id ? `/nexus/cases?newCase=1&companyId=${i.company_id}` : '/nexus/cases'
  const paired = i.paired.length > 0
  const level = i.pending.level
  const meta = [i.client, i.insurer_name, i.deadline ? `due ${fmtDate(i.deadline)}` : null, (level === 'red' || level === 'amber') ? i.pending.reason.toLowerCase() : null].filter(Boolean).join(' · ')

  return (
    <div className="px-4 md:px-5 py-3 border-b border-trs-line last:border-b-0">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {(level === 'red' || level === 'amber') && <span className={`inline-block w-2 h-2 rounded-full ${level === 'red' ? 'bg-trs-neg' : 'bg-trs-warn'}`} />}
            <Chip>{CASE_TYPE[i.case_type] ?? i.case_type}</Chip>
            <span className="text-[12.5px] text-trs-muted truncate">{meta}</span>
          </div>
          <Link href={`/today/${i.id}`} className="block mt-1 text-[14.5px] font-medium leading-snug text-trs-ink no-underline hover:underline">{i.title}</Link>
          {i.needs_human && <p className="m-0 mt-1 text-[13px] text-trs-ink-2"><span className="text-trs-neg">Decide: </span>{i.needs_human}</p>}
          {!i.needs_human && i.draft && panel !== 'send' && <p className="m-0 mt-1 text-[13px] text-trs-ink-2 line-clamp-2">To {i.draft.to} · {i.draft.body.replace(/\{owner_name\}/g, '').split('\n').filter(Boolean).slice(0, 2).join(' ')}</p>}
          {!i.needs_human && !i.draft && i.next_action && <p className="m-0 mt-1 text-[13px] text-trs-ink-2">{i.next_action}</p>}
        </div>
        <div className="flex flex-wrap items-start md:justify-end gap-1.5">
          {section === 'send' && (paired
            ? <LinkBtn size="xs" level="primary" href={`/today/${i.id}`}>Review and send {1 + i.paired.length}</LinkBtn>
            : <Btn size="xs" level="primary" onClick={() => onPanel(panel === 'send' ? null : 'send')} aria-expanded={panel === 'send'}>{panel === 'send' ? 'Close' : 'Send'}</Btn>)}
          {section === 'send' && !paired && <Btn size="xs" onClick={() => onPanel('send')}>Edit</Btn>}
          {(section === 'send' || section === 'act') && <Btn size="xs" onClick={() => onPanel(panel === 'ask' ? null : 'ask')} aria-expanded={panel === 'ask'}>Ask AI</Btn>}
          {section === 'decide' && <LinkBtn size="xs" level="primary" href={`/today/${i.id}`}>Decide</LinkBtn>}
          {section === 'act' && <LinkBtn size="xs" href={`/today/${i.id}`}>Open</LinkBtn>}
          {section === 'read' && <Btn size="xs" loading={busy === 'seen'} onClick={seen}>Mark read</Btn>}
          {section !== 'read' && <LinkBtn size="xs" href={nexus}>Nexus</LinkBtn>}
          <Btn size="xs" level="tertiary" loading={busy === 'thread'} onClick={openThread}>Thread</Btn>
          <LaterMenu itemId={i.id} onSet={l => onDone(`${l}: ${i.title}.`)} onError={e => onError(new Error(e))} />
        </div>
      </div>

      {panel === 'send' && i.draft && edit && (
        <div className="mt-3 rounded-[10px] border border-trs-line bg-trs-canvas p-3 flex flex-col gap-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[12px] text-trs-muted">To<input className={inputCls} value={edit.to} onChange={e => setEdit({ ...edit, to: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-[12px] text-trs-muted">Cc<input className={inputCls} value={edit.cc} onChange={e => setEdit({ ...edit, cc: e.target.value })} /></label>
          </div>
          <label className="flex flex-col gap-1 text-[12px] text-trs-muted">Subject<input className={inputCls} value={edit.subject} onChange={e => setEdit({ ...edit, subject: e.target.value })} /></label>
          <textarea value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} rows={Math.min(18, Math.max(6, edit.body.split('\n').length + 1))}
            className="w-full min-w-0 rounded-[7px] border border-trs-line-2 bg-white px-3 py-2 text-[13.5px] leading-relaxed text-trs-ink outline-none focus:border-trs-ink resize-y" />
          {i.draft.attachments.length > 0 && <div className="text-[12px] text-trs-muted">Attached: {i.draft.attachments.map(a => a.filename).join(', ')}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <Btn size="xs" level="primary" loading={busy === 'send'} onClick={send}>Send now</Btn>
            <Btn size="xs" level="tertiary" onClick={() => { setEdit(asEdit(i.draft!)); onPanel(null) }}>Cancel</Btn>
            <span className="text-[12px] text-trs-muted">Sent as operations@ with your sign-off. {changed(edit, i.draft) ? 'Your edits are saved first.' : ''}</span>
          </div>
        </div>
      )}

      {panel === 'ask' && (
        <div className="mt-3 rounded-[10px] border border-trs-line bg-trs-canvas p-3 flex flex-col gap-2">
          <textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={2} autoFocus
            placeholder={i.draft ? 'What to change, for example: shorter, ask for the claims experience, move the deadline to Friday' : 'Optional: what the reply should say. Leave empty to let the agent read the thread and draft it.'}
            className="w-full min-w-0 rounded-[7px] border border-trs-line-2 bg-white px-3 py-2 text-[13.5px] text-trs-ink outline-none focus:border-trs-ink resize-y" />
          <div className="flex flex-wrap items-center gap-2">
            <Btn size="xs" level="primary" loading={busy === 'ask'} onClick={ask}>{i.draft ? 'Rewrite draft' : 'Draft the reply'}</Btn>
            <Btn size="xs" level="tertiary" onClick={() => onPanel(null)}>Cancel</Btn>
            <span className="text-[12px] text-trs-muted">{i.draft ? 'The draft is replaced; nothing is sent.' : 'The agent reads the thread and the client’s file; nothing is sent.'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
