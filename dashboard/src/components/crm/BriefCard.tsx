'use client'

import { useState } from 'react'
import { Sparkles, RefreshCw, Brain, Plus, AlertTriangle, CalendarClock } from 'lucide-react'
import { SectionCard, Btn, Chip, Empty } from './primitives'
import { fmtRelative, fmtDate } from '@/lib/crm/format'
import { STAGE_LABEL, ACTION_KIND_LABEL, type AiBrief, type Company, type Stage } from '@/lib/crm/types'

/** The saved company brief with generate / deep-analysis controls. */
export function BriefCard({ company, onBrief, onAddAction, onApplyStage }: {
  company: Company
  onBrief: (b: AiBrief) => void
  onAddAction: (item: AiBrief['open_items'][number]) => Promise<void>
  onApplyStage: (s: Stage) => Promise<void>
}) {
  const [busy, setBusy] = useState<'flash' | 'deep' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const brief = company.ai_brief

  async function run(deep: boolean) {
    setBusy(deep ? 'deep' : 'flash'); setError(null)
    try {
      const res = await fetch(`/api/companies/${company.id}/brief`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deep }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'The brief could not be generated.')
      onBrief(d.brief)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(null) }
  }

  const actions = (
    <>
      <Btn size="xs" level={brief ? 'secondary' : 'primary'} onClick={() => run(false)} loading={busy === 'flash'} disabled={busy !== null}>
        {brief ? <RefreshCw size={12} /> : <Sparkles size={12} />} {brief ? 'Refresh' : 'Generate brief'}
      </Btn>
      <Btn size="xs" level="tertiary" onClick={() => run(true)} loading={busy === 'deep'} disabled={busy !== null} title="Slower and more thorough. Uses Claude Opus.">
        <Brain size={12} /> Deep analysis
      </Btn>
    </>
  )

  return (
    <SectionCard title="Company brief" description={brief ? `${brief.deep ? 'Deep analysis' : 'Quick brief'} · ${fmtRelative(brief.generated_at)} · ${brief.model}` : 'What is going on with this client, in one read.'} actions={actions}>
      {error && <p className="text-[12px] text-destructive mb-2 m-0">{error}</p>}
      {!brief && !busy && <Empty compact>No brief yet. Generate one to see where this relationship stands.</Empty>}
      {!brief && busy && <Empty compact>Reading the threads, payments and quotes…</Empty>}
      {brief && (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-foreground m-0">{brief.summary}</p>
          {brief.relationship && <p className="text-[12px] text-muted-foreground m-0">{brief.relationship}</p>}

          {brief.suggested_stage && brief.suggested_stage !== company.stage && (
            <div className="rounded-md px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap" style={{ background: 'var(--primary-light-bg)', borderLeft: '3px solid var(--primary-light-border)' }}>
              <p className="text-[12px] m-0">The agent suggests moving this company to <strong>{STAGE_LABEL[brief.suggested_stage]}</strong> (currently {STAGE_LABEL[company.stage]}).</p>
              <Btn size="xs" onClick={() => onApplyStage(brief.suggested_stage!)}>Apply</Btn>
            </div>
          )}

          {brief.open_items.length > 0 && (
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5 m-0">Open items</p>
              <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[--border-subtle]">
                {brief.open_items.map((it, i) => (
                  <li key={i} className="py-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium m-0 flex items-center gap-1.5 flex-wrap">
                        {it.title}
                        {it.kind && <Chip tone="neutral">{ACTION_KIND_LABEL[it.kind]}</Chip>}
                        {it.due && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><CalendarClock size={11} /> {fmtDate(it.due)}</span>}
                      </p>
                      {it.detail && <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5">{it.detail}</p>}
                    </div>
                    <Btn size="xs" level="tertiary" loading={adding === it.title} onClick={async () => { setAdding(it.title); try { await onAddAction(it) } finally { setAdding(null) } }}>
                      <Plus size={12} /> Add as action
                    </Btn>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {brief.risks.length > 0 && (
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5 m-0">Risks</p>
                <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
                  {brief.risks.map((r, i) => <li key={i} className="text-[12px] flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--warning)' }} /> <span>{r}</span></li>)}
                </ul>
              </div>
            )}
            {brief.upcoming.length > 0 && (
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5 m-0">Upcoming</p>
                <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
                  {brief.upcoming.map((u, i) => <li key={i} className="text-[12px] flex justify-between gap-2"><span>{u.what}</span><span className="text-muted-foreground whitespace-nowrap">{u.when ? fmtDate(u.when) : ''}</span></li>)}
                </ul>
              </div>
            )}
          </div>

          {brief.sources.length > 0 && (
            <p className="text-[11px] text-muted-foreground m-0">Based on: {brief.sources.join(' · ')}</p>
          )}
        </div>
      )}
    </SectionCard>
  )
}
