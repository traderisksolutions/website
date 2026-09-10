'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Check, X, Ban, Plus, ExternalLink, Wand2, Merge, Globe, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { SectionCard, Btn, Chip, Segmented, Spinner, Empty, inputCls } from '@/components/crm/primitives'
import { fmtRelative } from '@/lib/crm/format'
import { COMPANY_KINDS, type CompanyKind, type LinkSuggestion } from '@/lib/crm/types'

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

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-[900px] px-6 py-6">
        <PageHeader
          title="Filing"
          description="Every email belongs to a company. This is where the few that could not be placed automatically get decided."
          className="mb-3"
          actions={<Btn level="primary" onClick={runAutofile} loading={running === 'autofile'} title="Files every thread it can by email domain, creating companies it is sure about. Anything less certain lands here."><Wand2 size={12} /> File everything now</Btn>}
        />

        {notice && <div className="rounded-md px-3 py-2 mb-3 text-[12.5px]" style={{ background: 'var(--success-bg)', color: 'var(--success)', borderLeft: '3px solid var(--success-border)' }}>{notice}</div>}
        {error && <div className="rounded-md px-3 py-2 mb-3 text-[12.5px]" style={{ background: 'var(--error-bg)', color: 'var(--error)', borderLeft: '3px solid rgba(192,51,71,0.4)' }}>{error}</div>}

        <div className="mb-1">
          <Segmented value={tab} onChange={setTab} options={[
            { value: 'domains' as Tab, label: 'Domains', count: counts.domains },
            { value: 'threads' as Tab, label: 'Leftover threads', count: counts.threads },
            { value: 'duplicates' as Tab, label: 'Duplicates', count: counts.duplicates },
          ]} />
        </div>

        {tab === 'domains' && (
          <SectionCard title="Who is this?" description="One decision per email domain files every thread that domain touches, now and in future.">
            {!domains && <Spinner label="Reading the unfiled mail…" />}
            {domains?.length === 0 && <Empty>Every domain is accounted for.</Empty>}
            <ul className="m-0 p-0 list-none flex flex-col">
              {domains?.map(d => (
                <DomainCard key={d.domain} row={d} companies={companies} busy={running === d.domain} onDecide={body => decideDomain(d.domain, body)} />
              ))}
            </ul>
          </SectionCard>
        )}

        {tab === 'threads' && (
          <SectionCard title="Threads with no company domain" description="Usually a personal mailbox, or an insurer writing about a client we have not met yet.">
            {!threads && <Spinner label="Loading threads…" />}
            {threads?.length === 0 && <Empty>Nothing left.</Empty>}
            <ul className="m-0 p-0 list-none flex flex-col">
              {threads?.map(t => <ThreadCard key={t.id} row={t} companies={companies} onDone={() => setThreads(prev => prev?.filter(x => x.id !== t.id) ?? null)} />)}
            </ul>
          </SectionCard>
        )}

        {tab === 'duplicates' && (
          <SectionCard title="Same company twice?" description="Merging moves every thread, contact, debit note and quote onto the one you keep, and remembers the other spelling.">
            {!dups && <Spinner label="Comparing companies…" />}
            {dups?.length === 0 && <Empty>No duplicates found.</Empty>}
            <ul className="m-0 p-0 list-none flex flex-col">
              {dups?.map(p => (
                <li key={`${p.a.id}-${p.b.id}`} className="py-3 border-b border-[--border-subtle] last:border-b-0">
                  <p className="text-[12px] text-muted-foreground m-0 mb-1.5">
                    Matched on “{p.matchedOn}”{p.score >= 1 ? ' · they share an email domain' : ` · ${Math.round(p.score * 100)}% alike`}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[p.a, p.b].map((c, i) => {
                      const other = i === 0 ? p.b : p.a
                      return (
                        <div key={c.id} className="rounded-md border border-[--border-subtle] px-3 py-2">
                          <p className="text-[13px] font-medium m-0 truncate">{c.name}</p>
                          <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5">{c.kind} · {c.domains.join(', ') || 'no domain'}</p>
                          <Btn size="xs" level="secondary" className="mt-2" loading={running === other.id} onClick={() => merge(other.id, c.id)}>
                            <Merge size={11} /> Keep this one
                          </Btn>
                        </div>
                      )
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
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
    <li className="py-3 border-b border-[--border-subtle] last:border-b-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold m-0 flex items-center gap-1.5 flex-wrap">
            <Globe size={12} className="text-muted-foreground/60" /> {row.domain}
            <Chip tone="neutral">{row.threads} thread{row.threads === 1 ? '' : 's'}</Chip>
          </p>
          <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 truncate">{row.people.slice(0, 3).join(' · ') || 'no named people'}</p>
          {row.subjects[0] && <p className="text-[11.5px] text-muted-foreground/80 m-0 mt-0.5 italic truncate">“{row.subjects[0]}”</p>}
        </div>
      </div>

      {s && (
        <p className="text-[12px] m-0 mt-2 flex items-start gap-1.5 flex-wrap">
          <Sparkles size={11} className="mt-0.5 text-muted-foreground" />
          <span>
            <span className="text-muted-foreground">Reads as </span>
            <strong>{s.name}</strong>
            <Chip tone={s.kind === 'client' ? 'green' : s.kind === 'insurer' ? 'blue' : 'amber'} className="ml-1.5">{s.kind}</Chip>
            <span className="text-muted-foreground"> · {Math.round(s.confidence * 100)}% sure · {s.reason}</span>
          </span>
        </p>
      )}

      {row.nearest.length > 0 && (
        <p className="text-[12px] m-0 mt-1.5">
          <span className="text-muted-foreground">Closest on file: </span>
          {row.nearest.map((n, i) => (
            <span key={n.companyId}>
              {i > 0 && <span className="text-muted-foreground"> · </span>}
              <button onClick={() => onDecide({ decision: 'assign', companyId: n.companyId })} disabled={busy} className="text-primary bg-transparent border-0 p-0 cursor-pointer font-semibold hover:underline">
                {n.name}
              </button>
              <span className="text-muted-foreground"> ({Math.round(n.score * 100)}%)</span>
            </span>
          ))}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Existing company</span>
          <span className="flex gap-1.5">
            <select value={pick} onChange={e => setPick(e.target.value)} className={`${inputCls} w-auto max-w-[220px]`} aria-label={`Company for ${row.domain}`}>
              <option value="">Choose…</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Btn size="sm" level="secondary" disabled={!pick || busy} loading={busy} onClick={() => onDecide({ decision: 'assign', companyId: pick })}><Check size={12} /> Assign</Btn>
          </span>
        </label>

        <label className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Or add new</span>
          <span className="flex gap-1.5">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Company name" className={`${inputCls} flex-1`} />
            <select value={kind} onChange={e => setKind(e.target.value as CompanyKind)} className={`${inputCls} w-auto`} aria-label="Kind">
              {COMPANY_KINDS.filter(k => k !== 'other').map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <Btn size="sm" level="primary" disabled={!name.trim() || busy} loading={busy} onClick={() => onDecide({ decision: 'create', name: name.trim(), kind })}><Plus size={12} /> Create</Btn>
          </span>
        </label>

        <Btn size="sm" level="tertiary" disabled={busy} onClick={() => onDecide({ decision: 'ignore' })} className="text-muted-foreground" title="Newsletters, vendors, anyone we do not need to track"><Ban size={12} /> Not one to track</Btn>
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
    <li className="py-3 border-b border-[--border-subtle] last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium m-0 flex items-center gap-1.5 flex-wrap">
            <Mail size={11} className="text-muted-foreground/60" />
            <span className="truncate">{row.subject ?? '(no subject)'}</span>
            {row.category && <Chip tone="neutral" className="capitalize">{row.category}</Chip>}
          </p>
          <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 truncate">
            {[contactName, row.contacts?.company, fmtRelative(row.last_message_at)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Link href={`/engagement?lead=${row.id}`} className="text-[11.5px] text-primary no-underline hover:underline inline-flex items-center gap-1 flex-shrink-0"><ExternalLink size={11} /> Open</Link>
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <select value={pick} onChange={e => setPick(e.target.value)} className={`${inputCls} w-auto max-w-[240px]`} aria-label="Company">
          <option value="">Choose a company…</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Btn size="sm" level="secondary" disabled={!pick || busy} onClick={() => decide({ decision: 'link', companyId: pick })}><Check size={12} /> Link</Btn>
        <Btn size="sm" level="tertiary" disabled={busy} onClick={() => decide({ decision: 'not_client' })} className="text-muted-foreground"><X size={12} /> Not a client</Btn>
      </div>
    </li>
  )
}
