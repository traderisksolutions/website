'use client'

import { uploadAttachment } from '@/lib/upload-attachment'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Maximize2, PanelRight, Paperclip, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn, Empty, Spinner } from '@/components/crm/primitives'
import { RichEditor } from '@/components/RichEditor'
import { TbGroup, TbMenu, TbMenuItem, TbMenuLabel, FieldRow, RecipientChip, QuietSelect, AttachmentChip } from '@/components/engagement-agent/compose-toolbar'
import { bodyToHtml } from '@/lib/placement/compare'
import { draftBodyToHtml, emailReadyHtml, htmlToDraftText, isBlankHtml } from '@/lib/email-body'
import { productLineLabel } from '@/lib/product-lines'
import type { PlacementBundle, PlacementDispatch } from '@/lib/placement/types'
import type { PolicyMovement, PolicyView } from '@/components/policies/types'
import { callApi, errText } from './shared'

const OPS_EMAIL = 'operations@trade-risksol.com'
const LAYOUT_KEY = 'trs.drafts.layout'
type Sender = { email: string; label: string; type: 'shared' | 'personal' }
type Layout = 'modal' | 'dock'
const KIND_WORD = { request: 'Request', chase: 'Follow-up', tier: 'Option ask', letter: 'Appointment letter', client: 'Comparison to client', confirm: 'Confirm to insurer', movement: 'Movement' } as const

type DraftRow = { id: string; to_email: string | null; subject: string | null; body: string; status: string; thread_id: string | null; contact_id: string; email_type: string | null; created_at: string; attachments?: { filename: string; mime_type?: string; storage_url: string }[] | null }
/** GET /api/companies/[id]/drafts → { queue: QueueItem[] } */
export type QueueItem = { draft: DraftRow; kind: 'request' | 'chase' | 'tier' | 'client' | 'confirm' | 'movement' | 'letter'; dispatches: PlacementDispatch[]; movements?: PolicyMovement[]; policyId?: string | null }
type SendState = { phase: 'idle' } | { phase: 'sending' } | { phase: 'sent' } | { phase: 'error'; message: string }
/** One recipient of a request item while its fan-out runs: the dispatch id keys the line. */
type RecipientState = { phase: 'queued' | 'sending' | 'sent' | 'error'; message?: string }
type Att = { filename: string; mime_type?: string; storage_url: string; size_bytes?: number }
/** The editor works in HTML; `html` is what is mailed, its text form is what the draft row stores. */
type Item = QueueItem & { subject: string; html: string; cc: string; attachments: Att[]; state: SendState; recipients: Record<string, RecipientState> }
type FanoutClone = { draft_id: string; dispatch_id: string; to_email: string; insurer_name: string }

/** Plain text → HTML; a block of "| a | b |" rows (the comparison table) becomes a table. */
export { bodyToHtml }

function readLayout(): Layout {
  try { return window.localStorage.getItem(LAYOUT_KEY) === 'dock' ? 'dock' : 'modal' } catch { return 'modal' }
}
function writeLayout(l: Layout) {
  try { window.localStorage.setItem(LAYOUT_KEY, l) } catch { /* storage blocked: the choice lasts this visit */ }
}

/** Below Tailwind's `sm` the workspace is always a full-screen modal. */
function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

const statusWord = (s: SendState) => s.phase === 'sending' ? 'Sending…' : s.phase === 'sent' ? 'Sent' : s.phase === 'error' ? 'Not sent' : 'Queued'

/**
 * Every draft the agents prepared for this company — placement requests, follow-ups, option asks,
 * the comparison to the client, confirmations, movement requests — each read, edited and sent by a
 * person. Nothing leaves without an approval; the three-step send mirrors the inbox composer. A
 * request is one draft per policy line shared by every insurer asked; sending it fans the text out
 * per insurer first. Opens as a large modal (list left, editor right) or docked to the right edge.
 */
export function ReviewDraftsDrawer({ companyId, open, focus, onClose, onChanged, onCount, lines, policies }: {
  companyId: string
  open: boolean
  /** A draft id or dispatch id: the draft to show first. */
  focus?: string | null
  onClose: () => void
  onChanged: () => void
  onCount?: (n: number) => void
  lines?: PlacementBundle['lines']
  policies?: PolicyView[] | null
}) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sendingAll, setSendingAll] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list')
  const [layout, setLayout] = useState<Layout>('modal')
  const phone = usePhone()
  const docked = layout === 'dock' && !phone
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [threadFiles, setThreadFiles] = useState<Record<string, Att[]>>({})

  useEffect(() => { if (open) setLayout(readLayout()) }, [open])
  const switchLayout = (l: Layout) => { setLayout(l); writeLayout(l) }

  // Sent from the broker's own mailbox when they have connected it; the send route CCs operations@
  // and sets Reply-To to it, so the reply still lands where the agent reads it.
  const [senders, setSenders] = useState<Sender[]>([])
  const [from, setFrom] = useState(OPS_EMAIL)
  useEffect(() => {
    if (!open) return
    fetch('/api/email/available-senders', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then((rows: Sender[]) => {
      if (!Array.isArray(rows) || rows.length === 0) return
      setSenders(rows)
      setFrom(rows.find(r => r.type === 'personal')?.email ?? rows[0].email)
    }).catch(() => {})
  }, [open])
  // Mirror of `items` for the sequential send, which outlives any one render's closure.
  const itemsRef = useRef<Item[] | null>(null)
  useEffect(() => { itemsRef.current = items }, [items])
  const focusRef = useRef<string | null>(null)
  useEffect(() => { if (open) focusRef.current = focus ?? null }, [open, focus])

  /** Load the queue. Edits already made to drafts still in the queue are kept. */
  const load = useCallback(async () => {
    setError(null)
    try {
      const d = await callApi<{ queue: QueueItem[] }>(`/api/companies/${companyId}/drafts`)
      const prev = new Map((itemsRef.current ?? []).map(x => [x.draft.id, x]))
      const next: Item[] = d.queue.map(q => {
        const kept = prev.get(q.draft.id)
        return kept && kept.state.phase !== 'sent'
          ? { ...q, subject: kept.subject, html: kept.html, cc: kept.cc, attachments: kept.attachments, state: kept.state, recipients: kept.recipients }
          : { ...q, subject: q.draft.subject ?? '', html: draftBodyToHtml(q.draft.body ?? ''), cc: '', attachments: (q.draft.attachments ?? []) as Att[], state: { phase: 'idle' }, recipients: {} }
      })
      setItems(next)
      const focused = focusRef.current ? next.find(x => x.draft.id === focusRef.current || x.dispatches.some(dp => dp.id === focusRef.current)) : undefined
      if (focused) { focusRef.current = null; setMobileView('editor') }
      setSelectedId(cur => focused ? focused.draft.id : cur && next.some(x => x.draft.id === cur) ? cur : next[0]?.draft.id ?? null)
      onCount?.(d.queue.length)
    } catch (e) {
      setError(errText(e))
      setItems(xs => xs ?? [])
    }
  }, [companyId, onCount])

  useEffect(() => {
    if (!open) return
    itemsRef.current = null
    setItems(null)
    setSelectedId(null)
    setMobileView('list')
    void load()
  }, [open, load])

  const setItem = (id: string, patch: Partial<Item>) => setItems(xs => xs ? xs.map(x => x.draft.id === id ? { ...x, ...patch } : x) : xs)

  const selected = items?.find(x => x.draft.id === selectedId) ?? null

  // Files already on the selected draft's thread, offered for re-attaching (as in the reply composer).
  const selectedThread = selected?.draft.thread_id ?? null
  useEffect(() => {
    if (!open || !selectedThread || threadFiles[selectedThread]) return
    let ok = true
    fetch(`/api/email/attachments/for-thread?thread_id=${encodeURIComponent(selectedThread)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: Att[]) => { if (ok) setThreadFiles(m => ({ ...m, [selectedThread]: Array.isArray(rows) ? rows : [] })) })
      .catch(() => {})
    return () => { ok = false }
  }, [open, selectedThread, threadFiles])

  // Esc closes; ↑/↓ move through the list unless the broker is typing.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // An open toolbar menu takes Esc first and closes itself.
        if (rootRef.current?.querySelector('[role="menu"]')) return
        onClose()
        return
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !isTyping(e.target) && !e.altKey && !e.metaKey && !e.ctrlKey) {
        const xs = itemsRef.current
        if (!xs || xs.length === 0) return
        e.preventDefault()
        setSelectedId(cur => {
          const i = xs.findIndex(x => x.draft.id === cur)
          const n = e.key === 'ArrowDown' ? Math.min(xs.length - 1, i + 1) : Math.max(0, i - 1)
          const id = xs[n].draft.id
          requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-draft="${id}"]`)?.focus())
          return id
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Focus the workspace on open so the keys work without a click first.
  useEffect(() => { if (open) rootRef.current?.focus() }, [open, docked])

  const ccList = (cc: string) => cc.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@'))

  /** The three-step send for one draft id: approve, mail, then file the thread where the kind needs it. */
  async function sendDraft(draftId: string, item: Pick<Item, 'kind' | 'subject' | 'html' | 'cc' | 'attachments'>, toEmail: string | null): Promise<void> {
    await callApi('/api/engagement/draft', { method: 'PATCH', body: { draftId, status: 'approved', content: htmlToDraftText(item.html) } })
    const cc = ccList(item.cc)
    const sent = await callApi<{ ok: boolean; gmailMessageId?: string | null; gmailThreadId?: string | null; rfc822MessageId?: string | null; fromEmail?: string | null; subject?: string | null }>('/api/email/send', {
      method: 'POST',
      body: {
        draftId, htmlBody: emailReadyHtml(item.html), toEmail: toEmail ?? undefined, customSubject: item.subject, fromEmail: from,
        cc: cc.length ? cc : undefined, attachments: item.attachments.length ? item.attachments : undefined,
      },
    })
    const ids = {
      draft_id: draftId, gmail_thread_id: sent.gmailThreadId ?? null, gmail_message_id: sent.gmailMessageId ?? null,
      rfc822_message_id: sent.rfc822MessageId ?? null, from_email: sent.fromEmail ?? from, subject: sent.subject ?? item.subject,
    }
    if (item.kind === 'request') await callApi('/api/placements/dispatches/sent', { method: 'POST', body: ids })
    if (item.kind === 'movement') await callApi('/api/policies/movements/sent', { method: 'POST', body: ids })
    if (item.kind === 'client') await callApi('/api/placements/shares/sent', { method: 'POST', body: ids })
    if (item.kind === 'confirm') await callApi('/api/placements/confirm/sent', { method: 'POST', body: ids })
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
      clones = (await callApi<{ clones: FanoutClone[] }>(`/api/placements/drafts/${item.draft.id}/fanout`, { method: 'POST', body: { subject: item.subject, body: htmlToDraftText(item.html) } })).clones
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

  function send(item: Item): Promise<boolean> {
    if (!item.subject.trim()) { setItem(item.draft.id, { state: { phase: 'error', message: 'The subject is empty.' } }); return Promise.resolve(false) }
    if (isBlankHtml(item.html)) { setItem(item.draft.id, { state: { phase: 'error', message: 'The body is empty.' } }); return Promise.resolve(false) }
    return item.kind === 'request' ? sendRequest(item) : sendOne(item)
  }

  /** Send the selected draft, then move to the next one still waiting. */
  async function sendSelected(item: Item) {
    const ok = await send(item)
    if (!ok) return
    const xs = itemsRef.current ?? []
    const i = xs.findIndex(x => x.draft.id === item.draft.id)
    const next = [...xs.slice(i + 1), ...xs.slice(0, i)].find(x => x.state.phase !== 'sent')
    if (next) setSelectedId(cur => cur === item.draft.id ? next.draft.id : cur)
  }

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

  /** Upload local files to Drive, as the reply composer does. */
  async function uploadFiles(itemId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        let ref: string
        try { ref = await uploadAttachment(file) }
        catch (e) { setItem(itemId, { state: { phase: 'error', message: errText(e) } }); continue }
        const att: Att = { filename: file.name, mime_type: file.type || 'application/octet-stream', storage_url: ref }
        setItems(xs => xs ? xs.map(x => x.draft.id === itemId && !x.attachments.some(a => a.storage_url === att.storage_url) ? { ...x, attachments: [...x.attachments, att] } : x) : xs)
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }
  const toggleAttachment = (itemId: string, f: Att) => setItems(xs => xs ? xs.map(x => x.draft.id !== itemId ? x : {
    ...x, attachments: x.attachments.some(a => a.storage_url === f.storage_url) ? x.attachments.filter(a => a.storage_url !== f.storage_url) : [...x.attachments, f],
  }) : xs)

  if (!open) return null

  const pending = items?.filter(i => i.state.phase !== 'sent') ?? []
  const lineLabel = (lineId: string) => { const l = (lines ?? []).find(x => x.id === lineId); return l ? (l.label ?? productLineLabel(l.product_line)) : null }
  const policyLabel = (policyId: string | null | undefined) => { const p = policyId ? (policies ?? []).find(x => x.id === policyId) : null; return p ? [p.label ?? p.class_of_insurance, p.insurer].filter(Boolean).join(' · ') : null }
  const fannedOut = (item: Item) => item.kind === 'request' && item.dispatches.length > 1
  const linesOf = (item: Item) => Array.from(new Set(item.dispatches.map(d => lineLabel(d.line_id)).filter((x): x is string => !!x))).join(', ')
  const recipientOf = (item: Item) => fannedOut(item) ? `${item.dispatches.length} insurers` : (item.draft.to_email ?? 'No recipient')
  /** "Request Chubb"; a fan-out names the first two insurers and counts the rest. */
  const titleOf = (item: Item) => {
    const names = Array.from(new Set(item.dispatches.map(d => d.insurer_name).filter(Boolean)))
    const who = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')
    return [KIND_WORD[item.kind] ?? item.kind, who].filter(Boolean).join(' ')
  }

  const select = (id: string) => { setSelectedId(id); setMobileView('editor') }

  // ── List ─────────────────────────────────────────────────────────────────────────────────────
  const list = (
    <ul ref={listRef} role="listbox" aria-label="Drafts" className="list-none m-0 p-0">
      {(items ?? []).map(item => {
        const on = item.draft.id === selectedId
        const context = [linesOf(item), policyLabel(item.policyId)].filter(Boolean).join(' · ')
        return (
          <li key={item.draft.id}>
            <button
              type="button"
              role="option"
              aria-selected={on}
              data-draft={item.draft.id}
              onClick={() => select(item.draft.id)}
              className={cn(
                'w-full text-left border-0 border-b border-[--border-subtle] border-l-2 cursor-pointer px-4 py-2.5 flex flex-col gap-0.5 outline-none focus-visible:bg-muted',
                on ? 'border-l-primary bg-primary/[0.05]' : 'border-l-transparent bg-transparent hover:bg-muted/60',
              )}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-medium text-foreground truncate">{titleOf(item)}</span>
                <span className={cn('text-[12px] flex-shrink-0', item.state.phase === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{statusWord(item.state)}</span>
              </span>
              <span className="text-[12.5px] text-muted-foreground truncate">{recipientOf(item)}</span>
              {context && <span className="text-[12.5px] text-muted-foreground truncate">{context}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )

  // ── Editor ───────────────────────────────────────────────────────────────────────────────────
  const editor = selected && (() => {
    const item = selected
    const busy = item.state.phase === 'sending' || sendingAll
    const sent = item.state.phase === 'sent'
    const fanned = fannedOut(item)
    const movements = item.movements ?? []
    const files = item.draft.thread_id ? threadFiles[item.draft.thread_id] ?? [] : []
    const personal = senders.find(s => s.email === from)?.type === 'personal'
    const sendLabel = fanned ? `Send to ${item.dispatches.length} insurers` : 'Approve and send'
    const context = [
      item.kind !== 'request' ? linesOf(item) : '',
      Array.from(new Set(item.dispatches.map(d => d.insurer_name))).join(', '),
      policyLabel(item.policyId),
      movements.length > 0 ? `${movements.length} movement${movements.length === 1 ? '' : 's'}: ${movements.map(m => m.member_name).join(', ')}` : '',
    ].filter(Boolean).join(' · ')
    return (
      <div className="flex flex-col min-h-0 h-full">
        <div className="flex items-center gap-2 px-[var(--re-gutter)] py-2.5 flex-shrink-0 border-b border-[--border-subtle]">
          {!docked && (
            <button type="button" onClick={() => setMobileView('list')} className="md:hidden inline-flex items-center gap-1 h-8 pr-2 bg-transparent border-0 cursor-pointer text-[13px] text-muted-foreground">
              <ChevronLeft size={15} /> All drafts
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[15px] font-medium text-foreground truncate">
              {KIND_WORD[item.kind] ?? item.kind}{item.kind === 'request' && linesOf(item) ? ` · ${linesOf(item)}` : ''}
            </h3>
            {context && <p className="m-0 text-[12.5px] text-muted-foreground truncate">{context}</p>}
          </div>
          <span role="status" className={cn('text-[13px] flex-shrink-0', item.state.phase === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
            {item.state.phase === 'idle' ? '' : statusWord(item.state)}
          </span>
        </div>

        <FieldRow label="From">
          {senders.length > 1 && !sent ? (
            <QuietSelect label="From" value={from} onChange={setFrom}>
              {senders.map(s => <option key={s.email} value={s.email}>{s.email}</option>)}
            </QuietSelect>
          ) : <span className="text-[13.5px] text-foreground truncate">{from}</span>}
        </FieldRow>

        <FieldRow label="To" tall>
          {fanned ? (
            <ul className="list-none m-0 p-0 flex flex-col gap-0.5 w-full py-0.5">
              {item.dispatches.map(d => {
                const r = item.recipients[d.id]
                return (
                  <li key={d.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate text-foreground">{d.insurer_name} <span className="text-muted-foreground">{d.to_email}</span></span>
                    {r && (
                      <span className={cn('flex-shrink-0 text-[12.5px]', r.phase === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                        {r.phase === 'queued' ? 'Queued' : r.phase === 'sending' ? 'Sending…' : r.phase === 'sent' ? 'Sent' : r.message ?? 'Not sent'}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : item.draft.to_email ? (
            <RecipientChip name={item.dispatches[0]?.insurer_name ?? item.draft.to_email} email={item.draft.to_email} />
          ) : <span className="text-[13.5px] text-destructive">No recipient</span>}
        </FieldRow>

        <FieldRow label="Cc" htmlFor="drafts-cc">
          <input
            id="drafts-cc"
            value={item.cc}
            disabled={busy || sent}
            onChange={e => setItem(item.draft.id, { cc: e.target.value })}
            placeholder={personal ? 'operations@ is added on send' : 'Add addresses, separated by commas'}
            autoComplete="off"
            className="w-full text-[14px] bg-transparent border-none outline-none py-1 text-foreground placeholder:text-muted-foreground disabled:opacity-60"
          />
        </FieldRow>

        <FieldRow label="Subject" htmlFor="drafts-subject">
          <input
            id="drafts-subject"
            value={item.subject}
            disabled={busy || sent}
            onChange={e => setItem(item.draft.id, { subject: e.target.value })}
            className="w-full text-[14px] bg-transparent border-none outline-none py-1 text-foreground disabled:opacity-60"
          />
        </FieldRow>

        {sent ? (
          <div className="trs-re flex-1 min-h-0 overflow-y-auto px-[var(--re-gutter)] py-4 text-[15px] leading-relaxed text-foreground [&_table]:border-collapse [&_td]:border [&_td]:border-input [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-input [&_th]:px-2 [&_th]:py-1 [&_p]:m-0 [&_p]:mb-3"
            dangerouslySetInnerHTML={{ __html: item.html }} />
        ) : (
          <div className={cn('flex-1 min-h-0 flex flex-col', busy && 'pointer-events-none opacity-60')} aria-busy={busy}>
            <RichEditor
              key={item.draft.id}
              initialHtml={item.html}
              onChange={html => setItem(item.draft.id, { html })}
              borderless
              variant="reading"
              placeholder="Write the email…"
              minHeight={docked ? 220 : 320}
              className="flex-1 min-h-0"
              bodyClassName="flex-1 min-h-0 overflow-y-auto"
              toolbarExtras={
                <TbGroup label="Attach">
                  <TbMenu label={uploading ? 'Uploading…' : 'Attach files'} caret={files.length > 0} width={260}
                    trigger={<><Paperclip size={15} /> {uploading ? 'Uploading…' : 'Attach'}</>}>
                    {close => (
                      <>
                        <TbMenuItem onSelect={() => { fileInputRef.current?.click(); close() }}>Upload from computer</TbMenuItem>
                        {files.length > 0 && (
                          <>
                            <TbMenuLabel>From this thread</TbMenuLabel>
                            {files.map(f => (
                              <TbMenuItem key={f.storage_url} active={item.attachments.some(a => a.storage_url === f.storage_url)} onSelect={() => toggleAttachment(item.draft.id, f)}>{f.filename}</TbMenuItem>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </TbMenu>
                </TbGroup>
              }
            />
            <input ref={fileInputRef} type="file" multiple hidden onChange={e => void uploadFiles(item.draft.id, e.target.files)} aria-hidden tabIndex={-1} />
          </div>
        )}

        {item.attachments.length > 0 && (
          <div className="px-[var(--re-gutter)] pt-2 flex flex-wrap gap-1.5 flex-shrink-0">
            {item.attachments.map(a => <AttachmentChip key={a.storage_url} name={a.filename} onRemove={busy || sent ? undefined : () => toggleAttachment(item.draft.id, a)} />)}
          </div>
        )}

        <div className="flex items-center gap-2 px-[var(--re-gutter)] py-3 flex-shrink-0 flex-wrap border-t border-[--border-subtle]">
          {item.state.phase === 'error' && <span role="alert" className="text-[13px] text-destructive min-w-0 break-words">{item.state.message}</span>}
          <span className="flex-1" />
          {!sent && (
            <>
              <Btn level="tertiary" size="xs" disabled={busy} onClick={() => void discard(item)}>Discard</Btn>
              <Btn level="primary" size="sm" disabled={busy || uploading} loading={item.state.phase === 'sending'} onClick={() => void sendSelected(item)}>{sendLabel}</Btn>
            </>
          )}
        </div>
      </div>
    )
  })()

  // ── Shell ────────────────────────────────────────────────────────────────────────────────────
  const header = (
    <header className="flex items-center gap-2 px-4 sm:px-5 h-14 flex-shrink-0 border-b border-[--border-subtle]">
      <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em] text-foreground">Drafts to approve</h2>
      <span className="text-[13px] tabular-nums text-muted-foreground">{items ? pending.length : ''}</span>
      <div className="ml-auto flex items-center gap-1.5">
        <Btn level="secondary" size="xs" onClick={() => void sendAll()} loading={sendingAll} disabled={!items || pending.length === 0}>Send all</Btn>
        {!phone && (docked
          ? <Btn level="tertiary" size="xs" onClick={() => switchLayout('modal')}><Maximize2 size={13} /> Expand</Btn>
          : <Btn level="tertiary" size="xs" onClick={() => switchLayout('dock')}><PanelRight size={13} /> Dock to side</Btn>)}
        <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className="inline-flex items-center justify-center w-8 h-8 rounded-[8px] border-0 bg-transparent cursor-pointer text-foreground hover:bg-muted">
          <X size={16} />
        </button>
      </div>
    </header>
  )

  const states = (
    <>
      {error && <p role="alert" className="text-[13px] m-0 px-4 py-3 text-destructive">{error}</p>}
      {!items && <div className="p-4"><Spinner label="Loading drafts…" /></div>}
      {items && items.length === 0 && !error && <div className="p-4"><Empty compact>No drafts waiting.</Empty></div>}
    </>
  )

  if (docked) {
    return (
      <aside
        ref={rootRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Drafts to approve"
        className="fixed top-0 right-0 bottom-0 z-50 w-[600px] max-w-full bg-background flex flex-col border-l border-[--border-subtle] shadow-[var(--shadow-panel)] outline-none [--re-gutter:16px]"
      >
        {header}
        {states}
        {items && items.length > 0 && (
          <>
            <div className="flex-shrink-0 max-h-[32%] overflow-y-auto border-b border-[--border-subtle]">{list}</div>
            <div className="flex-1 min-h-0">{editor}</div>
          </>
        )}
      </aside>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/40" onClick={onClose} aria-hidden />
      <div
        ref={rootRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Drafts to approve"
        className="fixed z-50 inset-0 sm:inset-6 lg:inset-8 mx-auto max-w-[1400px] bg-background flex flex-col overflow-hidden sm:rounded-[16px] shadow-[var(--shadow-modal)] outline-none [--re-gutter:16px] sm:[--re-gutter:24px]"
      >
        {header}
        {states}
        {items && items.length > 0 && (
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]">
            <nav aria-label="Drafts" className={cn('min-h-0 overflow-y-auto md:border-r md:border-[--border-subtle]', mobileView === 'editor' && 'hidden md:block')}>{list}</nav>
            <section className={cn('min-h-0 min-w-0', mobileView === 'list' && 'hidden md:block')}>{editor}</section>
          </div>
        )}
      </div>
    </>
  )
}
