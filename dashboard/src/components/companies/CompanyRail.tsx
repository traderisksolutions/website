'use client'

/**
 * The Company page's right rail (Workbench revamp, 19 Nov 2026), in the thread rail's three groups:
 * Actions (renewals due, drafts to approve, appointment letter needed), AI (the relationship
 * summary on Nexus, run on a press there) and Information (contact, address, last email, letter,
 * the company's Employment Benefits and claims).
 */
import { ActionItem, AiRow, Arrow, Buttons, Group, InfoRow, MAIN, SECOND, Small } from '@/components/engagement/rail-bits'
import { LinkBtn } from '@/components/crm/primitives'
import { fmtDate } from '@/lib/format'
import type { CompanyFacts } from '@/lib/companies/facts'
import type { LetterStatus } from '@/lib/letters/appointment'
import type { Company, CompanyThread, Person } from '@/lib/crm/types'

const LETTER_WORD: Record<LetterStatus['state'], string> = { signed: 'Signed', sent: 'Sent, not signed', needed: 'Needed', none: 'Not on file' }

export function CompanyRail({ company, facts, letter, contact, lastThread, draftsCount, onTab, onDrafts, onLetter }: {
  company: Company
  facts: CompanyFacts | null
  letter: LetterStatus | null
  contact: Person | null
  lastThread: CompanyThread | null
  draftsCount: number | null
  onTab: (t: 'working' | 'nexus' | 'threads') => void
  onDrafts: () => void
  onLetter: () => void
}) {
  const renewals = facts?.renewals ?? []
  const actions = renewals.length > 0 || (draftsCount ?? 0) > 0 || letter?.state === 'needed'
  return (
    <aside aria-label="Company context" className="min-w-0">
      <Group label="Actions">
        {!actions && <Small>Nothing due.</Small>}
        {renewals.length > 0 && (
          <ActionItem eyebrow="Renewal due" title={`${renewals.map(r => r.label).join(', ')} renew${renewals.length === 1 ? 's' : ''} ${fmtDate(renewals[0].date)}`}
            meta={`${renewals[0].days} days`} alert={renewals[0].days <= 21}>
            <Buttons>
              <button type="button" className={MAIN} onClick={() => onTab('working')}>Request to insurers</button>
              {lastThread && <button type="button" className={SECOND} onClick={() => onTab('threads')}>Open thread</button>}
            </Buttons>
          </ActionItem>
        )}
        {(draftsCount ?? 0) > 0 && (
          <ActionItem eyebrow="Drafts" title={`${draftsCount} draft${draftsCount === 1 ? '' : 's'} to approve`}>
            <Buttons><button type="button" className={SECOND} onClick={onDrafts}>Review</button></Buttons>
          </ActionItem>
        )}
        {letter?.state === 'needed' && (
          <ActionItem eyebrow="Appointment letter" title="Letter needed before insurers quote">
            <Buttons><button type="button" className={SECOND} onClick={onLetter}>Create letter</button></Buttons>
          </ActionItem>
        )}
      </Group>
      <Group label="AI">
        <AiRow title="Summarise relationship" detail="Threads, policies and cases" action="Open" onClick={() => onTab('nexus')} />
      </Group>
      <Group label="Information">
        <InfoRow label="Contact">{contact ? <>{contact.name ?? contact.email}{contact.title && <><br /><Small>{contact.title}</Small></>}</> : <Small>None on file</Small>}</InfoRow>
        <InfoRow label="Address">{company.address ? company.address : <Small>None on file</Small>}</InfoRow>
        <InfoRow label="Last email">{lastThread?.last_message_at ? <Arrow onClick={() => onTab('threads')}>{fmtDate(lastThread.last_message_at)}</Arrow> : <Small>None</Small>}</InfoRow>
        <InfoRow label="Letter">
          {letter ? <>{letter.url ? <a href={letter.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{LETTER_WORD[letter.state]}</a> : LETTER_WORD[letter.state]}{letter.at && <Small> · {fmtDate(letter.at)}</Small>}</> : <Small>Loading</Small>}
          <br /><button type="button" onClick={onLetter} className="mt-0.5 border-0 bg-transparent p-0 text-[13px] text-trs-green underline underline-offset-[3px] cursor-pointer">{letter?.state === 'signed' ? 'New letter' : 'Create letter'}</button>
        </InfoRow>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <LinkBtn href={`/companies/${company.id}?tab=eb`} size="xs">Employment Benefits</LinkBtn>
          <LinkBtn href={`/claims?company=${company.id}`} size="xs">Claims</LinkBtn>
        </div>
      </Group>
    </aside>
  )
}
