'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Btn, Chip, Segmented, Spinner, Empty, inputCls } from '@/components/crm/primitives'
import { fmtRelative } from '@/lib/crm/format'
import { COMPANY_KINDS, type CompanyKind, type LinkSuggestion } from '@/lib/crm/types'

const INK = '#202124'
const MUTED = '#5f6368'
const CARD = 'rounded-[16px] border border-[#e8eaed] bg-white p-5'

type CompanyOpt = { id: string; name: string; domains: string[] }
type DomainRow = {
  domain: string; threads: number; people: string[]; subjects: string[]
  suggestion: { name: string; kind: CompanyKind; confidence: number; reason: string } | null
  nearest: { companyId: string; name: string; kind: CompanyKind; score: number; matchedOn: string }[]
}
type ThreadRow = {
  id: string; subject: string | null; snippet: string | null; category: string | null; last_message_at: string | null
  contacts: { id: string; email: string | null; first_name: string | null; last_name: string | null; company: string | null } | null
  participants: { email: string; name: string | null }[]
  suggestion: LinkSuggestion | null
}
type DupPair = { score: number; matchedOn: string; a: { id: string; name: string; kind: string; domains: string[] }; b: { id: string; name: string; kind: string; domains: string[] } }

type Tab = 'domains' | 'threads' | 'duplicates'

export default function TriagePage() {
  const [tab, setTab] = useState<Tab>('domains')
  const [domains, setDomains] = useState<DomainRow[] | null>(null)
  const [companies, setCompanies] = useState<CompanyOpt[]>([])
  const [threads, setThreads] = useState<ThreadRow[] | null>(null)
  const [dups, setDups] = useState<DupPair[] | null>(null)
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

  useEffect(() => { loadDomains() }, [loadDomains])
  useEffect(() => { if (tab === 'threads' && !threads) loadThreads() }, [tab, threads, loadThreads])
  useEffect(() => { if (tab === 'duplicates' && !dups) loadDups() }, [tab, dups, loadDups])

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

  const counts = { domains: domains?.length ?? 0, threads: threads?.length ?? 0, duplicates: dups?.length ?? 0 }
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
        <p className="text-[13.5px] m-0 mt-1.5 truncate" style={{ color: MUTED }}>{row.people.slice(0, 3).join(' · ') || 'No named people'}</p>
        {row.subjects[0] && <p className="text-[13.5px] m-0 mt-0.5 truncate" style={{ color: MUTED }}>“{row.subjects[0]}”</p>}
      </div>

      {s && (
        <p className="text-[13.5px] m-0 mt-3 flex items-center gap-1.5 flex-wrap" style={{ color: INK }}>
          <span style={{ color: MUTED }}>Reads as</span>
          <span className="font-medium">{s.name}</span>
          <Chip>{s.kind}</Chip>
          <span style={{ color: MUTED }}>· {Math.round(s.confidence * 100)}% sure · {s.reason}</span>
        </p>
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
            <select value={pick} onChange={e => setPick(e.target.value)} className={`${inputCls} w-auto max-w-[240px]`} aria-label={`Company for ${row.domain}`}>
              <option value="">Choose…</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
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
        <select value={pick} onChange={e => setPick(e.target.value)} className={`${inputCls} w-auto max-w-[260px]`} aria-label="Company">
          <option value="">Choose a company…</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Btn size="sm" level="secondary" className="h-10" disabled={!pick || busy} onClick={() => decide({ decision: 'link', companyId: pick })}>Link</Btn>
        <Btn size="sm" level="tertiary" className="h-10" disabled={busy} onClick={() => decide({ decision: 'not_client' })}>Not a client</Btn>
      </div>
    </li>
  )
}
