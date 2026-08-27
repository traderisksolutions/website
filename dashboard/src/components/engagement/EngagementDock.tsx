'use client'

import React, { useState, useEffect } from 'react'
import { Sparkles, FileText, HeartPulse } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'analysis' | 'rfq' | 'gbquote'

/**
 * Bottom tabbed dock for the engagement thread: AI Analysis · RFQ · Pricing Quote — the "bottom
 * action bar", distinct from the reply composer (which now lives in-flow at the end of the
 * scrollable thread, not as a dock tab — see ThreadView). All-collapsed by default; one panel
 * open at a time. Panels stay mounted once opened, so in-progress RFQ/quote state survives tab
 * switches.
 */
export function EngagementDock({
  analysis, rfq, gbquote, openSignal,
}: {
  analysis: React.ReactNode
  rfq:      React.ReactNode
  gbquote:  React.ReactNode
  /** Imperatively open a tab. */
  openSignal?: { tab: Tab; stamp: number }
}) {
  const [active, setActive] = useState<Tab | null>(null)
  const [opened, setOpened] = useState<Set<Tab>>(new Set())

  function pick(tab: Tab) {
    setActive(prev => (prev === tab ? null : tab))
    setOpened(prev => (prev.has(tab) ? prev : new Set(prev).add(tab)))
  }

  useEffect(() => {
    if (!openSignal) return
    setActive(openSignal.tab)
    setOpened(prev => (prev.has(openSignal.tab) ? prev : new Set(prev).add(openSignal.tab)))
  }, [openSignal?.stamp]) // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'analysis', label: 'AI Analysis',   icon: <Sparkles size={13} strokeWidth={2} /> },
    { key: 'rfq',      label: 'RFQ',           icon: <FileText size={13} strokeWidth={2} /> },
    { key: 'gbquote',  label: 'Pricing Quote', icon: <HeartPulse size={13} strokeWidth={2} /> },
  ]

  return (
    <div
      className="flex flex-col min-h-0 flex-shrink-0 border-t border-[--border-subtle] bg-card shadow-[0_-8px_20px_-8px_rgba(15,23,42,0.16)]"
      style={{ height: active ? 'min(38vh, 380px)' : undefined }}
    >
      {/* Active panel — always in the DOM (opened, but display:none when not the active tab)
          so state is preserved across tab switches. Capped at 38vh/380px above (not a 50/50
          flex split against the message area) — the thread needs to stay the dominant reading
          surface even with a panel open. */}
      <div className={cn('min-h-0 overflow-y-auto', active ? 'flex-1' : 'h-0 overflow-hidden')}>
        {opened.has('analysis') && <div className={cn(active !== 'analysis' && 'hidden')}>{analysis}</div>}
        {opened.has('rfq')      && <div className={cn(active !== 'rfq'      && 'hidden')}>{rfq}</div>}
        {opened.has('gbquote')  && <div className={cn(active !== 'gbquote'  && 'hidden')}>{gbquote}</div>}
      </div>

      {/* Tab strip */}
      <div className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border-t border-[--border-subtle]/60">
        {tabs.map(t => {
          const on = active === t.key
          return (
            <button
              key={t.key}
              onClick={() => pick(t.key)}
              className={cn(
                'flex items-center gap-1.5 text-[11.5px] font-semibold rounded-lg px-3 py-1.5 transition-colors',
                on ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
