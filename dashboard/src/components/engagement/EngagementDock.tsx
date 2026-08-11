'use client'

import React, { useState, useEffect } from 'react'
import { Reply, Sparkles, FileText, HeartPulse } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'reply' | 'analysis' | 'rfq' | 'gbquote'

/**
 * Bottom tabbed dock for the engagement thread: Reply · AI Analysis · RFQ · GB Quote.
 * All-collapsed by default; one panel open at a time. Panels stay mounted once
 * opened, so a half-written reply / in-progress RFQ survives tab switches.
 */
export function EngagementDock({
  reply, analysis, rfq, gbquote, openSignal,
}: {
  reply:    React.ReactNode
  analysis: React.ReactNode
  rfq:      React.ReactNode
  gbquote:  React.ReactNode
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
    { key: 'gbquote',  label: 'Pricing Quote', icon: <HeartPulse size={13} strokeWidth={2} /> },
  ]

  return (
    <div
      className={cn(
        'flex flex-col min-h-0 border-t border-[--border-subtle] bg-card shadow-[0_-8px_20px_-8px_rgba(15,23,42,0.16)]',
        // When a tab is open, this dock claims an EQUAL flex share against the sibling
        // EaMessageArea (also flex-1) — a true 50/50 split of the remaining column height, so
        // the email stays readable instead of being squeezed to a sliver by a fixed vh-based
        // dock height. Collapsed, it shrinks to just the tab strip.
        active ? 'flex-1' : 'flex-shrink-0',
      )}
    >
      {/* Active panel — always in the DOM (opened, but display:none when not the active tab)
          so state is preserved across tab switches (a half-written reply survives). */}
      <div className={cn('min-h-0 overflow-y-auto', active ? 'flex-1' : 'h-0 overflow-hidden')}>
        {opened.has('reply')    && <div className={cn('h-full', active !== 'reply'    && 'hidden')}>{reply}</div>}
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
