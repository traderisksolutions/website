'use client'

import { useRouter } from 'next/navigation'
import { SectionCard, Empty } from './primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/crm/format'
import type { ActivityEvent, ActivityKind } from '@/lib/crm/types'

const BODY = '#3c4043'

const KIND_LABEL: Record<ActivityKind, string> = {
  email_in: 'Email in', email_out: 'Email out', ai_draft: 'Draft', debit_note: 'Debit note', payment: 'Payment',
  quote: 'Quote', case: 'Case', stage: 'Stage', note: 'Note',
}

/** Everything that happened, newest first, on the register: kind, what, when. A row opens what it names. */
export function CompanyTimeline({ events, limit, title = 'Activity' }: { events: ActivityEvent[]; limit?: number; title?: string }) {
  const router = useRouter()
  const rows = limit ? events.slice(0, limit) : events
  return (
    <SectionCard title={title}>
      {rows.length === 0 ? <Empty compact>Nothing yet.</Empty> : (
        <Register label={title} minWidth={0}>
          <RegisterHead>
            <RegisterTh first>What</RegisterTh>
            <RegisterTh>Kind</RegisterTh>
            <RegisterTh align="right" last>When</RegisterTh>
          </RegisterHead>
          <tbody>
            {rows.map(e => (
              <RegisterRow key={e.id} onClick={e.href ? () => router.push(e.href!) : undefined}>
                <RegisterCell first identityWidth={520} primary={e.title} secondary={e.detail ?? undefined} />
                <RegisterCell><span className="text-[14px]" style={{ color: BODY }}>{KIND_LABEL[e.kind]}</span></RegisterCell>
                <RegisterCell last align="right" title={fmtDateTime(e.at)} primary={fmtRelative(e.at)} secondary={fmtDate(e.at)} />
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
    </SectionCard>
  )
}
