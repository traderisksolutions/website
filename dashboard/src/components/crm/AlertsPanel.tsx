'use client'

import { useRouter } from 'next/navigation'
import { SectionCard, Empty } from './primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/crm/format'
import type { Alert, LeftOff } from '@/lib/crm/types'

const BODY = '#3c4043'

/** Open items on the register: the item, its detail, when. A row opens what it names. */
export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  const router = useRouter()
  return (
    <SectionCard title="Open items">
      {alerts.length === 0 ? <Empty compact>Nothing open.</Empty> : (
        <Register label="Open items" minWidth={0}>
          <RegisterHead>
            <RegisterTh first>Item</RegisterTh>
            <RegisterTh>Detail</RegisterTh>
            <RegisterTh align="right" last>When</RegisterTh>
          </RegisterHead>
          <tbody>
            {alerts.map(a => (
              <RegisterRow key={a.id} onClick={a.href ? () => router.push(a.href!) : undefined}>
                <RegisterCell first identityWidth={520} primary={a.title} />
                <RegisterCell nowrap={false}><span className="text-[14px]" style={{ color: BODY }}>{a.detail ?? '—'}</span></RegisterCell>
                <RegisterCell last align="right" title={a.at ? fmtDateTime(a.at) : undefined} primary={a.at ? fmtRelative(a.at) : '—'} secondary={a.at ? fmtDate(a.at) : undefined} />
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
    </SectionCard>
  )
}

/** A readable person: a display name when we have one, otherwise the part before the @. */
const who = (s: string) => (s.includes('@') ? s.split('@')[0] : s)

/** Where we left off on the register: what happened, who, when. */
export function LeftOffPanel({ leftOff }: { leftOff: LeftOff }) {
  const router = useRouter()
  const rows: { event: string; detail: string | null; who: string | null; at: string; href?: string }[] = []
  if (leftOff.lastInbound) rows.push({ event: 'They wrote', detail: leftOff.lastInbound.subject, who: who(leftOff.lastInbound.from), at: leftOff.lastInbound.at, href: `/engagement?lead=${leftOff.lastInbound.threadId}` })
  if (leftOff.lastOutbound) rows.push({ event: 'We replied', detail: leftOff.lastOutbound.subject, who: who(leftOff.lastOutbound.by), at: leftOff.lastOutbound.at, href: `/engagement?lead=${leftOff.lastOutbound.threadId}` })
  if (leftOff.lastStageChange) rows.push({ event: `Moved to ${leftOff.lastStageChange.stage}`, detail: null, who: leftOff.lastStageChange.by ? who(leftOff.lastStageChange.by) : null, at: leftOff.lastStageChange.at })
  rows.sort((a, b) => b.at.localeCompare(a.at))

  return (
    <SectionCard title="Where we left off">
      {rows.length === 0 ? <Empty compact>No activity yet.</Empty> : (
        <Register label="Where we left off" minWidth={0}>
          <RegisterHead>
            <RegisterTh first>Event</RegisterTh>
            <RegisterTh>Who</RegisterTh>
            <RegisterTh align="right" last>When</RegisterTh>
          </RegisterHead>
          <tbody>
            {rows.map((r, i) => (
              <RegisterRow key={i} onClick={r.href ? () => router.push(r.href!) : undefined}>
                <RegisterCell first identityWidth={520} primary={r.event} secondary={r.detail ?? undefined} />
                <RegisterCell><span className="text-[14px]" style={{ color: BODY }}>{r.who ?? '—'}</span></RegisterCell>
                <RegisterCell last align="right" title={fmtDateTime(r.at)} primary={fmtRelative(r.at)} secondary={fmtDate(r.at)} />
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
    </SectionCard>
  )
}
