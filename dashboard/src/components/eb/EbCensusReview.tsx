'use client'

/**
 * Under the census on /eb (docs/eb-v2.md P4): the checks by code, and the changes from the
 * previous plan year's census in the scheme file. Numbers and names; nothing to read between.
 */
import { useMemo } from 'react'
import { Chip } from '@/components/crm/primitives'
import { Register, RegisterCell, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import type { Member } from '@/lib/gb-quote'
import { censusChanges, censusChecks } from '@/lib/gb/scheme'
import { fmtDate } from '@/lib/format'
import type { FoundFile } from './EbDocs'

const SHOWN = 6
const names = (list: string[]) => list.length ? `${list.slice(0, SHOWN).join(', ')}${list.length > SHOWN ? ` and ${list.length - SHOWN} more` : ''}` : '–'

export function EbCensusReview({ members, effectiveDate, previous }: { members: Member[]; effectiveDate: string; previous: { plan_year: string; members: Member[] } | null }) {
  const checks = useMemo(() => censusChecks(members, effectiveDate), [members, effectiveDate])
  const changes = useMemo(() => previous ? censusChanges(previous.members, members) : null, [previous, members])
  return (
    <div className="flex flex-col gap-4">
      {checks.length === 0 ? <div><Chip tone="green">Census checks: none found</Chip></div> : (
        <Register label="Census checks" minWidth={640}>
          <RegisterHead>
            <RegisterTh first width={300}>Census check</RegisterTh>
            <RegisterTh width={80}>Lives</RegisterTh>
            <RegisterTh last>Names</RegisterTh>
          </RegisterHead>
          <tbody>
            {checks.map(c => (
              <RegisterRow key={c.key}>
                <RegisterCell first primary={c.label} />
                <RegisterCell>{c.names.length}</RegisterCell>
                <RegisterCell last align="left">{names(c.names)}</RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
      {changes && previous && (
        <Register label={`Changes since ${previous.plan_year}`} minWidth={640}>
          <RegisterHead>
            <RegisterTh first width={300}>{`Changes since ${previous.plan_year}`}</RegisterTh>
            <RegisterTh width={80}>Lives</RegisterTh>
            <RegisterTh last>Names</RegisterTh>
          </RegisterHead>
          <tbody>
            <RegisterRow><RegisterCell first primary="Lives on the census" /><RegisterCell>{`${changes.previous} → ${changes.now}`}</RegisterCell><RegisterCell last align="left">–</RegisterCell></RegisterRow>
            <RegisterRow><RegisterCell first primary="Joined" /><RegisterCell>{changes.joiners.length}</RegisterCell><RegisterCell last align="left">{names(changes.joiners)}</RegisterCell></RegisterRow>
            <RegisterRow><RegisterCell first primary="Left" /><RegisterCell>{changes.leavers.length}</RegisterCell><RegisterCell last align="left">{names(changes.leavers)}</RegisterCell></RegisterRow>
            <RegisterRow><RegisterCell first primary="Changed category" /><RegisterCell>{changes.moved.length}</RegisterCell><RegisterCell last align="left">{names(changes.moved)}</RegisterCell></RegisterRow>
          </tbody>
        </Register>
      )}
    </div>
  )
}

/** Billing and claims files the data room holds for the client: optional, never blocking. */
export function EbOptionalFiles({ files }: { files: (FoundFile & { kind: string })[] }) {
  if (!files.length) return null
  return (
    <Register label="Billing and claims on file" minWidth={640}>
      <RegisterHead>
        <RegisterTh first width={110}>Received</RegisterTh>
        <RegisterTh width={100}>Kind</RegisterTh>
        <RegisterTh last>Billing and claims on file</RegisterTh>
      </RegisterHead>
      <tbody>
        {files.map(f => (
          <RegisterRow key={f.attachment_id}>
            <RegisterCell first primary={fmtDate(f.at)} />
            <RegisterCell>{f.kind}</RegisterCell>
            <RegisterCell last align="left" title={f.filename}>
              <a href={`/api/engagement/attachments/${f.attachment_id}/download`} target="_blank" rel="noreferrer" className="no-underline hover:underline text-trs-ink">{f.filename}</a>
            </RegisterCell>
          </RegisterRow>
        ))}
      </tbody>
    </Register>
  )
}
