'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Btn, Chip, Segmented, Spinner, Empty, inputCls } from '@/components/crm/primitives'
import { CompanySearchSelect } from '@/components/crm/CompanySearchSelect'
import { fmtRelative } from '@/lib/crm/format'
import { COMPANY_KINDS, type CompanyKind, type LinkSuggestion } from '@/lib/crm/types'

const INK = '#202124'
const MUTED = '#5f6368'
const CARD = 'rounded-[16px] border border-[#e8eaed] bg-white p-5'

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

type Tab = 'domains' | 'threads' | 'insurer' | 'duplicates'

export default function TriagePage() {
  const [tab, setTab] = useState<Tab>('domains')
  const [domains, setDomains] = useState<DomainRow[] | null>(null)
  const [companies, setCompanies] = useState<CompanyOpt[]>([])
  const [threads, setThreads] = useState<ThreadRow[] | null>(null)
  const [dups, setDups] = useState<DupPair[] | null>(null)
  const [misfiled, setMisfiled] = useState<MisfiledGroup[] | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadDomains = useCallback(async () => {
    setDomains(null)
    const res = await fetch('/api/companies/domains', { cache: 'no-store' })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Could not load domains.'); setDomains([]); return }
    setDomains(d.domains); setCompanies(d.companies)
  }, [])

  const loadThreads = useCallback(async () => {
    const res = await fetch('/api/companies/triage', { cache: 'no-store' })
    const d = await res.json()
    if (res.ok) { setThreads(d.threads); if (!companies.length) setCompanies(d.companies) }
  }, [companies.length])

  const loadDups = useCallback(async () => {
    const res = await fetch('/api/companies/merge', { cache: 'no-store' })
    const d = await res.json()
    if (res.ok) setDups(d.pairs)
  }, [])

  const loadMisfiled = useCallback(async () => {
    setMisfiled(null)
    const res = await fetch('/api/companies/misfiled', { cache: 'no-store' })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Could not read insurer mail.'); setMisfiled([]); return }
    setMisfiled(d.groups); if (d.companies) setCompanies(d.companies)
  }, [])

  // Every queue loads on arrival, not when its tab is opened, so the counts on the tabs are
  // true. A tab reading zero while it holds eighty threads is worse than four small requests.
  useEffect(() => { loadDomains(); loadThreads(); loadDups(); loadMisfiled() }, [loadDomains, loadThreads, loadDups, loadMisfiled])

  async function runAutofile() {
    setRunning('autofile'); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/companies/autofile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'The run failed.')
      setNotice(`Filed ${d.threads.byDomain + d.threads.bySubject} threads and created ${d.companies.created} compan${d.companies.created === 1 ? 'y' : 'ies'}. ${d.threads.stillUnfiled} still need a decision.`)
      await loadDomains(); setThreads(null); setDups(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setRunning(null) }
  }

  async function decideDomain(domain: string, body: Record<string, unknown>) {
    setRunning(domain); setError(null)
    try {
      const res = await fetch('/api/companies/domains', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, ...body }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not apply.')
      setDomains(prev => prev?.filter(x => x.domain !== domain) ?? null)
      setNotice(d.threadsLinked > 0 ? `Filed ${d.threadsLinked} thread${d.threadsLinked === 1 ? '' : 's'} from ${domain}.` : `${domain} marked as nobody we track.`)
      setThreads(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setRunning(null) }
  }

  async function merge(loserId: string, winnerId: string) {
    setRunning(loserId); setError(null)
    try {
      const res = await fetch('/api/companies/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loserId, winnerId }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not merge.')
      setNotice(`Merged. ${Object.entries(d.moved).filter(([, n]) => (n as number) > 0).map(([t, n]) => `${n} ${t.replace(/_/g, ' ')}`).join(', ') || 'Nothing needed moving'}.`)
      setDups(null); loadDups()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setRunning(null) }
  }

  const counts = { domains: domains?.length ?? 0, threads: threads?.length ?? 0, duplicates: dups?.length ?? 0, insurer: misfiled?.reduce((n, g) => n + g.threads.length, 0) ?? 0 }
  const countLine = !domains
    ? 'Loading…'
    : `${counts.domains} domain${counts.domains === 1 ? '' : 's'} to decide`

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <Link href="/companies" className="inline-flex items-center gap-1.5 text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Companies</Link>
            <h1 className="m-0 mt-3 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Match threads</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>{countLine}</p>
          </div>
          <Btn level="primary" className="h-12 px-6 rounded-[12px] text-[15px]" onClick={runAutofile} loading={running === 'autofile'} title="Files every thread it can by email domain, creating companies it is sure about. Anything less certain lands here.">
            File everything
          </Btn>
        </div>

        {notice && <p className="mt-6 mb-0 text-[14px]" role="status" style={{ color: MUTED }}>{notice}</p>}
        {error && <p className="mt-6 mb-0 text-[14px]" role="alert" style={{ color: '#c5221f' }}>{error}</p>}

        <div className="mt-8">
          <Segmented value={tab} onChange={setTab} options={[
            { value: 'domains' as Tab, label: 'Domains', count: counts.domains },
            { value: 'threads' as Tab, label: 'Leftover threads', count: counts.threads },
            { value: 'insurer' as Tab, label: 'Under an insurer', count: counts.insurer },
            { value: 'duplicates' as Tab, label: 'Duplicates', count: counts.duplicates },
          ]} />
        </div>

        {tab === 'domains' && (
          <div className="mt-6">
            {!domains && <Spinner label="Reading the unfiled mail…" />}
            {domains?.length === 0 && <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>Every domain is accounted for.</p>}
            <ul className="m-0 p-0 list-none flex flex-col gap-3">
              {domains?.map(d => (
                <DomainCard key={d.domain} row={d} companies={companies} busy={running === d.domain} onDecide={body => decideDomain(d.domain, body)} />
              ))}
            </ul>
          </div>
        )}

        {tab === 'threads' && (
          <div className="mt-6">
            {!threads && <Spinner label="Loading threads…" />}
            {threads?.length === 0 && <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>No threads left to file.</p>}
            <ul className="m-0 p-0 list-none flex flex-col gap-3">
              {threads?.map(t => <ThreadCard key={t.id} row={t} companies={companies} onDone={() => setThreads(prev => prev?.filter(x => x.id !== t.id) ?? null)} />)}
            </ul>
          </div>
        )}

        {tab === 'insurer' && (
          <div className="mt-6">
            {!misfiled && <Spinner label="Reading insurer mail…" />}
            {misfiled?.length === 0 && <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>Every insurer thread is filed under the client it is about.</p>}
            {misfiled && misfiled.length > 0 && (
              <p className="m-0 mb-4 text-[13.5px]" style={{ color: MUTED }}>
                An insurer wrote about a client, so the thread belongs to that client. These name someone we have no record for yet.
              </p>
            )}
            <ul className="m-0 p-0 list-none flex flex-col gap-3">
              {misfiled?.map(g => (
                <MisfiledCard key={g.looksLike + g.threads[0].id} group={g} companies={companies}
                  onDone={() => setMisfiled(prev => prev?.filter(x => x.threads[0].id !== g.threads[0].id) ?? null)} />
              ))}
            </ul>
          </div>
        )}

        {tab === 'duplicates' && (
          <div className="mt-6">
            {!dups && <Spinner label="Comparing companies…" />}
            {dups?.length === 0 && <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>No duplicates found.</p>}
            <ul className="m-0 p-0 list-none flex flex-col gap-3">
              {dups?.map(p => (
                <li key={`${p.a.id}-${p.b.id}`} className={CARD}>
                  <p className="text-[13px] m-0 mb-3" style={{ color: MUTED }}>
                    Matched on “{p.matchedOn}”{p.score >= 1 ? ' · they share an email domain' : ` · ${Math.round(p.score * 100)}% alike`}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[p.a, p.b].map((c, i) => {
                      const other = i === 0 ? p.b : p.a
                      return (
                        <div key={c.id} className="rounded-[12px] px-4 py-3" style={{ background: '#f1f3f4' }}>
                          <p className="text-[14px] font-medium m-0 truncate" style={{ color: INK }}>{c.name}</p>
                          <p className="text-[13px] m-0 mt-0.5" style={{ color: MUTED }}>{c.kind} · {c.domains.join(', ') || 'no domain'}</p>
                          <Btn size="sm" level="secondary" className="mt-3" loading={running === other.id} onClick={() => merge(other.id, c.id)}>
                            Keep this one
                          </Btn>
                        </div>
                      )
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function DomainCard({ row, companies, busy, onDecide }: {
  row: DomainRow; companies: CompanyOpt[]; busy: boolean
  onDecide: (body: Record<string, unknown>) => void
}) {
  const [pick, setPick] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [name, setName] = useState(row.suggestion?.name ?? '')
  const [kind, setKind] = useState<CompanyKind>(row.suggestion?.kind && row.suggestion.kind !== 'other' ? row.suggestion.kind : 'client')
  const s = row.suggestion

  return (
    <li className={CARD}>
      <div className="min-w-0">
        <p className="text-[16px] font-medium tracking-[-0.01em] m-0 flex items-center gap-2 flex-wrap" style={{ color: INK }}>
          {row.domain}
          <Chip>{row.threads} thread{row.threads === 1 ? '' : 's'}</Chip>
        </p>
        <p className="text-[13px] m-0 mt-1" style={{ color: '#80868b' }}>
          {[row.inbound ? `${row.inbound} in` : null, row.outbound ? `${row.outbound} out` : null].filter(Boolean).join(' · ') || 'no messages recorded'}
        </p>
      </div>

      <dl className="m-0 mt-3 grid gap-x-5 gap-y-2 text-[13.5px]" style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}>
        <dt style={{ color: MUTED }}>Writes from here</dt>
        <dd className="m-0 min-w-0" style={{ color: INK }}>{row.people.slice(0, 4).join(' · ') || <span style={{ color: MUTED }}>Nobody named</span>}</dd>

        <dt style={{ color: MUTED }}>Insurer on the thread</dt>
        <dd className="m-0 min-w-0" style={{ color: INK }}>{row.counterparties.slice(0, 4).join(' · ') || <span style={{ color: MUTED }}>None we know</span>}</dd>

        {row.alsoOn.length > 0 && <>
          <dt style={{ color: MUTED }}>Also copied</dt>
          <dd className="m-0 min-w-0" style={{ color: INK }}>{row.alsoOn.slice(0, 5).map(a => `${a.domain}${a.threads > 1 ? ` (${a.threads})` : ''}`).join(' · ')}</dd>
        </>}

        {row.handledBy.length > 0 && <>
          <dt style={{ color: MUTED }}>Handled by</dt>
          <dd className="m-0 min-w-0" style={{ color: INK }}>{row.handledBy.map(e => e.split('@')[0]).join(' · ')}</dd>
        </>}
      </dl>

      {row.previews.length > 0 && (
        <ul className="m-0 mt-3 p-0 list-none flex flex-col gap-2">
          {row.previews.slice(0, showAll ? 8 : 2).map((pv, i) => (
            <li key={i} className="rounded-[10px] px-3 py-2" style={{ background: '#f8f9fa' }}>
              <span className="block text-[13.5px] truncate" style={{ color: INK }}>{pv.subject ?? '(no subject)'}</span>
              {pv.snippet && <span className="block text-[13px] mt-0.5 line-clamp-2" style={{ color: MUTED }}>{pv.snippet}</span>}
            </li>
          ))}
          {row.previews.length > 2 && (
            <li><button type="button" onClick={() => setShowAll(v => !v)} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4 text-[13px]" style={{ color: MUTED }}>{showAll ? 'Show fewer' : `Show ${row.previews.length - 2} more thread${row.previews.length - 2 === 1 ? '' : 's'}`}</button></li>
          )}
        </ul>
      )}

      {s && (
        <div className="mt-3 rounded-[10px] px-3 py-2.5" style={{ background: '#f1f3f4' }}>
          <p className="text-[13.5px] m-0 flex items-center gap-1.5 flex-wrap" style={{ color: INK }}>
            <span style={{ color: MUTED }}>Reads as</span>
            <span className="font-medium">{s.name}</span>
            <Chip>{s.kind}</Chip>
            <span style={{ color: MUTED }}>· {Math.round(s.confidence * 100)}% sure</span>
          </p>
          <p className="text-[13.5px] m-0 mt-1" style={{ color: '#3c4043' }}>{s.reason}</p>
          {s.evidence && <p className="text-[13px] m-0 mt-1" style={{ color: MUTED }}>On the strength of: {s.evidence}</p>}
          {s.alternative && <p className="text-[13px] m-0 mt-1" style={{ color: MUTED }}>Could also be a {s.alternative.kind}: {s.alternative.why}</p>}
        </div>
      )}

      {row.nearest.length > 0 && (
        <p className="text-[13.5px] m-0 mt-2" style={{ color: INK }}>
          <span style={{ color: MUTED }}>Closest on file: </span>
          {row.nearest.map((n, i) => (
            <span key={n.companyId}>
              {i > 0 && <span style={{ color: MUTED }}> · </span>}
              <button type="button" onClick={() => onDecide({ decision: 'assign', companyId: n.companyId })} disabled={busy} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4 disabled:opacity-50" style={{ color: INK }}>
                {n.name}
              </button>
              <span style={{ color: MUTED }}> ({Math.round(n.score * 100)}%)</span>
            </span>
          ))}
        </p>
      )}

      <div className="mt-4 pt-4 border-t border-[#e8eaed] flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[12.5px]" style={{ color: MUTED }}>Existing company</span>
          <span className="flex gap-2">
            <CompanySearchSelect options={companies} value={pick} onChange={setPick} placeholder="Search companies…" className="max-w-[240px]" />
            <Btn size="sm" level="secondary" className="h-10" disabled={!pick || busy} loading={busy} onClick={() => onDecide({ decision: 'assign', companyId: pick })}>Assign</Btn>
          </span>
        </label>

        <label className="flex flex-col gap-1.5 flex-1 min-w-[260px]">
          <span className="text-[12.5px]" style={{ color: MUTED }}>Or add new</span>
          <span className="flex gap-2 flex-wrap sm:flex-nowrap">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Company name" className={`${inputCls} flex-1 min-w-[160px]`} />
            <select value={kind} onChange={e => setKind(e.target.value as CompanyKind)} className={`${inputCls} w-auto`} aria-label="Kind">
              {COMPANY_KINDS.filter(k => k !== 'other').map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <Btn size="sm" level="secondary" className="h-10" disabled={!name.trim() || busy} loading={busy} onClick={() => onDecide({ decision: 'create', name: name.trim(), kind })}>Create</Btn>
          </span>
        </label>

        <Btn size="sm" level="tertiary" className="h-10" disabled={busy} onClick={() => onDecide({ decision: 'ignore' })} title="Newsletters, vendors, anyone we do not need to track">Not one to track</Btn>
      </div>
    </li>
  )
}

/** One client named across one or more insurer threads: link them, create the company, or say
 *  the mail really is insurer-only. Every thread in the group takes the same decision. */
function MisfiledCard({ group, companies, onDone }: { group: MisfiledGroup; companies: CompanyOpt[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState(group.match?.id ?? '')
  const [name, setName] = useState(group.looksLike)
  const [show, setShow] = useState(false)
  const n = group.threads.length
  const insurers = Array.from(new Set(group.threads.map(t => t.filedUnder.name)))

  const decideAll = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      for (const t of group.threads) {
        await fetch(`/api/companies/triage/${t.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      onDone()
    } finally { setBusy(false) }
  }

  const visible = show ? group.threads : group.threads.slice(0, 2)
  return (
    <li className={CARD}>
      <p className="text-[16px] font-medium tracking-[-0.01em] m-0 flex items-center gap-2 flex-wrap" style={{ color: INK }}>
        <span className="truncate">{group.looksLike}</span>
        <Chip>{n} thread{n === 1 ? '' : 's'}</Chip>
        {group.match && <Chip>Already on file</Chip>}
      </p>
      <p className="text-[13.5px] m-0 mt-1.5" style={{ color: MUTED }}>Filed under {insurers.join(', ')}</p>

      <ul className="m-0 mt-3 p-0 list-none flex flex-col gap-1.5">
        {visible.map(t => (
          <li key={t.id} className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <Link href={`/engagement?lead=${t.id}`} className="truncate no-underline hover:underline" style={{ color: '#3c4043' }}>{t.subject ?? '(no subject)'}</Link>
            <span className="flex-shrink-0 tabular-nums" style={{ color: '#80868b' }}>{fmtRelative(t.lastMessageAt)}</span>
          </li>
        ))}
        {n > 2 && (
          <li><button type="button" onClick={() => setShow(v => !v)} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4 text-[13px]" style={{ color: MUTED }}>{show ? 'Show fewer' : `Show ${n - 2} more`}</button></li>
        )}
      </ul>

      <div className="mt-4 pt-4 border-t border-[#e8eaed] flex items-center gap-2 flex-wrap">
        <CompanySearchSelect options={companies} value={pick} onChange={setPick} className="max-w-[240px]" />
        <Btn size="sm" level={group.match ? 'primary' : 'secondary'} className="h-10" disabled={!pick || busy} loading={busy && !!pick}
          onClick={() => decideAll({ decision: 'link', companyId: pick })}>
          Move {n === 1 ? 'it' : `all ${n}`}
        </Btn>
        <span className="text-[13px]" style={{ color: '#9aa0a6' }}>or</span>
        <input value={name} onChange={e => setName(e.target.value)} className={`${inputCls} w-auto max-w-[220px]`} aria-label="New company name" placeholder="Company name" />
        <Btn size="sm" level="secondary" className="h-10" disabled={!name.trim() || busy} onClick={() => decideAll({ decision: 'create', name: name.trim() })}>Create and move</Btn>
        <Btn size="sm" level="tertiary" className="h-10" disabled={busy} onClick={() => decideAll({ decision: 'not_client' })}>Keep under the insurer</Btn>
      </div>
    </li>
  )
}

function ThreadCard({ row, companies, onDone }: { row: ThreadRow; companies: CompanyOpt[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState('')
  const contactName = row.contacts ? [row.contacts.first_name, row.contacts.last_name].filter(Boolean).join(' ') || row.contacts.email : null

  const decide = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/companies/triage/${row.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) onDone()
    } finally { setBusy(false) }
  }

  return (
    <li className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-medium tracking-[-0.01em] m-0 flex items-center gap-2 flex-wrap" style={{ color: INK }}>
            <span className="truncate">{row.subject ?? '(no subject)'}</span>
            {row.category && <Chip className="capitalize">{row.category}</Chip>}
          </p>
          <p className="text-[13.5px] m-0 mt-1.5 truncate" style={{ color: MUTED }}>
            {[contactName, row.contacts?.company, fmtRelative(row.last_message_at)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Link href={`/engagement?lead=${row.id}`} className="text-[13.5px] no-underline hover:underline flex-shrink-0" style={{ color: MUTED }}>Open</Link>
      </div>
      <div className="mt-4 pt-4 border-t border-[#e8eaed] flex items-center gap-2 flex-wrap">
        <CompanySearchSelect options={companies} value={pick} onChange={setPick} className="max-w-[260px]" />
        <Btn size="sm" level="secondary" className="h-10" disabled={!pick || busy} onClick={() => decide({ decision: 'link', companyId: pick })}>Link</Btn>
        <Btn size="sm" level="tertiary" className="h-10" disabled={busy} onClick={() => decide({ decision: 'not_client' })}>Not a client</Btn>
      </div>
    </li>
  )
}
