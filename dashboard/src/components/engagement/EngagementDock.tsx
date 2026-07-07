'use client'

import React, { useState, useEffect } from 'react'
import { Reply, Sparkles, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'reply' | 'analysis' | 'rfq'

/**
 * Bottom tabbed dock for the engagement thread: Reply · AI Analysis · RFQ.
 * All-collapsed by default; one panel open at a time. Panels stay mounted once
 * opened, so a half-written reply / in-progress RFQ survives tab switches.
 */
export function EngagementDock({
  reply, analysis, rfq, openSignal,
}: {
  reply:    React.ReactNode
  analysis: React.ReactNode
  rfq:      React.ReactNode
  /** Imperatively open a tab (e.g. a draft arriving from a Nexus roadmap step). */
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
    { key: 'reply',    label: 'Reply',       icon: <Reply size={13} strokeWidth={2} /> },
    { key: 'analysis', label: 'AI Analysis', icon: <Sparkles size={13} strokeWidth={2} /> },
    { key: 'rfq',      label: 'RFQ',         icon: <FileText size={13} strokeWidth={2} /> },
  ]

  return (
    <div className="flex-shrink-0 border-t border-[--border-subtle] bg-card">
      {/* Active panel — always in the DOM (height 0 when collapsed) so state is preserved */}
      <div
        className="overflow-hidden transition-[height] duration-150"
        style={{ height: active ? 'min(46vh, 460px)' : 0 }}
      >
        <div className="h-full overflow-y-auto">
          {opened.has('reply')    && <div className={cn(active !== 'reply'    && 'hidden')}>{reply}</div>}
          {opened.has('analysis') && <div className={cn(active !== 'analysis' && 'hidden')}>{analysis}</div>}
          {opened.has('rfq')      && <div className={cn(active !== 'rfq'      && 'hidden')}>{rfq}</div>}
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-t border-[--border-subtle]/60">
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
