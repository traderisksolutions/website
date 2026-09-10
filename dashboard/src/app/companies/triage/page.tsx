'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Link2, Sparkles, Check, X, Ban, Plus, ExternalLink, Wand2 } from 'lucide-react'
import { AppScrollPage } from '@/components/app-shell'
import { PageHeader } from '@/components/page-header'
import { NewCompanyDialog } from '@/components/crm/dialogs'
import { Btn, Chip, Segmented, Spinner, Empty, inputCls } from '@/components/crm/primitives'
import { fmtRelative } from '@/lib/crm/format'
import type { LinkSuggestion, LinkVerdict } from '@/lib/crm/types'

type Row = {
  id: string; subject: string | null; snippet: string | null; category: string | null; last_message_at: string | null
  contacts: { id: string; email: string | null; first_name: string | null; last_name: string | null; company: string | null } | null
  participants: { email: string; name: string | null }[]
  suggestion: LinkSuggestion | null
}
type CompanyOpt = { id: string; name: string; domains: string[] }
type Filter = 'all' | 'suggested' | 'none'

const VERDICT: Record<LinkVerdict, { label: string; tone: 'green' | 'blue' | 'neutral' | 'amber' }> = {
  existing: { label: 'Existing company', tone: 'green' }, new: { label: 'New company', tone: 'blue' }, not_client: { label: 'Not a client', tone: 'neutral' }, unsure: { label: 'Unsure', tone: 'amber' },
}

export default function TriagePage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [companies, setCompanies] = useState<CompanyOpt[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [running, setRunning] = useState<'exact' | 'suggest' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [create, setCreate] = useState<{ threadId: string; name: string; domain: string } | null>(null)

  async function load() {
    const res = await fetch('/api/companies/triage', { cache: 'no-store' })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Could not load.'); setRows([]); return }
    setRows(d.threads); setCompanies(d.companies)
  }
  useEffect(() => { load() }, [])

  async function run(mode: 'exact' | 'suggest') {
    setRunning(mode); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/companies/triage/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, limit: 24 }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'The run failed.')
      setNotice(mode === 'exact' ? `Linked ${d.linked} thread${d.linked === 1 ? '' : 's'} by exact match. ${d.remaining} left to review.` : `The agent added ${d.suggested} suggestion${d.suggested === 1 ? '' : 's'}. Review them below.`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setRunning(null) }
  }

  async function decide(threadId: string, body: Record<string, unknown>) {
    setError(null)
    const res = await fetch(`/api/companies/triage/${threadId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Could not apply.'); return }
    if (body.decision === 'reject') setRows(prev => prev?.map(r => r.id === threadId && r.suggestion ? { ...r, suggestion: { ...r.suggestion, status: 'rejected' } } : r) ?? null)
    else setRows(prev => prev?.filter(r => r.id !== threadId) ?? null)
  }

  const visible = useMemo(() => {
    const v = rows ?? []
    if (filter === 'suggested') return v.filter(r => r.suggestion?.status === 'pending')
    if (filter === 'none') return v.filter(r => !r.suggestion || r.suggestion.status !== 'pending')
    return v
  }, [rows, filter])
  const pendingCount = rows?.filter(r => r.suggestion?.status === 'pending').length ?? 0

  return (
    <AppScrollPage maxWidth="1100px">
      <PageHeader
        title="Link threads to companies"
        description={rows ? `${rows.length} email thread${rows.length === 1 ? '' : 's'} not filed under a company yet.` : 'Loading…'}
        className="mb-4"
        actions={
          <>
            <Btn level="secondary" onClick={() => run('exact')} loading={running === 'exact'} disabled={running !== null} title="Links threads whose contact or email domain already belongs to a company. No AI involved."><Wand2 size={12} /> Link exact matches</Btn>
            <Btn level="primary" onClick={() => run('suggest')} loading={running === 'suggest'} disabled={running !== null} title="The agent proposes a company for up to 24 threads. Nothing is linked until you accept."><Sparkles size={12} /> Ask the agent</Btn>
          </>
        }
      />

      {notice && <div className="rounded-md px-3 py-2 mb-3 text-[12.5px]" style={{ background: 'var(--success-bg)', color: 'var(--success)', borderLeft: '3px solid var(--success-border)' }}>{notice}</div>}
      {error && <div className="rounded-md px-3 py-2 mb-3 text-[12.5px]" style={{ background: 'var(--error-bg)', color: 'var(--error)', borderLeft: '3px solid rgba(192,51,71,0.4)' }}>{error}</div>}

      <div className="mb-3">
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All', count: rows?.length ?? 0 }, { value: 'suggested', label: 'Has a suggestion', count: pendingCount }, { value: 'none', label: 'Needs a decision by hand', count: (rows?.length ?? 0) - pendingCount }]} />
      </div>

      {!rows && <Spinner label="Loading threads…" />}
      {rows && visible.length === 0 && <div className="rounded-lg bg-card" style={{ boxShadow: 'var(--card-shadow)' }}><Empty>{rows.length === 0 ? 'Every thread is filed. Nothing to do here.' : 'Nothing in this filter.'}</Empty></div>}

      <ul className="m-0 p-0 list-none flex flex-col gap-3">
        {visible.map(r => (
          <TriageRow key={r.id} r={r} companies={companies}
            onAccept={() => decide(r.id, { decision: 'accept' })}
            onReject={() => decide(r.id, { decision: 'reject' })}
            onNotClient={() => decide(r.id, { decision: 'not_client' })}
            onLink={companyId => decide(r.id, { decision: 'link', companyId })}
            onCreate={() => setCreate({ threadId: r.id, name: r.suggestion?.suggested_name ?? r.contacts?.company ?? '', domain: r.suggestion?.suggested_domain ?? (r.contacts?.email?.split('@')[1] ?? '') })}
          />
        ))}
      </ul>

      <NewCompanyDialog
        open={!!create}
        onClose={() => setCreate(null)}
        defaultName={create?.name}
        defaultDomain={create?.domain}
        onCreated={async id => { if (create) await decide(create.threadId, { decision: 'link', companyId: id }); setCreate(null); load() }}
      />
    </AppScrollPage>
  )
}

function TriageRow({ r, companies, onAccept, onReject, onNotClient, onLink, onCreate }: {
  r: Row; companies: CompanyOpt[]
  onAccept: () => Promise<void>; onReject: () => Promise<void>; onNotClient: () => Promise<void>; onLink: (companyId: string) => Promise<void>; onCreate: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [pick, setPick] = useState('')
  const s = r.suggestion
  const pending = s?.status === 'pending'
  const contactName = r.contacts ? [r.contacts.first_name, r.contacts.last_name].filter(Boolean).join(' ') || r.contacts.email : null
  const suggestedCompany = s?.suggested_company_id ? companies.find(c => c.id === s.suggested_company_id) : null
  const wrap = (key: string, fn: () => Promise<void>) => async () => { setBusy(key); try { await fn() } finally { setBusy(null) } }

  return (
    <li className="rounded-lg bg-card px-4 py-3" style={{ boxShadow: 'var(--card-shadow)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold m-0 flex items-center gap-1.5 flex-wrap">
            <span className="truncate max-w-full">{r.subject ?? '(no subject)'}</span>
            {r.category && <Chip tone="neutral" className="capitalize">{r.category}</Chip>}
          </p>
          <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 line-clamp-2">{r.snippet}</p>
          <p className="text-[11px] text-muted-foreground/80 m-0 mt-1">
            {contactName ? <>{contactName}{r.contacts?.company ? ` (${r.contacts.company})` : ''} · </> : null}
            {r.participants.slice(0, 3).map(p => p.email).join(', ')}{r.participants.length > 3 ? ` +${r.participants.length - 3}` : ''} · {fmtRelative(r.last_message_at)}
          </p>
        </div>
        <Link href={`/engagement?lead=${r.id}`} className="text-[11.5px] text-primary no-underline hover:underline inline-flex items-center gap-1 flex-shrink-0"><ExternalLink size={11} /> Open</Link>
      </div>

      {s && (
        <div className="mt-2.5 rounded-md px-3 py-2 flex items-start justify-between gap-3 flex-wrap" style={{ background: pending ? 'var(--primary-light-bg)' : 'var(--neutral-status-bg)', borderLeft: `3px solid ${pending ? 'var(--primary-light-border)' : 'var(--border-mid)'}` }}>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] m-0 flex items-center gap-1.5 flex-wrap">
              <Sparkles size={11} className="text-muted-foreground" />
              <Chip tone={VERDICT[s.verdict].tone}>{VERDICT[s.verdict].label}</Chip>
              {s.verdict === 'existing' && suggestedCompany && <strong>{suggestedCompany.name}</strong>}
              {s.verdict === 'new' && <strong>{s.suggested_name}{s.suggested_domain ? ` · ${s.suggested_domain}` : ''}</strong>}
              {s.confidence != null && <span className="text-muted-foreground">{Math.round(s.confidence * 100)}% sure</span>}
              {s.status === 'rejected' && <span className="text-muted-foreground">· rejected, link by hand below</span>}
            </p>
            {s.rationale && <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5">{s.rationale}</p>}
          </div>
          {pending && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {s.verdict !== 'unsure' && <Btn size="xs" level="primary" onClick={wrap('accept', onAccept)} loading={busy === 'accept'}><Check size={12} /> Accept</Btn>}
              <Btn size="xs" level="tertiary" onClick={wrap('reject', onReject)} loading={busy === 'reject'}><X size={12} /> Reject</Btn>
            </div>
          )}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <select value={pick} onChange={e => setPick(e.target.value)} className={`${inputCls} w-auto max-w-[260px]`} aria-label="Choose a company">
          <option value="">Choose a company…</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Btn size="sm" level="secondary" disabled={!pick} onClick={wrap('link', () => onLink(pick))} loading={busy === 'link'}><Link2 size={12} /> Link</Btn>
        <Btn size="sm" level="tertiary" onClick={onCreate}><Plus size={12} /> New company</Btn>
        <Btn size="sm" level="tertiary" onClick={wrap('nc', onNotClient)} loading={busy === 'nc'} className="text-muted-foreground" title="Insurer, lawyer, vendor or newsletter — hide from this list"><Ban size={12} /> Not a client</Btn>
      </div>
    </li>
  )
}
