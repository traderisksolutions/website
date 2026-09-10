'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Reply, ArrowRight, Plus, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppScrollPage } from '@/components/app-shell'
import { PageHeader } from '@/components/page-header'
import { NewCompanyDialog } from '@/components/crm/dialogs'
import { Btn, Chip, Spinner } from '@/components/crm/primitives'
import { fmtMoney, fmtRelative, fmtDate } from '@/lib/crm/format'
import { STAGES, STAGE_LABEL, STAGE_HELP, STAGE_TONE, type CompanySummaryRow, type Stage } from '@/lib/crm/types'
import { TONE_STYLE } from '@/components/crm/primitives'

type Lead = { id: string; first_name: string | null; last_name: string | null; email: string | null; company: string | null; topic: string | null; product_line: string | null; source: string | null; status: string; created_at: string; message: string | null }
type Board = { columns: Record<Stage, CompanySummaryRow[]>; leads: Lead[] }

export default function PipelinePage() {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<Stage | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    const res = await fetch('/api/companies/pipeline', { cache: 'no-store' })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Could not load the pipeline.'); return }
    setBoard(d)
  }
  useEffect(() => { load() }, [])

  async function move(id: string, to: Stage) {
    if (!board) return
    const from = STAGES.find(s => board.columns[s].some(c => c.id === id))
    if (!from || from === to) return
    const card = board.columns[from].find(c => c.id === id)!
    setBoard({ ...board, columns: { ...board.columns, [from]: board.columns[from].filter(c => c.id !== id), [to]: [{ ...card, stage: to, suggestedStage: null }, ...board.columns[to]] } })
    setBusy(id)
    try {
      const res = await fetch(`/api/companies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: to }) })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not move.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); load() }
    finally { setBusy(null) }
  }

  async function convert(lead: Lead) {
    setBusy(lead.id); setError(null)
    try {
      const res = await fetch('/api/companies/from-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not create the company.')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(null) }
  }

  const total = board ? STAGES.reduce((n, s) => n + board.columns[s].length, 0) : 0

  return (
    <AppScrollPage maxWidth="100%" className="!px-0">
      <div className="px-6">
        <PageHeader title="Pipeline" description={board ? `${total} compan${total === 1 ? 'y' : 'ies'} by stage. Drag a card to move it, or use the menu on the card.` : 'Loading…'} className="mb-4" actions={<Btn level="primary" onClick={() => setCreating(true)}><Plus size={12} /> New company</Btn>} />
        {error && <p className="text-[12px] text-destructive mb-2">{error}</p>}
      </div>
      {!board && <Spinner label="Loading pipeline…" />}
      {board && (
        <div className="flex gap-3 overflow-x-auto px-6 pb-6 snap-x snap-mandatory sm:snap-none" style={{ scrollbarWidth: 'thin' }}>
          {/* New leads column */}
          <section className="flex-shrink-0 w-[85vw] sm:w-[270px] snap-start rounded-lg bg-muted/40 flex flex-col max-h-[calc(100vh/var(--ui-zoom)-190px)]" aria-label="New leads">
            <header className="px-3 pt-3 pb-2">
              <p className="text-[12px] font-semibold m-0 flex items-center gap-1.5">New leads <span className="text-[10.5px] font-semibold rounded-[5px] px-1 leading-4 bg-white">{board.leads.length}</span></p>
              <p className="text-[10.5px] text-muted-foreground m-0 mt-0.5">Website and WhatsApp enquiries not yet a company.</p>
            </header>
            <div className="px-2 pb-2 overflow-y-auto flex flex-col gap-2">
              {board.leads.length === 0 && <p className="text-[11.5px] text-muted-foreground text-center py-6 m-0">No unconverted leads.</p>}
              {board.leads.map(l => (
                <article key={l.id} className="rounded-md bg-card px-3 py-2.5" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <p className="text-[12.5px] font-semibold m-0 leading-tight">{l.company || [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || 'Unknown'}</p>
                  <p className="text-[11px] text-muted-foreground m-0 mt-0.5 line-clamp-2">{[l.first_name && l.company ? `${l.first_name} ${l.last_name ?? ''}`.trim() : null, l.topic ?? l.product_line, l.source].filter(Boolean).join(' · ')}</p>
                  {l.message && <p className="text-[11px] text-muted-foreground/80 m-0 mt-1 line-clamp-2 italic">“{l.message}”</p>}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10.5px] text-muted-foreground">{fmtRelative(l.created_at)}</span>
                    <Btn size="xs" level="secondary" onClick={() => convert(l)} loading={busy === l.id}><Building2 size={11} /> Make company</Btn>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {STAGES.map(s => {
            const cards = board.columns[s]
            const money = cards.reduce((n, c) => n + (c.money.find(m => m.currency === 'SGD')?.outstanding ?? 0), 0)
            return (
              <section
                key={s}
                aria-label={STAGE_LABEL[s]}
                onDragOver={e => { e.preventDefault(); if (over !== s) setOver(s) }}
                onDragLeave={() => setOver(null)}
                onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/company'); setOver(null); setDragging(null); if (id) move(id, s) }}
                className={cn('flex-shrink-0 w-[85vw] sm:w-[270px] snap-start rounded-lg flex flex-col max-h-[calc(100vh/var(--ui-zoom)-190px)] transition-colors', over === s ? 'bg-[--primary-light-bg]' : 'bg-muted/40')}
              >
                <header className="px-3 pt-3 pb-2">
                  <p className="text-[12px] font-semibold m-0 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: TONE_STYLE[STAGE_TONE[s]].color }} />
                    {STAGE_LABEL[s]}
                    <span className="text-[10.5px] font-semibold rounded-[5px] px-1 leading-4 bg-white">{cards.length}</span>
                    {money > 0 && <span className="ml-auto text-[10.5px] text-muted-foreground tabular-nums">{fmtMoney(money, 'SGD', { compact: true })} open</span>}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground m-0 mt-0.5">{STAGE_HELP[s]}</p>
                </header>
                <div className="px-2 pb-2 overflow-y-auto flex flex-col gap-2 min-h-[80px]">
                  {cards.length === 0 && <p className="text-[11.5px] text-muted-foreground text-center py-6 m-0">Empty</p>}
                  {cards.map(c => <Card key={c.id} c={c} dragging={dragging === c.id} busy={busy === c.id} onDragStart={e => { e.dataTransfer.setData('text/company', c.id); e.dataTransfer.effectAllowed = 'move'; setDragging(c.id) }} onDragEnd={() => { setDragging(null); setOver(null) }} onMove={to => move(c.id, to)} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
      <NewCompanyDialog open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load() }} />
    </AppScrollPage>
  )
}

function Card({ c, dragging, busy, onDragStart, onDragEnd, onMove }: { c: CompanySummaryRow; dragging: boolean; busy: boolean; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onMove: (to: Stage) => void }) {
  const sgd = c.money.find(m => m.currency === 'SGD') ?? c.money[0]
  return (
    <article draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className={cn('rounded-md bg-card px-3 py-2.5 cursor-grab active:cursor-grabbing', dragging && 'opacity-50', busy && 'opacity-60')} style={{ boxShadow: 'var(--card-shadow)' }}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/companies/${c.id}`} className="text-[12.5px] font-semibold no-underline text-foreground leading-tight hover:underline min-w-0 truncate">{c.name}</Link>
        <select value={c.stage} onChange={e => onMove(e.target.value as Stage)} aria-label="Move to stage" className="h-5 text-[10.5px] rounded-[5px] border border-[--border-subtle] bg-transparent text-muted-foreground px-1 cursor-pointer flex-shrink-0" onClick={e => e.stopPropagation()}>
          {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
      </div>
      <p className="text-[11px] text-muted-foreground m-0 mt-0.5">{c.owner_email ? c.owner_email.split('@')[0] : 'No owner'} · {fmtRelative(c.lastActivityAt)}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {c.needsReply > 0 && <Chip tone="amber"><Reply size={10} /> {c.needsReply}</Chip>}
        {sgd && sgd.overdue > 0 && <Chip tone="red">{fmtMoney(sgd.overdue, sgd.currency, { compact: true })} overdue</Chip>}
        {sgd && sgd.overdue === 0 && sgd.outstanding > 0 && <Chip tone="neutral">{fmtMoney(sgd.outstanding, sgd.currency, { compact: true })} open</Chip>}
        {c.nextRenewalDate && <Chip tone="neutral" title={fmtDate(c.nextRenewalDate)}>Renews {fmtRelative(c.nextRenewalDate)}</Chip>}
        {c.openQuotes > 0 && <Chip tone="blue">{c.openQuotes} quote{c.openQuotes === 1 ? '' : 's'}</Chip>}
        {c.proposedActions > 0 && <Chip tone="blue">{c.proposedActions} to review</Chip>}
      </div>
      {c.suggestedStage && (
        <button onClick={() => onMove(c.suggestedStage!)} className="mt-2 w-full inline-flex items-center justify-between gap-1 rounded-[6px] px-2 py-1 text-[11px] border-0 cursor-pointer" style={{ background: 'var(--primary-light-bg)', color: 'var(--primary-hex)' }}>
          <span>Suggested: {STAGE_LABEL[c.suggestedStage]}</span><ArrowRight size={11} />
        </button>
      )}
    </article>
  )
}
