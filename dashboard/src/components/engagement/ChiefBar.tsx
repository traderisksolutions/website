'use client'

/**
 * Next actions on a thread, at the top of the context rail: who it waits on, the chaser date, and
 * a button for each thing to do. A button opens its drafted email here on the page, so the thread
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

const INK = '#0f1412'
const BODY = '#2a332f'
const MUTED = '#4a5550'
const HAIR = '#e6e8e4'
const ERROR = '#a1242f'
const PRIMARY = '#1a2e26'
const OPS_EMAIL = 'operations@trade-risksol.com'
const SECOND = 'inline-flex items-center rounded-[9px] border px-2.5 py-1.5 text-[13px] bg-white cursor-pointer transition-colors hover:border-[#0f1412] disabled:opacity-50'
const MAIN = 'inline-flex items-center rounded-[9px] border-0 px-3 py-1.5 text-[13px] text-white cursor-pointer disabled:opacity-50'
const FIELD = 'w-full rounded-[7px] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#0f1412]'

const dayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

type Sent = { gmailMessageId?: string | null; gmailThreadId?: string | null; rfc822MessageId?: string | null; fromEmail?: string | null; subject?: string | null }

/** Mails one draft. One address in To; the send route is the only way out. */
async function mail(draftId: string, to: string, subject: string, html: string, from: string, attachments: BarDraft['attachments'], cc?: string[]): Promise<Sent> {
  return callApi<Sent>('/api/email/send', { method: 'POST', body: { draftId, toEmail: to, customSubject: subject, htmlBody: html, fromEmail: from, cc: cc?.length ? cc : undefined, attachments: attachments.length ? attachments : undefined } })
}

export function ChiefBar({ threadId, refreshKey, onOpenChange }: {
  threadId: string
  /** Changes when a new message arrives on the thread. */
  refreshKey?: string | null
  /** Tells the rail a draft is open, so it can widen. */
  onOpenChange?: (open: boolean) => void
}) {
  const [bar, setBar] = useState<Bar | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [from, setFrom] = useState(OPS_EMAIL)
  const [outcome, setOutcome] = useState<Record<string, { summary: string; quotationId: string }>>({})

  const load = useCallback(async () => {
    try { setBar(await callApi<Bar>(`/api/threads/${threadId}/bar`)); setError(null) } catch (e) { setError(errText(e)) }
  }, [threadId])

  useEffect(() => { setBar(null); setOpen(null); void load() }, [load, refreshKey])
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
    const r = await callApi<{ status: string }>('/api/placements/auto', { method: 'POST', body: { thread_id: threadId } })
    if (r.status === 'no_lines') throw new Error('No policy found in this email. Open Quotes to set it up.')
    if (r.status === 'no_company' || r.status === 'no_request') throw new Error('Link this thread to a client first.')
  })
  const snooze = () => run('snooze', async () => { await post({ action: 'snooze', until: addWorkingDays(new Date(`${bar!.today}T00:00:00Z`), 3).toISOString().slice(0, 10) }) })
  const noAction = () => run('none', async () => { await post({ action: 'no_action' }) })
  const clear = () => run('clear', async () => { await post({ action: 'clear' }) })
  const suggest = (key: string) => run(key, async () => {
    const r = await callApi<{ quotationId: string; summary: string }>(`/api/threads/${threadId}/bar`, { method: 'POST', body: { action: 'suggest', key } })
    setOutcome(o => ({ ...o, [key]: r }))
  })
  const dismiss = (key: string) => run(`dismiss:${key}`, async () => { await post({ action: 'dismiss', key }) })

  if (error && !bar) return <Shell><p className="m-0 text-[13px]" style={{ color: ERROR }}>{error}</p></Shell>
  if (!bar) return <Shell><p className="m-0 text-[13px]" style={{ color: MUTED }}>Loading…</p></Shell>

  const st = bar.state
  const chaseOpen = bar.drafts.some(d => d.label === 'Chaser')

  return (
    <Shell>
      {bar.hold?.noAction ? (
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-[13px]" style={{ color: BODY }}>No action needed</p>
          <button type="button" className={SECOND} style={{ borderColor: HAIR, color: INK }} onClick={clear} disabled={!!busy}>Undo</button>
        </div>
      ) : (
        <>
          {st.kind === 'reply' && <Status main={`Reply to ${st.person ?? st.email ?? 'sender'}`} sub={[st.side === 'insurer' ? 'Insurer' : 'Client', st.since ? dayLabel(st.since) : null].filter(Boolean).join(' · ')} />}
          {st.kind === 'waiting' && (
            <Status
              main={`Waiting on ${st.person ?? st.email ?? 'the other side'}`}
              sub={[st.sentAt ? `Sent ${dayLabel(st.sentAt)}` : null, st.side === 'insurer' ? 'Insurer' : 'Client'].filter(Boolean).join(' · ')}
              timer={st.overdue ? `Chaser due ${dayLabel(st.chaseDue)}` : `Chaser ${dayLabel(st.chaseDue)} · ${st.workingDaysLeft} working day${st.workingDaysLeft === 1 ? '' : 's'}`}
              alert={st.overdue}
            />
          )}
          {st.kind === 'none' && <Status main="Nothing waiting" />}
          {bar.autoReply && <p className="m-0 mt-1.5 text-[12.5px]" style={{ color: MUTED }}>Auto-reply from {bar.autoReply.from}. Timer unchanged.</p>}

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {st.kind === 'waiting' && !chaseOpen && (
              <button type="button" className={st.overdue ? MAIN : SECOND} style={st.overdue ? { background: PRIMARY } : { borderColor: HAIR, color: INK }} onClick={chaser} disabled={!!busy || !st.email}>{busy === 'chaser' ? 'Preparing…' : 'Send chaser'}</button>
            )}
            {st.kind === 'waiting' && <button type="button" className={SECOND} style={{ borderColor: HAIR, color: INK }} onClick={snooze} disabled={!!busy}>Snooze 3 days</button>}
            {st.kind === 'reply' && bar.drafts.length === 0 && (
              <button type="button" className={MAIN} style={{ background: PRIMARY }} onClick={reply} disabled={!!busy}>{busy === 'reply' ? 'Writing…' : 'Draft reply'}</button>
            )}
            {bar.enquiry?.stage === 'detected' && (
              <button type="button" className={MAIN} style={{ background: PRIMARY }} onClick={prepare} disabled={!!busy}>{busy === 'prepare' ? 'Preparing…' : 'Prepare insurer emails'}</button>
            )}
            {bar.caseItem && <Link href={`/today/${bar.caseItem.id}`} className={`${SECOND} no-underline`} style={{ borderColor: HAIR, color: INK }}>Open case</Link>}
            {st.kind !== 'none' && <button type="button" className={SECOND} style={{ borderColor: HAIR, color: INK }} onClick={noAction} disabled={!!busy}>No action</button>}
          </div>
          {bar.hold?.until && <button type="button" onClick={clear} className="mt-1.5 bg-transparent border-0 p-0 text-[12.5px] underline underline-offset-[3px] cursor-pointer" style={{ color: MUTED }}>Cancel snooze</button>}
        </>
      )}
      {error && <p className="m-0 mt-2 text-[13px]" style={{ color: ERROR }} role="alert">{error}</p>}

      {(bar.suggestions?.length ?? 0) > 0 && (
        <ul className="m-0 mt-3 p-0 list-none flex flex-col gap-1.5" aria-label="Suggested">
          {bar.suggestions.map(s => {
            const done = outcome[s.key] ?? (s.done ? { summary: `Priced from this file · ${s.done.members} members`, quotationId: s.done.quotationId } : null)
            return (
              <li key={s.key} className="rounded-[10px] border px-3 py-2.5" style={{ borderColor: HAIR }}>
                <p className="m-0 text-[13px] font-medium" style={{ color: INK }}>{s.title}</p>
                <p className="m-0 mt-0.5 text-[12.5px] break-words" style={{ color: MUTED }}>{s.detail}</p>
                {done ? (
                  <p className="m-0 mt-1.5 text-[12.5px]" style={{ color: BODY }}>{done.summary} · <Link href={`/pricing-matrix/quote/${done.quotationId}/plans`} style={{ color: INK }}>Open plans</Link></p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" className={MAIN} style={{ background: PRIMARY }} onClick={() => suggest(s.key)} disabled={!!busy}>{busy === s.key ? 'Pricing…' : `Yes, ${s.yes.charAt(0).toLowerCase()}${s.yes.slice(1)}`}</button>
                    <button type="button" className={SECOND} style={{ borderColor: HAIR, color: INK }} onClick={() => dismiss(s.key)} disabled={!!busy}>Not now</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {bar.drafts.length > 0 && (
        <ul className="m-0 mt-3 p-0 list-none flex flex-col gap-1.5">
          {bar.drafts.map(d => (
            <li key={d.id}>
              <DraftRow draft={d} from={from} open={open === d.id} onToggle={() => setOpen(v => v === d.id ? null : d.id)} onDone={() => { setOpen(null); void load() }} />
            </li>
          ))}
        </ul>
      )}

      {bar.enquiry && bar.enquiry.stage !== 'detected' && (
        <Enquiry enquiry={bar.enquiry} from={from} open={open} setOpen={setOpen} reload={load} />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] px-4 py-3.5 bg-white" style={{ border: `1px solid ${INK}` }} aria-label="Next actions">
      <p className="m-0 mb-1.5 text-[12px]" style={{ color: MUTED }}>Next actions</p>
      {children}
    </section>
  )
}

function Status({ main, sub, timer, alert }: { main: string; sub?: string; timer?: string; alert?: boolean }) {
  return (
    <>
      <p className="m-0 text-[15px] font-medium leading-[1.3] break-words" style={{ color: INK }}>{main}</p>
      {sub && <p className="m-0 mt-0.5 text-[13px]" style={{ color: BODY }}>{sub}</p>}
      {timer && <p className="m-0 mt-1 text-[13px] tabular-nums" style={{ color: alert ? ERROR : BODY, fontWeight: alert ? 500 : 400 }}>{timer}</p>}
    </>
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
    <div className="rounded-[10px] overflow-hidden" style={{ border: `1px solid ${HAIR}` }}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left bg-transparent border-0 px-3 py-2 cursor-pointer">
        <span className="block text-[13px] font-medium" style={{ color: INK }}>{draft.label}</span>
        <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>To {draft.person ?? draft.to}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-1.5">
          {draft.removed.length > 0 && <p className="m-0 text-[12.5px]" style={{ color: ERROR }}>Removed from To: {draft.removed.join(', ')}. Each company gets its own email.</p>}
          <Labelled label="To"><input aria-label="To" value={to} onChange={e => setTo(e.target.value)} className={FIELD} style={{ border: `1px solid ${HAIR}`, color: INK }} /></Labelled>
          {draft.person && <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>{draft.person}</p>}
          <Labelled label="Cc"><input aria-label="Cc" value={cc} onChange={e => setCc(e.target.value)} className={FIELD} style={{ border: `1px solid ${HAIR}`, color: INK }} /></Labelled>
          <Labelled label="Subject"><input aria-label="Subject" value={subject} onChange={e => setSubject(e.target.value)} className={FIELD} style={{ border: `1px solid ${HAIR}`, color: INK }} /></Labelled>
          <textarea aria-label="Message" value={body} onChange={e => setBody(e.target.value)} rows={Math.min(18, Math.max(7, body.split('\n').length + 1))} className={`${FIELD} resize-y leading-[1.5]`} style={{ border: `1px solid ${HAIR}`, color: INK }} />
          {draft.attachments.length > 0 && <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Attached: {draft.attachments.map(a => a.filename).join(', ')}</p>}
          {error && <p className="m-0 text-[13px]" style={{ color: ERROR }} role="alert">{error}</p>}
          <div className="flex gap-1.5">
            <button type="button" className={MAIN} style={{ background: PRIMARY }} onClick={send} disabled={!!busy}>{busy === 'send' ? 'Sending…' : 'Send'}</button>
            <button type="button" className={SECOND} style={{ borderColor: HAIR, color: INK }} onClick={discard} disabled={!!busy}>Discard</button>
          </div>
        </div>
      )}
    </div>
  )
}

const Labelled = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-2"><span className="w-[52px] flex-shrink-0 text-[12.5px]" style={{ color: MUTED }}>{label}</span><div className="flex-1 min-w-0">{children}</div></div>
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
      <p className="m-0 text-[13px] font-medium" style={{ color: INK }}>New policy enquiry</p>
      <p className="m-0 mt-0.5 text-[13px] tabular-nums" style={{ color: BODY }}>
        {enquiry.policies} polic{enquiry.policies === 1 ? 'y' : 'ies'} · {enquiry.emails} email{enquiry.emails === 1 ? '' : 's'} to send{enquiry.sent ? ` · ${enquiry.sent} sent` : ''}
      </p>
      {enquiry.awaitingDetails.length > 0 && <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: MUTED }}>On hold for client details: {enquiry.awaitingDetails.join(', ')}</p>}

      <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-1.5">
        {ready.map(r => {
          const key = `req:${r.draftId}`
          const t = textOf(r)
          return (
            <li key={r.draftId} className="rounded-[10px] px-3 py-2" style={{ border: `1px solid ${HAIR}` }}>
              <p className="m-0 text-[13px] font-medium" style={{ color: INK }}>{r.line}</p>
              <ul className="m-0 mt-1 p-0 list-none flex flex-col gap-1">
                {r.recipients.map(p => (
                  <li key={p.dispatchId} className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-[12.5px]" style={{ color: BODY }}>
                      <span className="block truncate">{p.person ? `${p.person} · ` : ''}{p.insurer}</span>
                      <span className="block truncate" style={{ color: MUTED }}>{p.email || 'No address on file'}</span>
                    </span>
                    {phases[p.dispatchId]
                      ? <span className="flex-shrink-0 text-[12.5px]" style={{ color: phases[p.dispatchId] === 'error' ? ERROR : MUTED }}>{{ queued: 'Queued', sending: 'Sending…', sent: 'Sent', error: 'Not sent' }[phases[p.dispatchId]]}</span>
                      : <button type="button" onClick={() => removeInsurer(p.dispatchId)} disabled={sendingAll} className="flex-shrink-0 bg-transparent border-0 p-0 text-[12.5px] underline underline-offset-[3px] cursor-pointer" style={{ color: MUTED }} aria-label={`Remove ${p.insurer}`}>Remove</button>}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className={SECOND} style={{ borderColor: HAIR, color: INK }} aria-expanded={open === key} onClick={() => setOpen(v => v === key ? null : key)}>{open === key ? 'Hide message' : 'See message'}</button>
                <button type="button" className={MAIN} style={{ background: PRIMARY }} disabled={sendingAll || r.recipients.some(p => !p.email)} onClick={() => sendAll([r])}>Send {r.recipients.length} separately</button>
              </div>
              {open === key && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <Labelled label="Subject"><input aria-label="Subject" value={t.subject} onChange={e => setEdits(x => ({ ...x, [r.draftId]: { ...t, subject: e.target.value } }))} className={FIELD} style={{ border: `1px solid ${HAIR}`, color: INK }} /></Labelled>
                  <textarea aria-label="Message" value={t.body} onChange={e => setEdits(x => ({ ...x, [r.draftId]: { ...t, body: e.target.value } }))} rows={Math.min(18, Math.max(7, t.body.split('\n').length + 1))} className={`${FIELD} resize-y leading-[1.5]`} style={{ border: `1px solid ${HAIR}`, color: INK }} />
                  {r.attachments.length > 0 && <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Attached: {r.attachments.map(a => a.filename).join(', ')}</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {error && <p className="m-0 mt-2 text-[13px]" style={{ color: ERROR }} role="alert">{error}</p>}
      {ready.length > 1 && (
        <button type="button" className={`${MAIN} mt-2`} style={{ background: PRIMARY }} disabled={sendingAll} onClick={() => sendAll(ready)}>
          {sendingAll ? 'Sending…' : `Send all ${enquiry.emails} separately`}
        </button>
      )}
    </div>
  )
}
