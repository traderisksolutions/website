'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Btn, Empty, Field, Spinner, inputCls, textareaCls } from '@/components/crm/primitives'
import { productLineLabel } from '@/lib/product-lines'
import type { PlacementBundle, PlacementDispatch } from '@/lib/placement/types'
import type { PolicyMovement, PolicyView } from '@/components/policies/types'
import { callApi, errText, INK, MUTED, ERROR } from './shared'

const FROM_EMAIL = 'operations@trade-risksol.com'
const KIND_WORD = { request: 'Request', chase: 'Follow-up', client: 'Client', movement: 'Movement' } as const

type DraftRow = { id: string; to_email: string | null; subject: string | null; body: string; status: string; thread_id: string | null; contact_id: string; email_type: string | null; created_at: string }
/** GET /api/companies/[id]/drafts → { queue: QueueItem[] } */
export type QueueItem = { draft: DraftRow; kind: 'request' | 'chase' | 'client' | 'movement'; dispatches: PlacementDispatch[]; movements?: PolicyMovement[]; policyId?: string | null }
type SendState = { phase: 'idle' } | { phase: 'sending' } | { phase: 'sent' } | { phase: 'error'; message: string }
/** One recipient of a request item while its fan-out runs: the dispatch id keys the line. */
type RecipientState = { phase: 'queued' | 'sending' | 'sent' | 'error'; message?: string }
type Item = QueueItem & { subject: string; body: string; state: SendState; recipients: Record<string, RecipientState> }
type FanoutClone = { draft_id: string; dispatch_id: string; to_email: string; insurer_name: string }

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Plain text → paragraphs: blank line splits a `<p>`, a single newline is a `<br>`. */
export function bodyToHtml(body: string): string {
  return body.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * Every draft the agents prepared for this company — placement requests, follow-ups, client
 * summaries, movement requests to the insurer — each read and sent by a person. Nothing leaves
 * without an approval; the three-step send mirrors the inbox composer. A request is one draft
 * per policy line shared by every insurer asked; sending it fans the text out per insurer first.
 */
export function ReviewDraftsDrawer({ companyId, open, onClose, onChanged, onCount, lines, policies }: {
  companyId: string
  open: boolean
  onClose: () => void
  onChanged: () => void
  onCount?: (n: number) => void
  lines?: PlacementBundle['lines']
  policies?: PolicyView[] | null
}) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sendingAll, setSendingAll] = useState(false)
  // Mirror of `items` for the sequential send, which outlives any one render's closure.
  const itemsRef = useRef<Item[] | null>(null)
  useEffect(() => { itemsRef.current = items }, [items])

  const load = useCallback(async () => {
    setError(null)
    try {
      const d = await callApi<{ queue: QueueItem[] }>(`/api/companies/${companyId}/drafts`)
      setItems(d.queue.map(q => ({ ...q, subject: q.draft.subject ?? '', body: q.draft.body ?? '', state: { phase: 'idle' }, recipients: {} })))
      onCount?.(d.queue.length)
    } catch (e) {
      setError(errText(e))
      setItems([])
    }
  }, [companyId, onCount])

  useEffect(() => {
    if (!open) return
    setItems(null)
    void load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const setItem = (id: string, patch: Partial<Item>) => setItems(xs => xs ? xs.map(x => x.draft.id === id ? { ...x, ...patch } : x) : xs)

  /** The three-step send for one draft id: approve, mail, then file the thread where the kind needs it. */
  async function sendDraft(draftId: string, item: Pick<Item, 'kind' | 'subject' | 'body'>, toEmail: string | null): Promise<void> {
    await callApi('/api/engagement/draft', { method: 'PATCH', body: { draftId, status: 'approved', content: item.body } })
    const sent = await callApi<{ ok: boolean; gmailMessageId?: string | null; gmailThreadId?: string | null }>('/api/email/send', {
      method: 'POST',
      body: { draftId, htmlBody: bodyToHtml(item.body), toEmail: toEmail ?? undefined, customSubject: item.subject, fromEmail: FROM_EMAIL },
    })
    const ids = { draft_id: draftId, gmail_thread_id: sent.gmailThreadId ?? null, gmail_message_id: sent.gmailMessageId ?? null }
    if (item.kind === 'request') await callApi('/api/placements/dispatches/sent', { method: 'POST', body: ids })
    if (item.kind === 'movement') await callApi('/api/policies/movements/sent', { method: 'POST', body: ids })
  }

  /** A single-recipient draft (chase, client, movement, or a request already fanned out). */
  async function sendOne(item: Item): Promise<boolean> {
    setItem(item.draft.id, { state: { phase: 'sending' } })
    try {
      await sendDraft(item.draft.id, item, item.draft.to_email)
      setItem(item.draft.id, { state: { phase: 'sent' } })
      onChanged()
      return true
    } catch (e) {
      setItem(item.draft.id, { state: { phase: 'error', message: errText(e) } })
      onChanged()
      return false
    }
  }

  const setRecipient = (itemId: string, dispatchId: string, r: RecipientState) =>
    setItems(xs => xs ? xs.map(x => x.draft.id === itemId ? { ...x, recipients: { ...x.recipients, [dispatchId]: r } } : x) : xs)

  /**
   * A request shared by several dispatches: fan the reviewed text out into one draft per
   * insurer, then run the three-step send per clone. A failed recipient stays in the queue as
   * its own request item on the next load; the others are not held back by it.
   */
  async function sendRequest(item: Item): Promise<boolean> {
    if (item.dispatches.length <= 1) return sendOne(item)
    setItem(item.draft.id, { state: { phase: 'sending' }, recipients: Object.fromEntries(item.dispatches.map(d => [d.id, { phase: 'queued' }])) })
    let clones: FanoutClone[]
    try {
      clones = (await callApi<{ clones: FanoutClone[] }>(`/api/placements/drafts/${item.draft.id}/fanout`, { method: 'POST', body: { subject: item.subject, body: item.body } })).clones
    } catch (e) {
      setItem(item.draft.id, { state: { phase: 'error', message: errText(e) }, recipients: {} })
      onChanged()
      return false
    }
    let failed = 0
    for (const c of clones) {
      setRecipient(item.draft.id, c.dispatch_id, { phase: 'sending' })
      try {
        await sendDraft(c.draft_id, item, c.to_email)
        setRecipient(item.draft.id, c.dispatch_id, { phase: 'sent' })
      } catch (e) {
        failed++
        setRecipient(item.draft.id, c.dispatch_id, { phase: 'error', message: errText(e) })
      }
    }
    setItem(item.draft.id, { state: failed === 0 ? { phase: 'sent' } : { phase: 'error', message: `${failed} of ${clones.length} not sent` } })
    onChanged()
    return failed === 0
  }

  const send = (item: Item) => item.kind === 'request' ? sendRequest(item) : sendOne(item)

  async function sendAll() {
    if (!items) return
    setSendingAll(true)
    for (const id of items.map(i => i.draft.id)) {
      const current = itemsRef.current?.find(x => x.draft.id === id)
      if (!current || current.state.phase === 'sent') continue
      await send(current)
    }
    setSendingAll(false)
  }

  async function discard(item: Item) {
    setItem(item.draft.id, { state: { phase: 'sending' } })
    try {
      await callApi('/api/engagement/draft', { method: 'PATCH', body: { draftId: item.draft.id, status: 'rejected' } })
      await load()
      onChanged()
    } catch (e) {
      setItem(item.draft.id, { state: { phase: 'error', message: errText(e) } })
    }
  }

  if (!open) return null

  const pending = items?.filter(i => i.state.phase !== 'sent') ?? []
  const lineLabel = (lineId: string) => { const l = (lines ?? []).find(x => x.id === lineId); return l ? (l.label ?? productLineLabel(l.product_line)) : null }
  const policyLabel = (policyId: string | null | undefined) => { const p = policyId ? (policies ?? []).find(x => x.id === policyId) : null; return p ? [p.label ?? p.class_of_insurance, p.insurer].filter(Boolean).join(' · ') : null }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[#202124]/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="Drafts to approve"
        className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[560px] bg-white flex flex-col shadow-[-8px_0_32px_rgba(32,33,36,0.14)]"
      >
        <header className="flex items-center gap-3 px-5 h-14 flex-shrink-0" style={{ borderBottom: '1px solid #e8eaed' }}>
          <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Drafts to approve</h2>
          <span className="text-[13px] tabular-nums" style={{ color: MUTED }}>{items ? pending.length : ''}</span>
          <div className="ml-auto flex items-center gap-2">
            <Btn level="primary" size="xs" onClick={sendAll} loading={sendingAll} disabled={!items || pending.length === 0}>Send all</Btn>
            <button type="button" onClick={onClose} aria-label="Close" className="inline-flex items-center justify-center w-8 h-8 rounded-[8px] border-0 bg-transparent cursor-pointer hover:bg-[#f1f3f4]" style={{ color: INK }}>
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {error && <p className="text-[13px] m-0 mb-3" style={{ color: ERROR }}>{error}</p>}
          {!items && <Spinner label="Loading drafts…" />}
          {items && items.length === 0 && <Empty compact>No drafts waiting.</Empty>}
          {items && items.map(item => {
            const busy = item.state.phase === 'sending' || sendingAll
            const sent = item.state.phase === 'sent'
            const insurers = Array.from(new Set(item.dispatches.map(d => d.insurer_name))).join(', ')
            const lineLabels = Array.from(new Set(item.dispatches.map(d => lineLabel(d.line_id)).filter((x): x is string => !!x))).join(', ')
            const movements = item.movements ?? []
            const moved = movements.length > 0 ? `${movements.length} movement${movements.length === 1 ? '' : 's'}: ${movements.map(m => m.member_name).join(', ')}` : ''
            const policy = policyLabel(item.policyId)
            // A request shared by several insurers lists them and sends to each; everything else has one address.
            const fanned = item.kind === 'request' && item.dispatches.length > 1
            const sendLabel = fanned ? `Send to ${item.dispatches.length} insurers` : 'Approve and send'
            return (
              <section key={item.draft.id} className="py-4 first:pt-0" style={{ borderBottom: '1px solid #e8eaed' }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <span className="block text-[15px] font-medium" style={{ color: INK }}>
                      {item.kind === 'request' && lineLabels ? lineLabels : (KIND_WORD[item.kind] ?? item.kind)}
                    </span>
                    {fanned ? (
                      <ul className="list-none m-0 mt-1 p-0 flex flex-col gap-0.5">
                        {item.dispatches.map(d => {
                          const r = item.recipients[d.id]
                          return (
                            <li key={d.id} className="flex items-baseline justify-between gap-3 text-[12.5px]" style={{ color: MUTED }}>
                              <span className="min-w-0 truncate">{d.insurer_name} — {d.to_email}</span>
                              {r && (
                                <span className="flex-shrink-0" style={{ color: r.phase === 'error' ? ERROR : MUTED }}>
                                  {r.phase === 'queued' ? 'Queued' : r.phase === 'sending' ? 'Sending…' : r.phase === 'sent' ? 'Sent' : r.message ?? 'Not sent'}
                                </span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <span className="block text-[12.5px] mt-0.5" style={{ color: MUTED }}>
                        To {item.draft.to_email ?? '—'}
                        {insurers && ` · ${insurers}`}
                        {item.kind !== 'request' && lineLabels && ` · ${lineLabels}`}
                        {policy && ` · ${policy}`}
                        {moved && ` · ${moved}`}
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] flex-shrink-0" style={{ color: item.state.phase === 'error' ? ERROR : MUTED }}>
                    {item.state.phase === 'sending' ? 'Sending…' : item.state.phase === 'sent' ? 'Sent' : item.state.phase === 'error' ? item.state.message : ''}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  <Field label="Subject">
                    <input className={inputCls} value={item.subject} disabled={busy || sent} onChange={e => setItem(item.draft.id, { subject: e.target.value })} />
                  </Field>
                  <Field label="Body">
                    <textarea className={textareaCls} rows={12} value={item.body} disabled={busy || sent} onChange={e => setItem(item.draft.id, { body: e.target.value })} />
                  </Field>
                  {!sent && (
                    <div className="flex justify-end gap-2">
                      <Btn level="tertiary" size="xs" disabled={busy} onClick={() => discard(item)}>Discard</Btn>
                      <Btn level="secondary" size="xs" disabled={busy} loading={item.state.phase === 'sending'} onClick={() => send(item)}>{sendLabel}</Btn>
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </aside>
    </>
  )
}
