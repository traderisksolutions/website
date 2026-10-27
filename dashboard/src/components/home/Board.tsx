'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Pin } from 'lucide-react'
import type { StaffMember } from '@/lib/crm/staff'
import type { BoardCard, BoardColumn, HomeBoardPayload } from '@/lib/home/board'
import { staffByEmail } from '@/components/board/model'
import { PersonTag } from '@/components/board/TodoEditor'
import { LinkBtn } from '@/components/crm/primitives'

/**
 * Home: the pinned companies, one column per stage of the work (quoting → in force), one grey
 * card per company with its threads, its policies and where each quote stands. Pinning is done
 * on the company page; a card can be unpinned here.
 */

const FIELD = '#F1F3F4'
const INK = '#202124'
const MUTED = '#5f6368'
const POLL_MS = 60_000

function longDate(d: Date): string {
  return d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function Board() {
  const [data, setData] = useState<HomeBoardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/home/board', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not load the board.')
      setData(d); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void load() }
    const poll = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(poll); document.removeEventListener('visibilitychange', tick) }
  }, [load])

  const staff = useMemo(() => staffByEmail(data?.staff ?? []), [data])

  const unpin = async (id: string) => {
    setBusy(id)
    try {
      const r = await fetch(`/api/companies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: false }) })
      if (!r.ok) throw new Error('unpin failed')
      setData(d => d ? { ...d, columns: d.columns.map(c => ({ ...c, cards: c.cards.filter(k => k.company.id !== id) })) } : d)
    } catch { setError('Could not unpin. Try again.') } finally { setBusy(null) }
  }

  const total = data?.columns.reduce((n, c) => n + c.cards.length, 0) ?? 0

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12 pt-14 pb-20">

        <header className="text-center max-w-[720px] mx-auto">
          <h1 className="m-0 text-[36px] sm:text-[44px] font-medium tracking-[-0.03em] leading-[1.08]" style={{ textWrap: 'balance' }}>Companies to work on</h1>
          <p className="m-0 mt-3 text-[14px]" style={{ color: '#80868b' }}>{longDate(new Date())}</p>
        </header>

        {error && <p className="mt-10 text-[14px] text-center" style={{ color: MUTED }}>{error} <button type="button" onClick={() => void load()} className="underline bg-transparent border-0 cursor-pointer" style={{ color: INK }}>Retry</button></p>}

        <div className="mt-12">
          {!data && !error && (
            <div className="flex flex-col gap-6 sm:flex-row sm:gap-4 lg:grid lg:grid-cols-5" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[220px] rounded-[16px] animate-pulse sm:min-w-[280px] sm:w-[280px] sm:shrink-0 lg:w-auto lg:min-w-0" style={{ background: FIELD }} />)}
            </div>
          )}

          {data && (
            <>
              <p className="m-0 mb-4 text-[13px] tabular-nums" style={{ color: '#80868b' }} aria-live="polite">
                {total} pinned {total === 1 ? 'company' : 'companies'}
              </p>
              {total === 0 ? (
                <p className="m-0 py-16 text-center text-[16px]" style={{ color: MUTED }}>Nothing pinned. Open a company and pin it to work on it.</p>
              ) : (
                <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:gap-4 sm:overflow-x-auto sm:pb-4 lg:grid lg:grid-cols-5 lg:overflow-visible">
                  {data.columns.map(col => <Column key={col.key} col={col} staff={staff} busy={busy} onUnpin={unpin} />)}
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  )
}

function Column({ col, staff, busy, onUnpin }: { col: BoardColumn; staff: Map<string, StaffMember>; busy: string | null; onUnpin: (id: string) => void }) {
  return (
    <section className="min-w-0 sm:min-w-[280px] sm:w-[280px] sm:shrink-0 lg:w-auto lg:min-w-0" aria-label={col.label}>
      <h2 className="m-0 mb-3 text-[14px] font-medium tabular-nums" style={{ color: INK }}>
        {col.label} <span style={{ color: MUTED }}>{col.cards.length}</span>
      </h2>
      {col.cards.length === 0 ? (
        <p className="m-0 text-[13px]" style={{ color: MUTED }}>No companies</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-3">
          {col.cards.map(card => <li key={card.company.id}><Card card={card} staff={staff} busy={busy === card.company.id} onUnpin={() => onUnpin(card.company.id)} /></li>)}
        </ul>
      )}
    </section>
  )
}

function Card({ card, staff, busy, onUnpin }: { card: BoardCard; staff: Map<string, StaffMember>; busy: boolean; onUnpin: () => void }) {
  const c = card.company
  const t = card.threads
  return (
    <article className="group rounded-[16px] px-4 pt-4 pb-3 flex flex-col gap-2.5" style={{ background: FIELD, color: INK }}>
      <h3 className="m-0 text-[14px] font-medium leading-[1.3]">
        <Link href={card.href} className="no-underline hover:underline underline-offset-4" style={{ color: INK }}>{c.name}</Link>
      </h3>

      {c.owners.length > 0 && (
        <span className="flex items-center gap-1 flex-wrap">{c.owners.map(o => <PersonTag key={o} email={o} staff={staff} />)}</span>
      )}

      <Link href={`${card.href}?tab=threads`} className="text-[12.5px] tabular-nums no-underline hover:underline underline-offset-4" style={{ color: INK }}>
        {t.total} {t.total === 1 ? 'thread' : 'threads'} · {t.awaiting} awaiting reply
      </Link>

      {card.policies.length > 0 ? (
        <ul className="m-0 p-0 list-none flex flex-col gap-1" aria-label={`Policies for ${c.name}`}>
          {card.policies.map(p => (
            <li key={p.id} className="text-[12.5px] leading-snug">
              <Link href={`${card.href}?tab=policies`} className="no-underline hover:underline underline-offset-4" style={{ color: INK }}>
                {p.label} — {p.state}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>No policies</p>
      )}

      {card.drafts > 0 && (
        <div className="-ml-3">
          <LinkBtn href={card.href} level="tertiary" size="xs">Drafts to approve ({card.drafts})</LinkBtn>
        </div>
      )}

      {card.next_step && <p className="m-0 text-[12px] leading-snug" style={{ color: MUTED }}>{card.next_step}</p>}

      <div className="mt-0.5 pt-2.5 flex items-center justify-end" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <button type="button" onClick={onUnpin} disabled={busy} aria-pressed="true"
          className="inline-flex items-center gap-1 bg-transparent border-0 p-0 text-[11.5px] cursor-pointer hover:underline underline-offset-4 disabled:opacity-50" style={{ color: INK }}>
          <Pin size={12} /> {busy ? 'Saving…' : 'Unpin'}
        </button>
      </div>
    </article>
  )
}
