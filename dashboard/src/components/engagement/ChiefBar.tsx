'use client'

/**
 * The Actions and AI groups of the context rail: who the thread waits on, the chaser date, a
 * button for each thing to do, the AI's suggestions, then what the AI can read and price. A button opens its drafted email here on the page, so the thread
 * stays scrollable beside it. A new policy enquiry lists one email per insurer per policy, each
 * with its own person; "Send" mails them one at a time, one address in To. Nothing sends without a click.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { callApi, errText } from '@/components/placement/shared'
import { draftBodyToHtml, emailReadyHtml } from '@/lib/email-body'
import { toProblem } from '@/lib/email/recipients'
import { addWorkingDays } from '@/lib/admin/b/cadence'
import type { Bar, BarDraft, BarRequest } from '@/lib/chief/bar'
import type { ReadPlan } from '@/lib/chief/read'
import { doneSummary } from '@/lib/chief/suggest-links'
import { Btn, LinkBtn, inputCls, textareaCls } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'
import { ActionItem, AiRow, Buttons, Group } from './rail-bits'
import { firstPaintKey, takeFirstPaint } from './first-paint'

const OPS_EMAIL = 'operations@trade-risksol.com'
/** The shared field at rail height (32, the rail's button height). */
const FIELD = cn(inputCls, 'h-8 px-2.5')
const AREA = cn(textareaCls, 'px-2.5 py-1.5 leading-[1.5]')
/** A quiet underlined text action inside a line of copy. */
const TEXT_LINK = 'bg-transparent border-0 p-0 text-small underline underline-offset-[3px] cursor-pointer'

const dayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

type Sent = { gmailMessageId?: string | null; gmailThreadId?: string | null; rfc822MessageId?: string | null; fromEmail?: string | null; subject?: string | null }

/** Mails one draft. One address in To; the send route is the only way out. */
async function mail(draftId: string, to: string, subject: string, html: string, from: string, attachments: BarDraft['attachments'], cc?: string[]): Promise<Sent> {
  return callApi<Sent>('/api/email/send', { method: 'POST', body: { draftId, toEmail: to, customSubject: subject, htmlBody: html, fromEmail: from, cc: cc?.length ? cc : undefined, attachments: attachments.length ? attachments : undefined } })
}

export function ChiefBar({ threadId, refreshKey, onOpenChange, actionsFooter, aiExtras, beforeRead }: {
  threadId: string
  /** Changes when a new message arrives on the thread. */
  refreshKey?: string | null
  /** Tells the rail a draft is open, so it can widen. */
  onOpenChange?: (open: boolean) => void
  /** The quiet link line at the end of Actions (add a to-do, add to a case). */
  actionsFooter?: React.ReactNode
  /** More AI rows from the rail (summary, draft reply), after Read thread. */
  aiExtras?: React.ReactNode
  /** Runs first when Read thread is pressed (an insurer thread names its client); its line shows under the row. */
  beforeRead?: () => Promise<string>
}) {
  const [readNote, setReadNote] = useState<string | null>(null)
  useEffect(() => { setReadNote(null) }, [threadId])
  const [bar, setBar] = useState<Bar | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [from, setFrom] = useState(OPS_EMAIL)
  const [outcome, setOutcome] = useState<Record<string, { summary: string; quotationId: string }>>({})
  /** After Prepare insurer emails: the open placement already lives on another thread of this client. */
  const [elsewhere, setElsewhere] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setBar(await callApi<Bar>(`/api/threads/${threadId}/bar`)); setError(null) } catch (e) { setError(errText(e)) }
  }, [threadId])

  // The open thread's bar comes with the page on first paint (first-paint.ts); every other read is the API's.
  useEffect(() => {
    setOpen(null); setElsewhere(null)
    const kept = takeFirstPaint<Bar>(firstPaintKey.bar(threadId))
    if (kept) { setBar(kept); setError(null) } else { setBar(null); void load() }
  }, [load, refreshKey, threadId])
  useEffect(() => { onOpenChange?.(open !== null) }, [open, onOpenChange])
  useEffect(() => {
    fetch('/api/email/available-senders', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then((rows: { email: string; type: string }[]) => {
      if (Array.isArray(rows) && rows.length) setFrom(rows.find(r => r.type === 'personal')?.email ?? rows[0].email)
    }).catch(() => {})
  }, [])

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setError(null)
    try { await fn(); await load() } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  const post = (body: unknown) => callApi<{ draftId?: string }>(`/api/threads/${threadId}/bar`, { method: 'POST', body })

  const chaser = () => run('chaser', async () => { const r = await post({ action: 'chaser' }); if (r.draftId) setOpen(r.draftId) })
  const reply = () => run('reply', async () => {
    const r = await callApi<{ draftId?: string | null; error?: string }>('/api/crm/next-reply', { method: 'POST', body: { threadId } })
    if (r.error) throw new Error(r.error)
    if (r.draftId) setOpen(r.draftId)
  })
  const prepare = () => run('prepare', async () => {
    const r = await callApi<{ status: string; placement_id?: string; client_thread_id?: string | null }>('/api/placements/auto', { method: 'POST', body: { thread_id: threadId } })
    if (r.status === 'no_lines') throw new Error('No policy found in this email. Open Quotes to set it up.')
    if (r.status === 'no_company' || r.status === 'no_request') throw new Error('Link this thread to a client first.')
    // An open placement for this client already exists. On this thread the reload shows it; on another, link there.
    if (r.status === 'exists' && r.client_thread_id && r.client_thread_id !== threadId) setElsewhere(r.client_thread_id)
  })
  const snooze = () => run('snooze', async () => { await post({ action: 'snooze', until: addWorkingDays(new Date(`${bar!.today}T00:00:00Z`), 3).toISOString().slice(0, 10) }) })
  const noAction = () => run('none', async () => { await post({ action: 'no_action' }) })
  const clear = () => run('clear', async () => { await post({ action: 'clear' }) })
  const suggest = (key: string) => run(key, async () => {
    const r = await callApi<{ quotationId: string; summary: string }>(`/api/threads/${threadId}/bar`, { method: 'POST', body: { action: 'suggest', key } })
    setOutcome(o => ({ ...o, [key]: r }))
  })
  const dismiss = (key: string) => run(`dismiss:${key}`, async () => { await post({ action: 'dismiss', key }) })
  const read = () => run('read', async () => {
    setReadNote(null)
    if (beforeRead) setReadNote(await beforeRead())
    await post({ action: 'read' })
  })
  const execute = (stepIds: string[]) => run('execute', async () => { await post({ action: 'execute', stepIds }) })
  const step = (stepId: string, status: 'todo' | 'done') => run(`step:${stepId}`, async () => { await post({ action: 'step', stepId, status }) })

  const st = bar?.state ?? null
  const chaseOpen = !!bar?.drafts.some(d => d.label === 'Chaser')
  const doneOf = (s: Bar['suggestions'][number]) => outcome[s.key] ?? (s.done ? { summary: doneSummary(s), quotationId: s.done.quotationId } : null)
  const pending = (bar?.suggestions ?? []).filter(s => !doneOf(s))
  const finished = (bar?.suggestions ?? []).filter(s => doneOf(s))
  const yesLabel = (s: Bar['suggestions'][number]) => busy === s.key ? 'Pricing…' : s.yes.length <= 8 ? `Yes, ${s.yes.charAt(0).toLowerCase()}${s.yes.slice(1)}` : 'Yes'

  return (
    <>
      <Group label="Actions" ariaLabel="Next actions">
        {error && !bar && <p className="m-0 text-body text-trs-neg">{error}</p>}
        {!bar && !error && <p className="m-0 text-body text-trs-muted">Loading…</p>}
        {bar && st && (
          bar.hold?.noAction ? (
            <ActionItem eyebrow="Held" title="No action needed">
              <Buttons><Btn size="xs" level="tertiary" onClick={clear} disabled={!!busy}>Undo</Btn></Buttons>
            </ActionItem>
          ) : (
            <ActionItem
              eyebrow={st.kind === 'reply' ? 'Reply due' : st.kind === 'waiting' ? (st.overdue ? 'Chaser due' : 'Waiting') : 'Status'}
              title={st.kind === 'reply' ? `Reply to ${st.person ?? st.email ?? 'sender'}` : st.kind === 'waiting' ? `Waiting on ${st.person ?? st.email ?? 'the other side'}` : 'Nothing waiting'}
              meta={st.kind === 'reply'
                ? [st.side === 'insurer' ? 'Insurer' : 'Client', st.since ? dayLabel(st.since) : null].filter(Boolean).join(' · ')
                : st.kind === 'waiting'
                  ? [st.sentAt ? `Sent ${dayLabel(st.sentAt)}` : null, st.side === 'insurer' ? 'Insurer' : 'Client', st.overdue ? `chaser due ${dayLabel(st.chaseDue)}` : `chaser ${dayLabel(st.chaseDue)} · ${st.workingDaysLeft} working day${st.workingDaysLeft === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
                  : bar.autoReply ? `Auto-reply from ${bar.autoReply.from}` : null}
              alert={st.kind === 'waiting' && st.overdue}>
              {bar.autoReply && st.kind !== 'none' && <p className="m-0 mt-0.5 text-small text-trs-muted">Auto-reply from {bar.autoReply.from}. Timer unchanged.</p>}
              <Buttons>
                {st.kind === 'waiting' && !chaseOpen && (
                  <Btn size="xs" level="primary" onClick={chaser} disabled={!!busy || !st.email}>{busy === 'chaser' ? 'Preparing…' : 'Send chaser'}</Btn>
                )}
                {st.kind === 'waiting' && <Btn size="xs" level="tertiary" onClick={snooze} disabled={!!busy}>Snooze 3 days</Btn>}
                {st.kind === 'reply' && bar.drafts.length === 0 && (
                  <Btn size="xs" level="primary" onClick={reply} disabled={!!busy}>{busy === 'reply' ? 'Writing…' : 'Draft reply'}</Btn>
                )}
                {bar.enquiry?.stage === 'detected' && (
                  <Btn size="xs" level="primary" onClick={prepare} disabled={!!busy}>{busy === 'prepare' ? 'Preparing…' : 'Prepare insurer emails'}</Btn>
                )}
                {bar.caseItem && <LinkBtn size="xs" level="tertiary" href={`/today/${bar.caseItem.id}`}>Open case</LinkBtn>}
                {st.kind !== 'none' && <Btn size="xs" level="tertiary" onClick={noAction} disabled={!!busy}>No action</Btn>}
              </Buttons>
              {elsewhere && <p className="m-0 mt-2 text-small text-trs-muted">The insurer emails for this client are already prepared on another thread. <Link href={`/engagement?lead=${elsewhere}`} className="underline underline-offset-[3px] text-trs-ink">Open that thread →</Link></p>}
              {bar.hold?.until && <button type="button" onClick={clear} className={cn(TEXT_LINK, 'mt-2 text-trs-muted')}>Cancel snooze</button>}
            </ActionItem>
          )
        )}
        {error && bar && <p className="m-0 mb-3 text-body text-trs-neg" role="alert">{error}</p>}

        {pending.map(s => (
          <ActionItem key={s.key} eyebrow="Suggested" title={s.title} meta={s.detail}>
            <Buttons>
              {s.kind === 'eb_scenarios'
                ? <LinkBtn size="xs" level="primary" href={`/eb?thread=${threadId}`}>Open census</LinkBtn>
                : <Btn size="xs" level="primary" onClick={() => suggest(s.key)} disabled={!!busy}>{yesLabel(s)}</Btn>}
              <Btn size="xs" level="tertiary" onClick={() => dismiss(s.key)} disabled={!!busy}>Not now</Btn>
            </Buttons>
          </ActionItem>
        ))}
        {finished.map(s => {
          const d = doneOf(s)!
          return (
            <ActionItem key={s.key} eyebrow="Done" title={s.title} meta={d.summary}>
              <Buttons>
                <LinkBtn size="xs" level="primary" href={`/eb?thread=${threadId}`}>New analysis</LinkBtn>
              </Buttons>
            </ActionItem>
          )
        })}

        {bar && bar.drafts.length > 0 && (
          <div className="mb-6">
            <p className="m-0 mb-1.5 text-small text-trs-subtle">Drafts</p>
            <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
              {bar.drafts.map(d => (
                <li key={d.id}>
                  <DraftRow draft={d} from={from} open={open === d.id} onToggle={() => setOpen(v => v === d.id ? null : d.id)} onDone={() => { setOpen(null); void load() }} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {bar?.enquiry && bar.enquiry.stage !== 'detected' && (
          <Enquiry enquiry={bar.enquiry} from={from} open={open} setOpen={setOpen} reload={load} />
        )}

        {actionsFooter}
      </Group>

      <Group label="AI">
        <AiRow title="Read thread" detail="Messages, files, policy → next steps as a checklist" action={bar?.read ? 'Read again' : 'Read thread'} onClick={read} busy={busy === 'read'} disabled={!bar}>
          {readNote && <p className="m-0 mb-1 text-small text-trs-muted">{readNote}</p>}
          {bar?.read && <ReadSteps plan={bar.read} busy={busy} onExecute={execute} onStep={step} onOpenDraft={id => setOpen(id)} />}
        </AiRow>
        {aiExtras}
      </Group>
    </>
  )
}

/** The read plan: a checklist of emails (one person each) and actions; Draft writes the ticked emails. */
function ReadSteps({ plan, busy, onExecute, onStep, onOpenDraft }: {
  plan: ReadPlan; busy: string | null; onExecute: (ids: string[]) => void; onStep: (id: string, status: 'todo' | 'done') => void; onOpenDraft: (draftId: string) => void
}) {
  const proposed = plan.steps.filter(s => s.status === 'proposed')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(proposed.map(s => s.id)))
  useEffect(() => { setPicked(new Set(plan.steps.filter(s => s.status === 'proposed').map(s => s.id))) }, [plan.at, plan.steps])
  const chosen = proposed.filter(s => picked.has(s.id))
  const emails = chosen.filter(s => s.kind === 'email').length, actions = chosen.length - emails
  const who = (s: ReadPlan['steps'][number]) => s.kind === 'email' ? `Email · ${s.to?.name ?? s.to?.email ?? ''}${s.party === 'insurer' && s.insurer ? ` · ${s.insurer}` : s.party === 'client' ? ' · client' : ''}` : 'Action'
  return (
    <div className="mt-1" aria-label="Next steps">
      <p className="m-0 text-body font-medium text-trs-ink">Next steps</p>
      {plan.summary && <p className="m-0 mt-1 text-body text-trs-ink-2">{plan.summary}</p>}
      {plan.situation && <p className="m-0 mt-1 text-small whitespace-pre-line text-trs-muted">{plan.situation}</p>}
      <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-1.5">
        {plan.steps.map(s => (
          <li key={s.id} className="flex items-start gap-2 text-body">
            {s.status === 'proposed' && <input type="checkbox" className="mt-[3px]" checked={picked.has(s.id)} onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n })} aria-label={s.title} />}
            {s.status === 'todo' && <input type="checkbox" className="mt-[3px]" checked={false} onChange={() => onStep(s.id, 'done')} aria-label={`Done: ${s.title}`} disabled={!!busy} />}
            {s.status === 'done' && <input type="checkbox" className="mt-[3px]" checked readOnly onChange={() => onStep(s.id, 'todo')} aria-label={`Undo: ${s.title}`} disabled={!!busy} />}
            {s.status === 'drafted' && <span className="mt-[3px] inline-block w-[13px] text-center text-small text-trs-muted" aria-hidden>✎</span>}
            <div className="min-w-0">
              <p className={cn('m-0 text-trs-ink', s.status === 'done' && 'line-through')}>{s.title}</p>
              <p className="m-0 text-small text-trs-muted">{who(s)}{s.detail ? ` — ${s.detail}` : ''}</p>
              {s.status === 'drafted' && s.draftId && <button type="button" onClick={() => onOpenDraft(s.draftId!)} className={cn(TEXT_LINK, 'text-trs-ink')}>Drafted · open</button>}
            </div>
          </li>
        ))}
      </ul>
      {proposed.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Btn size="xs" level="primary" onClick={() => onExecute(chosen.map(s => s.id))} disabled={!!busy || chosen.length === 0}>
            {busy === 'execute' ? 'Drafting…' : [emails ? `Draft ${emails} email${emails === 1 ? '' : 's'}` : null, actions ? `${actions} action${actions === 1 ? '' : 's'} to do` : null].filter(Boolean).join(' · ') || 'Nothing ticked'}
          </Btn>
          <span className="text-small text-trs-muted">Each email is its own draft, one address in To. Nothing sends.</span>
        </div>
      )}
    </div>
  )
}

/** One drafted email: a row, and on click the email itself, editable, with its own Send. */
function DraftRow({ draft, from, open, onToggle, onDone }: { draft: BarDraft; from: string; open: boolean; onToggle: () => void; onDone: () => void }) {
  const [to, setTo] = useState(draft.to)
  const [cc, setCc] = useState(draft.cc)
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [busy, setBusy] = useState<'send' | 'discard' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    const problem = toProblem(to)
    if (problem) { setError(problem); return }
    if (!to.includes('@')) { setError('Add a recipient.'); return }
    if (!body.trim()) { setError('The message is empty.'); return }
    setBusy('send'); setError(null)
    try {
      await callApi(`/api/drafts/${draft.id}`, { method: 'PATCH', body: { to, cc: cc || null, subject, body } })
      const { draftId } = await callApi<{ draftId: string }>(`/api/drafts/${draft.id}`, { method: 'POST', body: { action: 'prepare' } })
      const copy = cc.split(/[,;\s]+/).map(x => x.trim()).filter(x => x.includes('@'))
      await callApi('/api/email/send', { method: 'POST', body: { draftId, toEmail: to.trim(), customSubject: subject, fromEmail: from, cc: copy.length ? copy : undefined, attachments: draft.attachments.length ? draft.attachments : undefined } })
      if (draft.workItemId) await callApi(`/api/work/${draft.workItemId}`, { method: 'POST', body: { action: 'sent' } }).catch(() => null)
      onDone()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function discard() {
    setBusy('discard'); setError(null)
    try { await callApi('/api/engagement/draft', { method: 'PATCH', body: { draftId: draft.id, status: 'rejected' } }); onDone() }
    catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  return (
    <div className="rounded overflow-hidden border border-trs-line">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left bg-transparent border-0 px-3 py-2 cursor-pointer">
        <span className="block text-body font-medium text-trs-ink">{draft.label}</span>
        <span className="block text-small truncate text-trs-muted">To {draft.person ?? draft.to}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-1.5">
          {draft.removed.length > 0 && <p className="m-0 text-small text-trs-neg">Removed from To: {draft.removed.join(', ')}. Each company gets its own email.</p>}
          <Labelled label="To"><input aria-label="To" value={to} onChange={e => setTo(e.target.value)} className={FIELD} /></Labelled>
          {draft.person && <p className="m-0 text-small text-trs-muted">{draft.person}</p>}
          <Labelled label="Cc"><input aria-label="Cc" value={cc} onChange={e => setCc(e.target.value)} className={FIELD} /></Labelled>
          <Labelled label="Subject"><input aria-label="Subject" value={subject} onChange={e => setSubject(e.target.value)} className={FIELD} /></Labelled>
          <textarea aria-label="Message" value={body} onChange={e => setBody(e.target.value)} rows={Math.min(18, Math.max(7, body.split('\n').length + 1))} className={AREA} />
          {draft.attachments.length > 0 && <p className="m-0 text-small text-trs-muted">Attached: {draft.attachments.map(a => a.filename).join(', ')}</p>}
          {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}
          <div className="flex gap-1.5">
            <Btn size="xs" level="primary" onClick={send} disabled={!!busy}>{busy === 'send' ? 'Sending…' : 'Send'}</Btn>
            <Btn size="xs" onClick={discard} disabled={!!busy}>Discard</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

const Labelled = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-2"><span className="w-[52px] flex-shrink-0 text-small text-trs-muted">{label}</span><div className="flex-1 min-w-0">{children}</div></div>
)

type RecipientPhase = 'queued' | 'sending' | 'sent' | 'error'

/** The enquiry: per policy, the people it goes to and the one message; each person gets their own email. */
function Enquiry({ enquiry, from, open, setOpen, reload }: { enquiry: NonNullable<Bar['enquiry']>; from: string; open: string | null; setOpen: (f: (v: string | null) => string | null) => void; reload: () => Promise<void> }) {
  const [sendingAll, setSendingAll] = useState(false)
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({})
  const [phases, setPhases] = useState<Record<string, RecipientPhase>>({})
  const [error, setError] = useState<string | null>(null)

  const textOf = (r: BarRequest) => edits[r.draftId] ?? { subject: r.subject, body: r.body }

  async function sendOne(draftId: string, dispatchId: string, to: string, r: BarRequest): Promise<boolean> {
    const t = textOf(r)
    setPhases(p => ({ ...p, [dispatchId]: 'sending' }))
    try {
      await callApi('/api/engagement/draft', { method: 'PATCH', body: { draftId, status: 'approved', content: t.body } })
      const sent = await mail(draftId, to, t.subject, emailReadyHtml(draftBodyToHtml(t.body)), from, r.attachments)
      await callApi('/api/placements/dispatches/sent', { method: 'POST', body: { draft_id: draftId, gmail_thread_id: sent.gmailThreadId ?? null, gmail_message_id: sent.gmailMessageId ?? null, rfc822_message_id: sent.rfc822MessageId ?? null, from_email: sent.fromEmail ?? from, subject: sent.subject ?? t.subject } })
      setPhases(p => ({ ...p, [dispatchId]: 'sent' }))
      return true
    } catch (e) {
      setPhases(p => ({ ...p, [dispatchId]: 'error' }))
      setError(`${r.recipients.find(x => x.dispatchId === dispatchId)?.insurer ?? to}: ${errText(e)}`)
      return false
    }
  }

  /** One email per insurer, one after another. A failed one stays listed; the others still go. */
  async function sendRequest(r: BarRequest) {
    const t = textOf(r)
    if (r.recipients.length === 1) { await sendOne(r.draftId, r.recipients[0].dispatchId, r.recipients[0].email, r); return }
    const { clones } = await callApi<{ clones: { draft_id: string; dispatch_id: string; to_email: string }[] }>(`/api/placements/drafts/${r.draftId}/fanout`, { method: 'POST', body: { subject: t.subject, body: t.body } })
    for (const c of clones) await sendOne(c.draft_id, c.dispatch_id, c.to_email, r)
  }

  async function sendAll(list: BarRequest[]) {
    setSendingAll(true); setError(null)
    try { for (const r of list) await sendRequest(r) } catch (e) { setError(errText(e)) }
    setSendingAll(false)
    await reload()
  }

  async function removeInsurer(dispatchId: string) {
    setError(null)
    try { await callApi(`/api/placements/dispatches/${dispatchId}`, { method: 'PATCH', body: { status: 'withdrawn' } }); await reload() } catch (e) { setError(errText(e)) }
  }

  const ready = enquiry.requests.filter(r => r.recipients.length > 0)
  return (
    <div className="mt-3 pt-0">
      <p className="m-0 text-body font-medium text-trs-ink">New policy enquiry</p>
      <p className="m-0 mt-0.5 text-body tabular-nums text-trs-ink-2">
        {enquiry.policies} polic{enquiry.policies === 1 ? 'y' : 'ies'} · {enquiry.emails} email{enquiry.emails === 1 ? '' : 's'} to send{enquiry.sent ? ` · ${enquiry.sent} sent` : ''}
      </p>
      {enquiry.awaitingDetails.length > 0 && <p className="m-0 mt-0.5 text-small text-trs-muted">On hold for client details: {enquiry.awaitingDetails.join(', ')}</p>}

      <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-1.5">
        {ready.map(r => {
          const key = `req:${r.draftId}`
          const t = textOf(r)
          return (
            <li key={r.draftId} className="rounded border border-trs-line px-3 py-2">
              <p className="m-0 text-body font-medium text-trs-ink">{r.line}</p>
              <ul className="m-0 mt-1 p-0 list-none flex flex-col gap-1">
                {r.recipients.map(p => (
                  <li key={p.dispatchId} className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-small text-trs-muted">
                      <span className="block truncate">{p.person ? `${p.person} · ` : ''}{p.insurer}</span>
                      <span className="block truncate text-trs-muted">{p.email || 'No address on file'}</span>
                    </span>
                    {phases[p.dispatchId]
                      ? <span className={cn('flex-shrink-0 text-small', phases[p.dispatchId] === 'error' ? 'text-trs-neg' : 'text-trs-muted')}>{{ queued: 'Queued', sending: 'Sending…', sent: 'Sent', error: 'Not sent' }[phases[p.dispatchId]]}</span>
                      : <button type="button" onClick={() => removeInsurer(p.dispatchId)} disabled={sendingAll} className={cn(TEXT_LINK, 'flex-shrink-0 text-trs-muted')} aria-label={`Remove ${p.insurer}`}>Remove</button>}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Btn size="xs" aria-expanded={open === key} onClick={() => setOpen(v => v === key ? null : key)}>{open === key ? 'Hide message' : 'See message'}</Btn>
                <Btn size="xs" level="primary" disabled={sendingAll || r.recipients.some(p => !p.email)} onClick={() => sendAll([r])}>Send {r.recipients.length} separately</Btn>
              </div>
              {open === key && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <Labelled label="Subject"><input aria-label="Subject" value={t.subject} onChange={e => setEdits(x => ({ ...x, [r.draftId]: { ...t, subject: e.target.value } }))} className={FIELD} /></Labelled>
                  <textarea aria-label="Message" value={t.body} onChange={e => setEdits(x => ({ ...x, [r.draftId]: { ...t, body: e.target.value } }))} rows={Math.min(18, Math.max(7, t.body.split('\n').length + 1))} className={AREA} />
                  {r.attachments.length > 0 && <p className="m-0 text-small text-trs-muted">Attached: {r.attachments.map(a => a.filename).join(', ')}</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {error && <p className="m-0 mt-2 text-body text-trs-neg" role="alert">{error}</p>}
      {ready.length > 1 && (
        <Btn size="xs" level="primary" className="mt-2" disabled={sendingAll} onClick={() => sendAll(ready)}>
          {sendingAll ? 'Sending…' : `Send all ${enquiry.emails} separately`}
        </Btn>
      )}
    </div>
  )
}
