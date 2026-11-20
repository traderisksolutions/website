'use client'

import { Breadcrumbs } from '@/components/nav/Breadcrumbs'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Btn, Chip, Segmented, Spinner, Empty, inputCls } from '@/components/crm/primitives'
import { PageHeader } from '@/components/page-header'
import { Input } from '@/components/ui/input'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { useConfirm } from '@/components/ui/confirm'
import { CompanySearchSelect } from '@/components/crm/CompanySearchSelect'
import { ReferralReview } from '@/components/crm/ReferralReview'
import { HiddenThreads } from '@/components/crm/CompanyThreadList'
import { timeAgo as fmtRelative } from '@/lib/format'
import { COMPANY_KINDS, type CompanyKind, type LinkSuggestion } from '@/lib/crm/types'
import type { ReferralRow } from '@/lib/crm/referral-review'

/**
 * Unfiled threads (/companies/triage): mail with no company yet, as registers. Domains to decide,
 * Leftover threads, Under an insurer, Duplicates and Referrals; every count loads on arrival
 * (CLI-025). Only threads the signed-in person may see are listed (INB-002).
 */
const MUTED = 'var(--trs-muted)'
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

type CompanyOpt = { id: string; name: string; domains: string[] }
type DomainRow = {
  domain: string; threads: number; people: string[]; subjects: string[]
  counterparties: string[]
  alsoOn: { domain: string; threads: number }[]
  previews: { subject: string | null; snippet: string | null; date: string | null }[]
  inbound: number; outbound: number; handledBy: string[]
  suggestion: { name: string; kind: CompanyKind; confidence: number; reason: string; evidence: string | null; alternative: { kind: CompanyKind; why: string } | null } | null
  nearest: { companyId: string; name: string; kind: CompanyKind; score: number; matchedOn: string }[]
}
type ThreadRow = {
  id: string; subject: string | null; snippet: string | null; category: string | null; last_message_at: string | null
  contacts: { id: string; email: string | null; first_name: string | null; last_name: string | null; company: string | null } | null
  participants: { email: string; name: string | null }[]
  suggestion: LinkSuggestion | null
}
type DupPair = { score: number; matchedOn: string; a: { id: string; name: string; kind: string; domains: string[] }; b: { id: string; name: string; kind: string; domains: string[] } }

type MisfiledThread = {
  id: string; subject: string | null; lastMessageAt: string | null
  filedUnder: { id: string; name: string; kind: string }
  looksLike: string
  match: { id: string; name: string } | null
}
type MisfiledGroup = { looksLike: string; match: { id: string; name: string } | null; threads: MisfiledThread[] }

type Tab = 'domains' | 'threads' | 'insurer' | 'duplicates' | 'referrals'

export default function TriagePage() {
  const [tab, setTab] = useState<Tab>('domains')
  const [domains, setDomains] = useState<DomainRow[] | null>(null)
  const [companies, setCompanies] = useState<CompanyOpt[]>([])
  const [threads, setThreads] = useState<ThreadRow[] | null>(null)
  const [hidden, setHidden] = useState({ threads: 0, insurer: 0 })
  const [dups, setDups] = useState<DupPair[] | null>(null)
  const [misfiled, setMisfiled] = useState<MisfiledGroup[] | null>(null)
  const [referrals, setReferrals] = useState<ReferralRow[] | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()

  const loadDomains = useCallback(async (read = false) => {
    setDomains(null)
    try {
      const res = await fetch(`/api/companies/domains${read ? '?read=1' : ''}`, { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not load domains.')
      setDomains(d.domains); setCompanies(d.companies)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load domains.'); setDomains([]) }
  }, [])

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/companies/triage', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not load the leftover threads.')
      setThreads(d.threads); setHidden(h => ({ ...h, threads: d.hidden ?? 0 }))
      setCompanies(prev => prev.length ? prev : d.companies)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the leftover threads.'); setThreads([]) }
  }, [])

  const loadDups = useCallback(async () => {
    try {
      const res = await fetch('/api/companies/merge', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not compare companies.')
      setDups(d.pairs)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not compare companies.'); setDups([]) }
  }, [])

  const loadMisfiled = useCallback(async () => {
    setMisfiled(null)
    try {
      const res = await fetch('/api/companies/misfiled', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not read insurer mail.')
      setMisfiled(d.groups); setHidden(h => ({ ...h, insurer: d.hidden ?? 0 })); if (d.companies) setCompanies(d.companies)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read insurer mail.'); setMisfiled([]) }
  }, [])

  const loadReferrals = useCallback(async () => {
    try {
      const res = await fetch('/api/companies/referrals', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not load the referrals.')
      setReferrals(d.rows)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the referrals.'); setReferrals([]) }
  }, [])

  // Every queue loads on arrival, not when its tab is opened, so the counts on the tabs are true.
  useEffect(() => { loadDomains(); loadThreads(); loadDups(); loadMisfiled(); loadReferrals() }, [loadDomains, loadThreads, loadDups, loadMisfiled, loadReferrals])

  async function decideDomain(domain: string, body: Record<string, unknown>) {
    setRunning(domain); setError(null)
    try {
      const res = await fetch('/api/companies/domains', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, ...body }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not apply.')
      setDomains(prev => prev?.filter(x => x.domain !== domain) ?? null)
      setNotice(d.threadsLinked > 0 ? `Filed ${plural(d.threadsLinked, 'thread')} from ${domain}.` : `${domain} marked as not tracked.`)
      void loadThreads()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setRunning(null) }
  }

  async function merge(loser: DupPair['a'], winner: DupPair['a']) {
    const ok = await confirm({ title: `Keep ${winner.name}?`, body: `${loser.name} merges into ${winner.name}: its threads, contacts, debit notes, quotes and members move, and its name is kept as an alias.`, action: 'Merge' })
    if (!ok) return
    setRunning(loser.id); setError(null)
    try {
      const res = await fetch('/api/companies/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loserId: loser.id, winnerId: winner.id }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not merge.')
      setNotice(`Merged. ${Object.entries(d.moved).filter(([, n]) => (n as number) > 0).map(([t, n]) => `${n} ${t.replace(/_/g, ' ')}`).join(', ') || 'Nothing needed moving'}.`)
      setDups(null); void loadDups()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setRunning(null) }
  }

  const counts = { domains: domains?.length ?? 0, threads: threads?.length ?? 0, duplicates: dups?.length ?? 0, insurer: misfiled?.reduce((n, g) => n + g.threads.length, 0) ?? 0, referrals: referrals?.filter(r => !r.checkedAt).length ?? 0 }
  const meta = !threads || !domains
    ? 'Loading…'
    : `${plural(counts.threads, 'unfiled thread')} · ${plural(counts.domains, 'domain')} to decide`

  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white text-trs-ink">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 pt-6 pb-20">
        <Breadcrumbs current={{ label: 'Unfiled threads', href: '/companies/triage' }} fallback={{ label: 'Companies', href: '/companies' }} />
        <PageHeader className="mt-3" title="Unfiled threads" meta={meta}>
          <Segmented value={tab} onChange={setTab} label="Unfiled threads" options={[
            { value: 'domains' as Tab, label: 'Domains', count: counts.domains },
            { value: 'threads' as Tab, label: 'Leftover threads', count: counts.threads },
            { value: 'insurer' as Tab, label: 'Under an insurer', count: counts.insurer },
            { value: 'duplicates' as Tab, label: 'Duplicates', count: counts.duplicates },
            { value: 'referrals' as Tab, label: 'Referrals', count: counts.referrals },
          ]} />
        </PageHeader>

        {notice && <p className="mt-4 mb-0 text-body text-trs-muted" role="status" >{notice}</p>}
        {error && <p className="mt-4 mb-0 text-body text-trs-neg" role="alert">{error}</p>}

        {tab === 'domains' && (
          <div className="mt-6">
            {domains && domains.length > 0 && !domains.some(d => d.suggestion) && (
              <div className="mb-3"><Btn level="secondary" onClick={() => void loadDomains(true)}>Read domains with AI</Btn></div>
            )}
            {!domains ? <Spinner label="Reading the unfiled mail…" />
              : domains.length === 0 ? <Empty>No domain left to decide.</Empty>
              : (
                <Register label="Domains to decide" minWidth={1180}>
                  <RegisterHead>
                    <RegisterTh first>Domain</RegisterTh><RegisterTh>Threads</RegisterTh><RegisterTh>Writes from here</RegisterTh><RegisterTh>Insurer on the thread</RegisterTh>
                    <RegisterTh>Reads as</RegisterTh><RegisterTh>Closest on file</RegisterTh><RegisterTh last>Decision</RegisterTh>
                  </RegisterHead>
                  <tbody>
                    {domains.map(d => <DomainRowView key={d.domain} row={d} companies={companies} busy={running === d.domain} onDecide={body => decideDomain(d.domain, body)} />)}
                  </tbody>
                </Register>
              )}
          </div>
        )}

        {tab === 'threads' && (
          <div className="mt-6 flex flex-col gap-3">
            {!threads ? <Spinner label="Loading threads…" />
              : threads.length === 0 ? <Empty>No threads left to file.</Empty>
              : (
                <Register label="Leftover threads" minWidth={1040}>
                  <RegisterHead>
                    <RegisterTh first>Thread</RegisterTh><RegisterTh>Last message</RegisterTh><RegisterTh>Category</RegisterTh><RegisterTh>Suggested</RegisterTh><RegisterTh last>Decision</RegisterTh>
                  </RegisterHead>
                  <tbody>
                    {threads.map(t => <ThreadRowView key={t.id} row={t} companies={companies} onDone={() => setThreads(prev => prev?.filter(x => x.id !== t.id) ?? null)} onError={setError} />)}
                  </tbody>
                </Register>
              )}
            {threads && <HiddenThreads hidden={hidden.threads} />}
          </div>
        )}

        {tab === 'insurer' && (
          <div className="mt-6 flex flex-col gap-3">
            {!misfiled ? <Spinner label="Reading insurer mail…" />
              : misfiled.length === 0 ? <Empty>Every insurer thread is filed under the client it names.</Empty>
              : (
                <Register label="Threads under an insurer" minWidth={1120}>
                  <RegisterHead>
                    <RegisterTh first>Client named</RegisterTh><RegisterTh>Threads</RegisterTh><RegisterTh>Filed under</RegisterTh><RegisterTh>Latest</RegisterTh><RegisterTh last>Decision</RegisterTh>
                  </RegisterHead>
                  <tbody>
                    {misfiled.map(g => (
                      <MisfiledRowView key={g.looksLike + g.threads[0].id} group={g} companies={companies} onError={setError}
                        onDone={() => setMisfiled(prev => prev?.filter(x => x.threads[0].id !== g.threads[0].id) ?? null)} />
                    ))}
                  </tbody>
                </Register>
              )}
            {misfiled && <HiddenThreads hidden={hidden.insurer} />}
          </div>
        )}

        {tab === 'referrals' && (
          <div className="mt-6">
            {!referrals ? <Spinner label="Reading the referrals’ emails…" /> : <ReferralReview rows={referrals} onChange={setReferrals} onNotice={setNotice} onError={setError} />}
          </div>
        )}

        {tab === 'duplicates' && (
          <div className="mt-6">
            {!dups ? <Spinner label="Comparing companies…" />
              : dups.length === 0 ? <Empty>No duplicates found.</Empty>
              : (
                <Register label="Possible duplicates" minWidth={980}>
                  <RegisterHead>
                    <RegisterTh first>Company</RegisterTh><RegisterTh>Other company</RegisterTh><RegisterTh>Matched on</RegisterTh><RegisterTh>Alike</RegisterTh><RegisterTh last>Keep</RegisterTh>
                  </RegisterHead>
                  <tbody>
                    {dups.map(p => (
                      <RegisterRow key={`${p.a.id}-${p.b.id}`}>
                        <RegisterCell first primary={p.a.name} secondary={`${p.a.kind} · ${p.a.domains.join(', ') || 'no domain'}`} />
                        <RegisterCell align="left" primary={p.b.name} secondary={`${p.b.kind} · ${p.b.domains.join(', ') || 'no domain'}`} />
                        <RegisterCell align="left">{p.matchedOn}</RegisterCell>
                        <RegisterCell>{p.score >= 1 ? 'Same domain' : `${Math.round(p.score * 100)}%`}</RegisterCell>
                        <RegisterCell last>
                          <span className="inline-flex gap-2">
                            <Btn size="xs" loading={running === p.b.id} onClick={() => void merge(p.b, p.a)}>Keep {p.a.name}</Btn>
                            <Btn size="xs" loading={running === p.a.id} onClick={() => void merge(p.a, p.b)}>Keep {p.b.name}</Btn>
                          </span>
                        </RegisterCell>
                      </RegisterRow>
                    ))}
                  </tbody>
                </Register>
              )}
          </div>
        )}
      </div>
    </div>
  )
}

/** One unclaimed domain: who writes from it, the insurer on its threads, the agent's reading, and the decision. */
function DomainRowView({ row, companies, busy, onDecide }: {
  row: DomainRow; companies: CompanyOpt[]; busy: boolean
  onDecide: (body: Record<string, unknown>) => void
}) {
  const [pick, setPick] = useState('')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(row.suggestion?.name ?? '')
  const [kind, setKind] = useState<CompanyKind>(row.suggestion?.kind && row.suggestion.kind !== 'other' ? row.suggestion.kind : 'client')
  const s = row.suggestion
  const flow = [row.inbound ? `${row.inbound} in` : null, row.outbound ? `${row.outbound} out` : null].filter(Boolean).join(' · ') || 'No messages recorded'

  return (
    <>
      <RegisterRow>
        <RegisterCell first primary={row.domain} secondary={flow} />
        <RegisterCell>
          {row.previews.length > 0
            ? <Btn level="tertiary" onClick={() => setOpen(v => !v)} aria-expanded={open} className="h-auto border-0 p-0 font-normal underline underline-offset-4 tabular-nums text-trs-ink hover:bg-transparent">{row.threads}</Btn>
            : <span className="tabular-nums">{row.threads}</span>}
        </RegisterCell>
        <RegisterCell align="left" title={row.people.join(', ')}>{row.people.slice(0, 2).join(' · ') || <span className="text-trs-muted">Nobody named</span>}</RegisterCell>
        <RegisterCell align="left" title={row.counterparties.join(', ')}>{row.counterparties.slice(0, 2).join(' · ') || <span className="text-trs-muted">None</span>}</RegisterCell>
        <RegisterCell align="left" nowrap={false}>
          {s ? (
            <span className="block max-w-[280px]">
              <span className="flex items-center gap-1.5 flex-wrap"><span className="font-medium">{s.name}</span><Chip>{s.kind}</Chip><span className="text-trs-muted">{Math.round(s.confidence * 100)}%</span></span>
              {s.evidence && <span className="block text-small text-trs-muted">On the strength of: {s.evidence}</span>}
              {s.alternative && <span className="block text-small text-trs-muted">Could also be a {s.alternative.kind}: {s.alternative.why}</span>}
            </span>
          ) : <span className="text-trs-muted">Not read</span>}
        </RegisterCell>
        <RegisterCell align="left" nowrap={false}>
          {row.nearest.length === 0 ? <span className="text-trs-muted">None</span> : (
            <span className="flex flex-col items-start gap-1">
              {row.nearest.map(n => (
                <Btn key={n.companyId} size="xs" disabled={busy} onClick={() => onDecide({ decision: 'assign', companyId: n.companyId })} title={`Assign to ${n.name}`}>{n.name} · {Math.round(n.score * 100)}%</Btn>
              ))}
            </span>
          )}
        </RegisterCell>
        <RegisterCell last nowrap={false}>
          <span className="flex flex-col gap-1.5 items-stretch min-w-[340px]">
            <span className="flex gap-2">
              <CompanySearchSelect options={companies} value={pick} onChange={setPick} placeholder="Existing company" className="flex-1 min-w-0" />
              <Btn size="xs" disabled={!pick || busy} loading={busy} onClick={() => onDecide({ decision: 'assign', companyId: pick })}>Assign</Btn>
            </span>
            <span className="flex gap-2">
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="New company name" aria-label="New company name" className="flex-1 min-w-0" />
              <select value={kind} onChange={e => setKind(e.target.value as CompanyKind)} className={`${inputCls} w-auto`} aria-label="Kind">
                {COMPANY_KINDS.filter(k => k !== 'other').map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <Btn size="xs" disabled={!name.trim() || busy} onClick={() => onDecide({ decision: 'create', name: name.trim(), kind })}>Create</Btn>
            </span>
            <Btn size="xs" level="tertiary" className="self-start" disabled={busy} onClick={() => onDecide({ decision: 'ignore' })} title="Newsletters, vendors, anyone not tracked">Not one to track</Btn>
          </span>
        </RegisterCell>
      </RegisterRow>
      {open && row.previews.map((pv, i) => (
        <RegisterRow key={i}>
          <RegisterCell first secondary={fmtRelative(pv.date)} />
          <RegisterCell align="left" colSpan={6} title={pv.snippet ?? undefined}>{pv.subject ?? 'No subject'}</RegisterCell>
        </RegisterRow>
      ))}
    </>
  )
}

/** One client named across one or more insurer threads: link them, create the company, or keep
 *  the mail under the insurer. Every thread in the group takes the same decision. */
function MisfiledRowView({ group, companies, onDone, onError }: { group: MisfiledGroup; companies: CompanyOpt[]; onDone: () => void; onError: (e: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState(group.match?.id ?? '')
  const [name, setName] = useState(group.looksLike)
  const [open, setOpen] = useState(false)
  const n = group.threads.length
  const insurers = Array.from(new Set(group.threads.map(t => t.filedUnder.name)))

  const decideAll = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      for (const t of group.threads) {
        const res = await fetch(`/api/companies/triage/${t.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not move the threads.')
      }
      onDone()
    } catch (e) { onError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <>
      <RegisterRow>
        <RegisterCell first primary={group.looksLike} secondary={group.match ? `On file: ${group.match.name}` : 'Not on file'} />
        <RegisterCell><Btn level="tertiary" onClick={() => setOpen(v => !v)} aria-expanded={open} className="h-auto border-0 p-0 font-normal underline underline-offset-4 tabular-nums text-trs-ink hover:bg-transparent">{n}</Btn></RegisterCell>
        <RegisterCell align="left">{insurers.join(', ')}</RegisterCell>
        <RegisterCell>{fmtRelative(group.threads[0].lastMessageAt)}</RegisterCell>
        <RegisterCell last nowrap={false}>
          <span className="flex flex-col gap-1.5 items-stretch min-w-[360px]">
            <span className="flex gap-2">
              <CompanySearchSelect options={companies} value={pick} onChange={setPick} className="flex-1 min-w-0" />
              <Btn size="xs" disabled={!pick || busy} loading={busy && !!pick} onClick={() => decideAll({ decision: 'link', companyId: pick })}>Move {n === 1 ? 'it' : `all ${n}`}</Btn>
            </span>
            <span className="flex gap-2">
              <Input value={name} onChange={e => setName(e.target.value)} className="flex-1 min-w-0" aria-label="New company name" placeholder="New company name" />
              <Btn size="xs" disabled={!name.trim() || busy} onClick={() => decideAll({ decision: 'create', name: name.trim() })}>Create and move</Btn>
            </span>
            <Btn size="xs" level="tertiary" className="self-start" disabled={busy} onClick={() => decideAll({ decision: 'not_client' })}>Keep under the insurer</Btn>
          </span>
        </RegisterCell>
      </RegisterRow>
      {open && group.threads.map(t => (
        <RegisterRow key={t.id}>
          <RegisterCell first secondary={fmtRelative(t.lastMessageAt)} />
          <RegisterCell align="left" colSpan={4}><Link href={`/engagement?lead=${t.id}`} className="text-trs-ink no-underline hover:underline">{t.subject ?? 'No subject'}</Link></RegisterCell>
        </RegisterRow>
      ))}
    </>
  )
}

/** One leftover thread: link it to a company, take the suggestion (14 days or newer), or say it is not a client. */
function ThreadRowView({ row, companies, onDone, onError }: { row: ThreadRow; companies: CompanyOpt[]; onDone: () => void; onError: (e: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState('')
  const contactName = row.contacts ? [row.contacts.first_name, row.contacts.last_name].filter(Boolean).join(' ') || row.contacts.email : null
  const s = row.suggestion && row.suggestion.status === 'pending' && row.suggestion.verdict !== 'unsure' ? row.suggestion : null
  const suggested = s ? (s.verdict === 'not_client' ? 'Not a client' : s.suggested_name ?? companies.find(c => c.id === s.suggested_company_id)?.name ?? null) : null

  const decide = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/companies/triage/${row.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not file the thread.')
      onDone()
    } catch (e) { onError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <RegisterRow>
      <RegisterCell first identityWidth={320} primary={<Link href={`/engagement?lead=${row.id}`} className="text-trs-ink no-underline hover:underline" title={row.subject ?? undefined}>{row.subject ?? 'No subject'}</Link>}
        secondary={[contactName, row.contacts?.company].filter(Boolean).join(' · ') || 'No contact'} />
      <RegisterCell>{fmtRelative(row.last_message_at)}</RegisterCell>
      <RegisterCell>{row.category ? <Chip className="capitalize">{row.category}</Chip> : <span className="text-trs-muted">None</span>}</RegisterCell>
      <RegisterCell>
        {suggested
          ? <span className="inline-flex items-center gap-2"><span className="truncate max-w-[180px]" title={s?.rationale ?? undefined}>{suggested}</span><Btn size="xs" disabled={busy} onClick={() => decide({ decision: 'accept' })}>Accept</Btn></span>
          : <span className="text-trs-muted">None</span>}
      </RegisterCell>
      <RegisterCell last nowrap={false}>
        <span className="flex gap-2 items-center min-w-[380px]">
          <CompanySearchSelect options={companies} value={pick} onChange={setPick} className="flex-1 min-w-0" />
          <Btn size="xs" disabled={!pick || busy} loading={busy && !!pick} onClick={() => decide({ decision: 'link', companyId: pick })}>Link</Btn>
          <Btn size="xs" level="tertiary" disabled={busy} onClick={() => decide({ decision: 'not_client' })}>Not a client</Btn>
        </span>
      </RegisterCell>
    </RegisterRow>
  )
}
