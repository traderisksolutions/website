'use client'

/**
 * One client on Today. Folded: a line per side naming each unsent email. Open: the Read (summary,
 * points, suggested emails to tick and draft), the threads on the row, then To client and To insurer
 * with each email to edit and send. Read and Draft are the only model calls, each on its button.
 */
import Link from 'next/link'
import { useState } from 'react'
import { ChevronRight, MessageSquare, Sparkles } from 'lucide-react'
import { Btn, Chip } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { useConfirm } from '@/components/ui/confirm'
import { fmtDay, timeAgo } from '@/lib/format'
import type { ReadPlan } from '@/lib/chief/read'
import type { DeskDraft, DeskRow, DeskSide } from '@/lib/today/desk'
import { DraftCard } from './DraftCard'

const SIDE_LABEL: Record<DeskSide, string> = { client: 'To client', insurer: 'To insurer' }
const SIDE_TONE: Record<DeskSide, string> = { client: 'bg-trs-info-bg text-trs-info', insurer: 'bg-trs-select-bg text-trs-select-fg' }
const first = (s: string) => s.split(/[\s@]/)[0]

export function ClientRow({ row, open, onToggle, showOwner, me, onChange, onNotice }: {
  row: DeskRow; open: boolean; onToggle: () => void; showOwner: boolean; me: string
  onChange: () => void; onNotice: (m: string) => void
}) {
  const confirm = useConfirm()
  const [threadsOpen, setThreadsOpen] = useState(false)
  const [busy, setBusy] = useState<'read' | 'draft' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [read, setRead] = useState<ReadPlan | null>(row.read)
  const [ticked, setTicked] = useState<Set<string>>(new Set())

  const ids = row.threads.map(t => t.threadId)
  const base = { owner: row.owner, companyId: row.companyId, threadIds: ids }
  const bySide = (s: DeskSide) => row.drafts.filter(d => d.side === s)
  const mine = row.owner === me

  async function doRead() {
    setBusy('read'); setError(null)
    try {
      const r = await callApi<{ read: ReadPlan }>('/api/today/desk', { method: 'POST', body: { action: 'read', ...base } })
      setRead(r.read)
      setTicked(new Set(r.read.steps.filter(s => s.kind === 'email' && s.status === 'proposed').map(s => s.id)))
      if (!open) onToggle()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function doDraft() {
    setBusy('draft'); setError(null)
    try {
      const r = await callApi<{ read: ReadPlan }>('/api/today/desk', { method: 'POST', body: { action: 'draft', ...base, stepIds: [...ticked] } })
      setRead(r.read); setTicked(new Set()); onChange()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function remove() {
    const n = row.drafts.length
    if (!(await confirm({ title: `Remove ${row.companyName}?`, body: `${row.threads.length} thread${row.threads.length === 1 ? '' : 's'}${n ? ` and ${n} unsent email${n === 1 ? '' : 's'}` : ''} leave your Today. The threads and drafts stay in the Inbox.`, action: 'Remove', danger: true }))) return
    setBusy('remove'); setError(null)
    try { await callApi('/api/today/desk', { method: 'POST', body: { action: 'remove', ...base } }); onNotice(`${row.companyName} removed from Today.`); onChange() }
    catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  const proposed = (read?.steps ?? []).filter(s => s.status === 'proposed')
  const emails = proposed.filter(s => ticked.has(s.id) && s.kind === 'email').length
  const left = row.drafts.length

  return (
    <section className="rounded-[12px] border border-trs-line-2 bg-white overflow-hidden">
      <header className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 pl-2 pr-3 bg-trs-tint ${open ? 'border-b border-trs-line' : ''}`}>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Fold' : 'Open'} ${row.companyName}`} className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border-0 bg-transparent text-trs-ink cursor-pointer hover:bg-trs-field">
          <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {row.companyId
          ? <Link href={`/companies/${row.companyId}`} className="text-[15px] font-semibold text-trs-ink no-underline hover:underline">{row.companyName}</Link>
          : <span className="text-[15px] font-semibold text-trs-ink">{row.companyName}</span>}
        <span className="text-[12.5px] text-trs-muted">{row.threads.length} thread{row.threads.length === 1 ? '' : 's'}{row.lastAt ? ` · last ${timeAgo(row.lastAt)}` : ''}</span>
        {showOwner && <span className="text-[12.5px] text-trs-muted">Owner {first(row.owner)}</span>}
        <span className="flex-1" />
        <Chip tone={left ? 'neutral' : 'green'}>{left ? `${left} to send` : 'Cleared'}</Chip>
        <Btn size="xs" level="tertiary" onClick={() => { setThreadsOpen(v => !v); if (!open) onToggle() }} aria-expanded={threadsOpen}><MessageSquare size={14} /> Threads</Btn>
        <Btn size="xs" onClick={doRead} loading={busy === 'read'} disabled={!!busy}><Sparkles size={14} /> {read ? 'Read again' : 'Read'}</Btn>
        {mine && <Btn size="xs" level="tertiary" onClick={remove} disabled={!!busy}>Remove</Btn>}
      </header>

      {error && <p className="m-0 px-4 pt-2.5 text-[13px] text-trs-neg" role="alert">{error}</p>}

      {!open && (
        <button type="button" onClick={onToggle} className="grid w-full grid-cols-1 md:grid-cols-2 border-0 bg-white p-0 text-left cursor-pointer">
          {(['client', 'insurer'] as const).map(s => (
            <span key={s} className={`flex min-w-0 flex-col gap-1 py-2.5 pl-[50px] pr-4 ${s === 'client' ? 'md:border-r md:border-trs-line' : ''}`}>
              <span className={`self-start rounded-full px-2 py-[1px] text-[11.5px] font-medium ${SIDE_TONE[s]}`}>{SIDE_LABEL[s]}</span>
              {bySide(s).length
                ? bySide(s).map(d => <Line key={d.id} d={d} />)
                : <span className="text-[13px] text-trs-subtle">No draft</span>}
            </span>
          ))}
        </button>
      )}

      {open && (
        <>
          {read && (
            <div className="px-4 py-3 border-b border-trs-line flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-trs-green"><Sparkles size={13} /> Summary</span>
                <span className="text-[12px] text-trs-muted">Read {timeAgo(read.at)} by {first(read.by)}</span>
              </div>
              <p className="m-0 text-[14px] font-medium text-trs-ink">{read.summary}</p>
              {read.situation && <ul className="m-0 pl-5 list-disc flex flex-col gap-0.5 text-[13px] leading-[1.5] text-trs-ink-2">{read.situation.split('\n').filter(Boolean).map((p, i) => <li key={i}>{p}</li>)}</ul>}
              {read.steps.length > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  <span className="text-[12.5px] font-semibold text-trs-ink">Suggested</span>
                  <ul className="m-0 p-0 list-none flex flex-col gap-1">
                    {read.steps.map(s => (
                      <li key={s.id} className="flex items-start gap-2 text-[13px]">
                        {s.status === 'proposed'
                          ? <input type="checkbox" aria-label={s.title} checked={ticked.has(s.id)} onChange={() => setTicked(t => { const n = new Set(t); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })} className="mt-[3px]" />
                          : <span className="mt-[2px] w-[13px] text-trs-pos" aria-hidden>✓</span>}
                        <span className="min-w-0">
                          <span className={`mr-1.5 rounded-full px-1.5 py-[1px] text-[11px] font-medium ${s.party === 'insurer' ? SIDE_TONE.insurer : s.party === 'client' ? SIDE_TONE.client : 'bg-trs-field text-trs-ink-2'}`}>{s.kind === 'action' ? 'Action' : s.party === 'insurer' ? (s.insurer ?? 'Insurer') : 'Client'}</span>
                          <span className="font-medium text-trs-ink">{s.title}</span>
                          {s.to && <span className="text-trs-muted"> · {s.to.name ?? s.to.email}</span>}
                          {s.status === 'drafted' && <span className="text-trs-pos"> · drafted</span>}
                          {s.status === 'todo' && <span className="text-trs-muted"> · to do</span>}
                          <span className="block text-[12.5px] text-trs-muted">{s.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {proposed.length > 0 && (
                    <div className="mt-1 flex items-center gap-2">
                      <Btn size="xs" onClick={doDraft} loading={busy === 'draft'} disabled={!!busy || ticked.size === 0}>
                        {busy === 'draft' ? 'Drafting…' : emails ? `Draft ${emails} email${emails === 1 ? '' : 's'}` : ticked.size ? 'Mark to do' : 'Tick to draft'}
                      </Btn>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {threadsOpen && (
            <ul className="m-0 list-none px-4 py-2.5 border-b border-trs-line flex flex-col gap-1">
              {row.threads.map(t => (
                <li key={t.threadId} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className={`rounded-full px-2 py-[1px] text-[11.5px] font-medium ${SIDE_TONE[t.side]}`}>{t.side === 'client' ? 'Client' : 'Insurer'}</span>
                  <Link href={`/engagement?thread=${t.threadId}`} className="font-medium text-trs-ink">{t.subject}</Link>
                  <span className="text-trs-muted">{t.messages} email{t.messages === 1 ? '' : 's'}{t.lastAt ? ` · ${fmtDay(t.lastAt)}` : ''}{t.lastInbound ? ' · waiting on TRS' : ''}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2">
            {(['client', 'insurer'] as const).map(s => (
              <div key={s} className={`flex min-w-0 flex-col gap-3 p-4 ${s === 'client' ? 'md:border-r md:border-trs-line' : ''}`}>
                <div className={`flex h-8 items-center justify-center gap-2 rounded-[8px] text-[13px] font-semibold ${SIDE_TONE[s]}`}>
                  {SIDE_LABEL[s]} <span className="font-mono text-[12px] font-medium">{bySide(s).length}</span>
                </div>
                {bySide(s).map(d => (
                  <DraftCard key={d.id} draft={d}
                    onSent={to => { onNotice(`Sent to ${to}.`); onChange() }}
                    onDiscarded={() => { onNotice('Email discarded.'); onChange() }} />
                ))}
                {bySide(s).length === 0 && (
                  <div className="flex min-h-[56px] items-center justify-center rounded-[10px] border border-dashed border-trs-line-2 px-3 text-center text-[13px] text-trs-muted">
                    {read ? 'No draft. Tick a suggestion above to draft one.' : 'No draft. Read to get suggestions.'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function Line({ d }: { d: DeskDraft }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[13px]">
      <span className="h-[7px] w-[7px] flex-none rounded-full bg-trs-line-2" aria-hidden />
      <span className="font-medium text-trs-ink whitespace-nowrap">{d.person ?? d.to}</span>
      <span className="truncate text-trs-muted">{d.subject}</span>
    </span>
  )
}
