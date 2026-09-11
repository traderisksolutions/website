'use client'

import Link from 'next/link'
import { ArrowRight, Send, MailOpen, Milestone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, Empty } from './primitives'
import { fmtDateTime, fmtRelative } from '@/lib/crm/format'
import type { Alert, AlertTone, LeftOff } from '@/lib/crm/types'

const DOT: Record<AlertTone, string> = {
  red: 'var(--error)', amber: 'var(--warning)', blue: 'var(--primary-hex)', neutral: 'var(--text-muted)',
}

/** Needs attention: one line per thing, a coloured dot for severity. No boxes, no counts. */
export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  return (
    <SectionCard title="Needs attention">
      {alerts.length === 0 && <Empty compact>Nothing outstanding.</Empty>}
      <ul className="m-0 p-0 list-none flex flex-col">
        {alerts.map(a => {
          const inner = (
            <>
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: DOT[a.tone] }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-snug">{a.title}</span>
                {a.detail && <span className="block text-[11.5px] text-muted-foreground leading-snug">{a.detail}</span>}
              </span>
              {a.href && <ArrowRight size={12} className="mt-1 text-muted-foreground/40 flex-shrink-0" />}
            </>
          )
          return (
            <li key={a.id}>
              {a.href
                ? <Link href={a.href} className="flex items-start gap-2.5 py-1.5 no-underline text-foreground hover:text-primary">{inner}</Link>
                : <div className="flex items-start gap-2.5 py-1.5">{inner}</div>}
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

/** A readable person: a display name when we have one, otherwise the part before the @. */
const who = (s: string) => (s.includes('@') ? s.split('@')[0] : s)

/** Where we left off: the last thing said in each direction, and the last thing we finished. */
export function LeftOffPanel({ leftOff }: { leftOff: LeftOff }) {
  const rows: { icon: React.ElementType; text: React.ReactNode; at: string; href?: string }[] = []
  if (leftOff.lastInbound) rows.push({ icon: MailOpen, at: leftOff.lastInbound.at, href: `/engagement?lead=${leftOff.lastInbound.threadId}`, text: <><strong className="font-semibold">{who(leftOff.lastInbound.from)}</strong> wrote{leftOff.lastInbound.subject ? <> on “{leftOff.lastInbound.subject}”</> : null}</> })
  if (leftOff.lastOutbound) rows.push({ icon: Send, at: leftOff.lastOutbound.at, href: `/engagement?lead=${leftOff.lastOutbound.threadId}`, text: <>We replied, sent by <strong className="font-semibold">{who(leftOff.lastOutbound.by)}</strong></> })
  if (leftOff.lastStageChange) rows.push({ icon: Milestone, at: leftOff.lastStageChange.at, text: <>Moved to {leftOff.lastStageChange.stage}</> })
  rows.sort((a, b) => b.at.localeCompare(a.at))

  return (
    <SectionCard title="Where we left off">
      {rows.length === 0 && <Empty compact>No activity yet.</Empty>}
      <ul className="m-0 p-0 list-none flex flex-col">
        {rows.map((r, i) => {
          const inner = (
            <>
              <r.icon size={13} className="mt-[3px] text-muted-foreground/50 flex-shrink-0" />
              <span className="min-w-0 flex-1 text-[13px] leading-snug">{r.text}</span>
              <span className="text-[11.5px] text-muted-foreground whitespace-nowrap flex-shrink-0" title={fmtDateTime(r.at)}>{fmtRelative(r.at)}</span>
            </>
          )
          return (
            <li key={i} className={cn(i > 0 && 'mt-0.5')}>
              {r.href
                ? <Link href={r.href} className="flex items-start gap-2.5 py-1 no-underline text-foreground hover:text-primary">{inner}</Link>
                : <div className="flex items-start gap-2.5 py-1">{inner}</div>}
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}
