'use client'

/**
 * Today › Renewals due (docs/renewals.md, release 2): renewal tasks due today or before, not done,
 * for the person whose Today is open (or everyone). A row opens the renewal. Nothing shows when
 * nothing is due, or when the read fails (Today never waits on it). No model is called.
 */
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Chip } from '@/components/crm/primitives'
import { callApi } from '@/components/placement/shared'
import { Register, RegisterCell, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { fmtDate } from '@/lib/format'
import { taskName } from '@/lib/renewals/pipeline'
import type { DueTask } from '@/lib/renewals/pipeline-store'
import { ownerName } from './bits'

export function RenewalsDue({ who }: { who: string }) {
  const router = useRouter()
  const [due, setDue] = useState<{ today: string; tasks: DueTask[] } | null>(null)
  useEffect(() => {
    if (!who) return
    callApi<{ tables: boolean; today: string; tasks: DueTask[] }>(`/api/renewals/tasks?who=${encodeURIComponent(who)}`)
      .then(d => setDue(d.tables ? d : null)).catch(() => setDue(null))
  }, [who])
  if (!due?.tasks.length) return null
  const all = who === 'all'
  return (
    <section aria-labelledby="today-renewals" className="mb-7">
      <h2 id="today-renewals" className="m-0 mb-3 text-body font-semibold text-trs-ink">Renewals due · {due.tasks.length}</h2>
      <Register label="Renewals due" minWidth={all ? 760 : 660} maxHeight="20rem">
        <RegisterHead>
          <RegisterTh first>Client</RegisterTh>
          <RegisterTh>Line</RegisterTh>
          <RegisterTh>Task</RegisterTh>
          <RegisterTh>Due</RegisterTh>
          <RegisterTh last={!all}>Expires</RegisterTh>
          {all && <RegisterTh last>Owner</RegisterTh>}
        </RegisterHead>
        <tbody>
          {due.tasks.map(t => (
            <RegisterRow key={`${t.renewal_id}${t.kind}`} onClick={() => router.push(`/renewals/${t.renewal_id}`)}>
              <RegisterCell first primary={t.company ?? 'Client'} />
              <RegisterCell primary={t.line ?? '—'} />
              <RegisterCell primary={taskName(t.kind)} />
              <RegisterCell>{t.due_on < due.today ? <Chip tone="red">{fmtDate(t.due_on)}</Chip> : <Chip tone="amber">Today</Chip>}</RegisterCell>
              <RegisterCell last={!all} primary={fmtDate(t.expiry_date)} />
              {all && <RegisterCell last primary={ownerName(t.owner)} />}
            </RegisterRow>
          ))}
        </tbody>
      </Register>
    </section>
  )
}
