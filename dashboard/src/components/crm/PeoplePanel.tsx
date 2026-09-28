'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { SectionCard, Chip, Empty, Btn } from './primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { PersonTag } from '@/components/board/TodoEditor'
import type { StaffMember } from '@/lib/crm/staff'
import { fmtRelative } from '@/lib/crm/format'
import type { Person, PersonParty } from '@/lib/crm/types'

const INK = '#202124'
const MUTED = '#5f6368'
const PARTY_LABEL: Record<PersonParty, string> = { client: 'Client', insurer: 'Insurer', trs: 'TRS', other: 'Other' }

export function PeoplePanel({ people, observedDomains, knownDomains, onAddDomain }: {
  people: Person[]
  observedDomains?: { domain: string; count: number }[]
  knownDomains?: string[]
  onAddDomain?: (d: string) => Promise<void>
}) {
  const [adding, setAdding] = useState<string | null>(null)
  const clientSide = people.filter(p => p.party === 'client' || p.party === 'other')
  const others = people.filter(p => p.party === 'insurer' || p.party === 'trs')
  const newDomains = (observedDomains ?? []).filter(d => !(knownDomains ?? []).includes(d.domain))

  // PersonTag reads names from a staff map; build one from the people on these threads.
  const names = useMemo(() => {
    const m = new Map<string, StaffMember>()
    for (const p of people) m.set(p.email, { email: p.email, name: p.name ?? p.email, actions: 0 })
    return m
  }, [people])

  const identity = (p: Person) => (
    <span className="flex items-center gap-3 min-w-0">
      <PersonTag email={p.email} staff={names} size="md" />
      <span className="min-w-0">
        <span className="block text-[15px] font-medium leading-tight truncate" style={{ color: INK }}>{p.name ?? p.email}</span>
        <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: MUTED }}>{p.title ?? 'No title on file'}</span>
      </span>
    </span>
  )

  const email = (p: Person) => (
    <a href={`mailto:${p.email}`} className="text-[14px] no-underline hover:underline" style={{ color: INK }}>{p.email}</a>
  )

  return (
    <>
      <SectionCard title="People">
        {clientSide.length === 0 && <Empty compact>No client correspondents yet. Link a thread to this company first.</Empty>}
        {clientSide.length > 0 && (
          <Register label="Client correspondents" minWidth={900}>
            <RegisterHead>
              <RegisterTh first>Person</RegisterTh>
              <RegisterTh>Email</RegisterTh>
              <RegisterTh>Role</RegisterTh>
              <RegisterTh>Topics</RegisterTh>
              <RegisterTh align="right">Threads</RegisterTh>
              <RegisterTh last align="right">Last correspondence</RegisterTh>
            </RegisterHead>
            <tbody>
              {clientSide.map(p => (
                <RegisterRow key={p.email}>
                  <RegisterCell first>{identity(p)}</RegisterCell>
                  <RegisterCell>{email(p)}</RegisterCell>
                  <RegisterCell>
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      {p.isPrimary && <Chip title="Most active client contact">Point person</Chip>}
                      {p.party === 'other' && <Chip title="Domain is not one of the company's domains">{PARTY_LABEL.other}</Chip>}
                      {p.sent === 0 && p.received === 0 && p.cc > 0 && <Chip title="Only ever copied, never wrote or was written to">Copied only</Chip>}
                      {!p.isPrimary && p.party !== 'other' && !(p.sent === 0 && p.received === 0 && p.cc > 0) && <span className="text-[13.5px]" style={{ color: '#3c4043' }}>Contact</span>}
                    </span>
                  </RegisterCell>
                  <RegisterCell primary={p.topics[0] ? <span className="capitalize">{p.topics.slice(0, 2).map(t => t.category).join(', ')}</span> : <span style={{ color: '#9aa0a6' }}>—</span>} />
                  <RegisterCell align="right" primary={p.threads} secondary={`wrote ${p.sent} · sent to ${p.received} · copied ${p.cc}`} />
                  <RegisterCell last align="right" primary={fmtRelative(p.lastSeen)} secondary={p.firstSeen ? `first ${fmtRelative(p.firstSeen)}` : undefined} />
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        )}

        {onAddDomain && newDomains.length > 0 && (
          <div className="mt-4">
            <p className="text-[13px] m-0 mb-2" style={{ color: MUTED }}>Seen on client emails but not in this company&apos;s domain list</p>
            <div className="flex flex-wrap gap-2">
              {newDomains.map(d => (
                <Btn key={d.domain} size="xs" level="secondary" loading={adding === d.domain} onClick={async () => { setAdding(d.domain); try { await onAddDomain(d.domain) } finally { setAdding(null) } }}>
                  <Plus size={11} /> {d.domain} <span className="font-normal" style={{ color: MUTED }}>({d.count})</span>
                </Btn>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {others.length > 0 && (
        <SectionCard title="Also on these threads">
          <Register label="Insurer and TRS correspondents" minWidth={720}>
            <RegisterHead>
              <RegisterTh first>Person</RegisterTh>
              <RegisterTh>Email</RegisterTh>
              <RegisterTh>Party</RegisterTh>
              <RegisterTh last align="right">Last correspondence</RegisterTh>
            </RegisterHead>
            <tbody>
              {others.map(p => (
                <RegisterRow key={p.email}>
                  <RegisterCell first>{identity(p)}</RegisterCell>
                  <RegisterCell>{email(p)}</RegisterCell>
                  <RegisterCell><Chip>{PARTY_LABEL[p.party]}</Chip></RegisterCell>
                  <RegisterCell last align="right" primary={fmtRelative(p.lastSeen)} secondary={`${p.threads} thread${p.threads === 1 ? '' : 's'}`} />
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        </SectionCard>
      )}
    </>
  )
}
