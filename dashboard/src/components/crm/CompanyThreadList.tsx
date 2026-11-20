'use client'

/**
 * A client's threads by where they sit: Active, Back burner, Member movements, each with its
 * label, who it waits on and the open case it is on (companyThreadRelevance). Insurer
 * threads that name the client are listed "via <insurer>". A row opens the thread in the reader.
 * Threads in a colleague's mailbox are counted, never listed (INB-002). With no threads at all,
 * Find threads searches the unfiled mail by the company's domains and name.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Btn, Chip, Empty, Segmented, Spinner } from './primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { errText } from '@/components/placement/shared'
import { fmtDate, DASH } from '@/lib/format'
import { LABEL_NAME } from '@/lib/cases/labels'
import { RELEVANCE, RELEVANCE_NAME, type Relevance } from '@/lib/cases/relevance'
import { WAITING_ON_WORD } from '@/lib/crm/waiting-on'
import type { CompanyRelevance } from '@/lib/cases/sources-store'
import { unwrap } from '@/lib/action-result'
import { decideThread } from '@/app/companies/triage/actions'
import { companyThreadRelevance, findCompanyThreads } from '@/app/companies/[id]/actions'

export function CompanyThreadList({ companyId, onOpen, onLinked }: {
  companyId: string
  /** Opens a thread in the reader. */
  onOpen: (threadId: string) => void
  /** A thread was linked from Find threads; the page reloads its threads. */
  onLinked?: () => void
}) {
  const [data, setData] = useState<CompanyRelevance | null>(null)
  const [tab, setTab] = useState<Relevance>('active')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setData(null); setError(null)
    companyThreadRelevance(companyId).then(unwrap)
      // Open on the first group that holds anything.
      .then(d => { setData(d); setTab(RELEVANCE.find(r => d.counts[r] > 0) ?? 'active') })
      .catch(e => setError(errText(e)))
  }, [companyId])
  useEffect(() => { load() }, [load])

  if (error) return <p className="m-0 text-body text-trs-neg" role="alert">Threads did not load: {error}</p>
  if (!data) return <Spinner label="Loading threads…" />
  if (data.threads.length === 0) {
    return (
      <section aria-label="Threads" className="flex flex-col gap-3 min-w-0">
        <FindThreads companyId={companyId} onLinked={() => { load(); onLinked?.() }} />
        <HiddenThreads hidden={data.hidden} />
      </section>
    )
  }
  const rows = data.threads.filter(t => t.relevance === tab)

  return (
    <section aria-label="Threads by relevance" className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
        <Segmented<Relevance> value={tab} onChange={setTab} label="Relevance" options={RELEVANCE.map(r => ({ value: r, label: RELEVANCE_NAME[r], count: data.counts[r] }))} />
        {data.season.on && <span className="text-body text-trs-ink-2">Renewal season · {[data.season.basis, data.season.date ? fmtDate(data.season.date) : null].filter(Boolean).join(' ')}</span>}
      </div>
      {rows.length === 0 ? <Empty compact>No threads in this group.</Empty> : (
        <Register label="Threads" minWidth={860}>
          <RegisterHead>
            <RegisterTh first>Thread</RegisterTh><RegisterTh>Label</RegisterTh><RegisterTh>Waiting on</RegisterTh><RegisterTh>Last message</RegisterTh><RegisterTh last>Case</RegisterTh>
          </RegisterHead>
          <tbody>
            {rows.map(t => (
              <RegisterRow key={t.id}>
                <RegisterCell first identityWidth={340}
                  primary={<button type="button" onClick={() => onOpen(t.id)} className="block max-w-full truncate bg-transparent border-0 p-0 cursor-pointer text-left text-trs-ink font-medium hover:underline" title={t.subject ?? undefined}>{t.subject || 'No subject'}</button>}
                  secondary={t.via ? `via ${t.via}` : undefined} />
                <RegisterCell><Chip>{LABEL_NAME[t.label]}</Chip></RegisterCell>
                <RegisterCell>{t.waitingOn ? WAITING_ON_WORD[t.waitingOn] : <span className="text-trs-muted">{DASH}</span>}</RegisterCell>
                <RegisterCell className="tabular-nums">{fmtDate(t.last_message_at)}</RegisterCell>
                <RegisterCell last align="left">{t.case ? <Link href={`/today/${t.case.id}`} className="block max-w-[260px] truncate text-trs-ink no-underline hover:underline">{t.case.title ?? 'Open case'}</Link> : <span className="text-trs-muted">{DASH}</span>}</RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
      <HiddenThreads hidden={data.hidden} />
    </section>
  )
}

/** The count of threads in colleagues' mailboxes (never listed) and the mail rule (INB-002). */
export function HiddenThreads({ hidden }: { hidden: number }) {
  return (
    <div className="text-body text-trs-muted">
      {hidden > 0 && <p className="m-0">{hidden} more in colleagues’ mailboxes</p>}
      <p className="m-0">Mail you see: own inbox and Operations, plus threads you are on.</p>
    </div>
  )
}

type Found = { id: string; subject: string | null; last_message_at: string | null; matched: 'domain' | 'name' }

/** Empty Threads tab: search the unfiled mail by the company's domains and name, then Link each by hand. */
export function FindThreads({ companyId, onLinked }: { companyId: string; onLinked: () => void }) {
  const [found, setFound] = useState<{ threads: Found[]; hidden: number; searched: { domains: string[]; name: string | null } } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [linked, setLinked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  async function find() {
    setBusy('find'); setError(null)
    try { setFound(unwrap(await findCompanyThreads(companyId))) }
    catch (e) { setError(errText(e)) }
    finally { setBusy(null) }
  }
  async function link(id: string) {
    setBusy(id); setError(null)
    try {
      unwrap(await decideThread(id, { decision: 'link', companyId }))
      setLinked(s => new Set(s).add(id))
      onLinked()
    } catch (e) { setError(errText(e)) }
    finally { setBusy(null) }
  }

  const searched = found ? [...found.searched.domains, found.searched.name ? `“${found.searched.name}”` : null].filter(Boolean).join(', ') : ''
  return (
    <div className="flex flex-col gap-3 min-w-0">
      {!found && <Empty action={<Btn level="primary" loading={busy === 'find'} onClick={() => void find()}>Find threads</Btn>}>No threads are filed under this company.</Empty>}
      {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}
      {found && (found.threads.length === 0
        ? <Empty compact>No unfiled threads match {searched || 'this company'}.</Empty>
        : (
          <Register label="Unfiled threads that match" minWidth={720}>
            <RegisterHead><RegisterTh first>Thread</RegisterTh><RegisterTh>Matched on</RegisterTh><RegisterTh>Last message</RegisterTh><RegisterTh last>Link</RegisterTh></RegisterHead>
            <tbody>
              {found.threads.map(t => (
                <RegisterRow key={t.id}>
                  <RegisterCell first identityWidth={340} primary={<Link href={`/engagement?lead=${t.id}`} className="text-trs-ink no-underline hover:underline" title={t.subject ?? undefined}>{t.subject || 'No subject'}</Link>} />
                  <RegisterCell>{t.matched === 'domain' ? 'Domain' : 'Name'}</RegisterCell>
                  <RegisterCell className="tabular-nums">{fmtDate(t.last_message_at)}</RegisterCell>
                  <RegisterCell last>{linked.has(t.id) ? 'Linked' : <Btn size="xs" loading={busy === t.id} disabled={!!busy} onClick={() => void link(t.id)}>Link</Btn>}</RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        ))}
      {found && found.hidden > 0 && <p className="m-0 text-body text-trs-muted">{found.hidden} more in colleagues’ mailboxes</p>}
    </div>
  )
}
