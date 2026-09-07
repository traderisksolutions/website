'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Building2, Mail, FileText, Users, Receipt, CalendarDays, ExternalLink } from 'lucide-react'
import { AppScrollPage } from '@/components/app-shell'
import { StatCard } from '@/components/stat-card'
import { StatusBadge } from '@/components/status-badge'
import { DetailSection, DetailField } from '@/components/detail-section'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/app/api/calendar/events/route'

// ── Types ─────────────────────────────────────────────────────────────────────

type Contact = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }
type Policy = { id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null; broker: string | null; currency: string | null; start_date: string | null; end_date: string | null; status: string | null }
type DebitNote = { id: string; debit_note_no: string; issue_date: string; currency: string; gross_amount: number; status: 'unpaid' | 'partially_paid' | 'paid'; insurer: string | null }
type CompanyDetail = {
  company: { id: string; name: string; domain: string | null; type: string | null; industry: string | null; address: string | null; notes: string | null }
  contacts: { id: string; role: string; is_primary: boolean; contacts: Contact | null }[]
  policies: Policy[]
  debitNotes: DebitNote[]
  summary: { contactCount: number; nextRenewalDate: string | null; openDebitNoteCount: number }
}
type Thread = {
  id: string; subject: string | null; snippet: string | null; last_message_at: string | null
  status: string; contact_id: string | null; message_count: number
  contacts: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null
}

type Tab = 'overview' | 'threads' | 'policies' | 'debit-notes' | 'due-dates'

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmt = (n: number, c: string) => `${c} ${Number(n ?? 0).toLocaleString('en-SG', { minimumFractionDigits: 2 })}`
const contactName = (c: Pick<Contact, 'first_name' | 'last_name' | 'email'> | null) => c ? [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Contact' : 'Unknown contact'

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('overview')

  const [detail, setDetail]   = useState<CompanyDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const [threads, setThreads]               = useState<Thread[] | null>(null)
  const [threadsLoading, setThreadsLoading]  = useState(false)
  const [events, setEvents]                 = useState<CalendarEvent[] | null>(null)
  const [eventsLoading, setEventsLoading]    = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/companies/${id}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [id])

  const loadThreads = useCallback(() => {
    if (threads) return
    setThreadsLoading(true)
    fetch(`/api/companies/${id}/threads`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { threads: [] })
      .then(d => setThreads(Array.isArray(d.threads) ? d.threads : []))
      .finally(() => setThreadsLoading(false))
  }, [id, threads])

  const loadEvents = useCallback(() => {
    if (events) return
    setEventsLoading(true)
    const from = new Date().toISOString().slice(0, 10)
    const to   = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10)
    fetch(`/api/calendar/events?from=${from}&to=${to}&companyId=${id}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then(d => setEvents(Array.isArray(d) ? d : []))
      .finally(() => setEventsLoading(false))
  }, [id, events])

  useEffect(() => {
    if (tab === 'threads') loadThreads()
    if (tab === 'due-dates') loadEvents()
  }, [tab, loadThreads, loadEvents])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(50vh/var(--ui-zoom))]">
        <Loader2 size={20} className="animate-spin text-muted-foreground/40" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="px-8 py-7">
        <p className="text-[14px] text-destructive mb-2">Company not found.</p>
        <Link href="/companies" className="text-[13px] text-primary hover:underline">← Back to Companies</Link>
      </div>
    )
  }

  const { company, contacts, policies, debitNotes, summary } = detail

  return (
    <AppScrollPage maxWidth="1000px">
      <Link
        href="/companies"
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground/60 hover:text-muted-foreground no-underline mb-3"
      >
        <ArrowLeft size={12} /> Companies
      </Link>

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Building2 size={20} className="text-muted-foreground/50 flex-shrink-0" />
        <h1 className="text-[20px] font-bold tracking-tight text-foreground uppercase flex-1 min-w-0 m-0">
          {company.name}
        </h1>
        {company.type && <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1 rounded bg-muted">{company.type}</span>}
      </div>

      <div className="flex items-center gap-6 px-4 py-3 mb-5 rounded-lg bg-muted/30 border border-[--border-subtle] flex-wrap">
        <StatCard label="Contacts" value={summary.contactCount} icon={Users} />
        <StatCard label="Next Renewal" value={fmtDate(summary.nextRenewalDate)} icon={CalendarDays} />
        <StatCard label="Open Debit Notes" value={summary.openDebitNoteCount} urgent={summary.openDebitNoteCount > 0} icon={Receipt} />
      </div>

      <div className="flex border-b border-[--border-subtle] mb-5 overflow-x-auto">
        {([
          { key: 'overview',    label: 'Overview',     icon: <Building2 size={13} /> },
          { key: 'threads',     label: 'Threads',      icon: <Mail size={13} /> },
          { key: 'policies',    label: 'Policies',     icon: <FileText size={13} /> },
          { key: 'debit-notes', label: 'Debit Notes',  icon: <Receipt size={13} /> },
          { key: 'due-dates',   label: 'Due Dates',    icon: <CalendarDays size={13} /> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'inline-flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap relative',
              'px-4 py-2.5 border-0 bg-transparent cursor-pointer',
              'text-[13px] transition-colors border-b-2 -mb-px',
              tab === t.key
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="flex flex-col gap-4">
          <DetailSection label="Company details">
            <DetailField label="Address">{company.address ?? '—'}</DetailField>
            <DetailField label="Industry">{company.industry ?? '—'}</DetailField>
            <DetailField label="Domain">{company.domain ?? '—'}</DetailField>
            {company.notes && <DetailField label="Notes">{company.notes}</DetailField>}
          </DetailSection>

          <DetailSection label={`Contacts (${contacts.length})`}>
            {contacts.length === 0 && <p className="text-[11.5px] text-muted-foreground">None on file yet.</p>}
            {contacts.map(cc => (
              <DetailField key={cc.id} label={contactName(cc.contacts)}>
                <span className="flex items-center gap-1.5"><Mail size={11} className="text-muted-foreground/50" /> {cc.contacts?.email ?? cc.contacts?.phone ?? '—'}</span>
              </DetailField>
            ))}
          </DetailSection>
        </div>
      )}

      {tab === 'threads' && (
        <div className="flex flex-col">
          {threadsLoading && <div className="flex justify-center py-10"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>}
          {!threadsLoading && threads?.length === 0 && <p className="text-[12.5px] text-muted-foreground py-6 text-center">No email threads linked to this company yet.</p>}
          {!threadsLoading && threads?.map(t => (
            <Link
              key={t.id}
              href={`/engagement?lead=${t.id}`}
              className="flex items-start justify-between gap-3 px-3 py-3 border-b border-[--border-subtle] hover:bg-accent/40 no-underline text-foreground"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold truncate">{t.subject ?? '(no subject)'}</p>
                <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">{t.snippet ?? ''}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">{contactName(t.contacts)} · {t.message_count} message{t.message_count !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] text-muted-foreground/60">{fmtDate(t.last_message_at)}</span>
                <ExternalLink size={12} className="text-muted-foreground/40" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === 'policies' && (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-[--border-subtle] text-[10.5px] uppercase tracking-wider text-muted-foreground/60">
              <th className="text-left px-3 py-2 font-semibold">Policy #</th>
              <th className="text-left px-3 py-2 font-semibold">Insurer</th>
              <th className="text-left px-3 py-2 font-semibold">Class</th>
              <th className="text-left px-3 py-2 font-semibold">Ends</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {policies.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">No policies yet.</td></tr>
            )}
            {policies.map(p => (
              <tr key={p.id} className="border-b border-[--border-subtle]">
                <td className="px-3 py-2.5 text-muted-foreground">{p.policy_number || '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{p.insurer ?? '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{p.class_of_insurance ?? '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(p.end_date)}</td>
                <td className="px-3 py-2.5 text-muted-foreground capitalize">{p.status ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'debit-notes' && (
        <>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[--border-subtle] text-[10.5px] uppercase tracking-wider text-muted-foreground/60">
                <th className="text-left px-3 py-2 font-semibold">DN #</th>
                <th className="text-left px-3 py-2 font-semibold">Insurer</th>
                <th className="text-left px-3 py-2 font-semibold">Issued</th>
                <th className="text-right px-3 py-2 font-semibold">Amount</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {debitNotes.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">No debit notes yet.</td></tr>
              )}
              {debitNotes.map(dn => (
                <tr key={dn.id} className="border-b border-[--border-subtle]">
                  <td className="px-3 py-2.5 font-mono text-[11.5px]">{dn.debit_note_no}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{dn.insurer ?? '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(dn.issue_date)}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{fmt(dn.gross_amount, dn.currency)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={dn.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href={`/debit-notes?company_id=${id}`} className="inline-block mt-3 text-[11.5px] font-semibold text-primary hover:underline">View all debit notes →</Link>
        </>
      )}

      {tab === 'due-dates' && (
        <div className="flex flex-col">
          {eventsLoading && <div className="flex justify-center py-10"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>}
          {!eventsLoading && events?.length === 0 && <p className="text-[12.5px] text-muted-foreground py-6 text-center">Nothing due in the next 180 days.</p>}
          {!eventsLoading && events?.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-3 border-b border-[--border-subtle]">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">
                  {e.type === 'renewal' ? `${e.classOfInsurance ?? 'Policy'} — ${e.label}` : `Debit note ${e.debitNoteNo} due`}
                </p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">
                  {e.type === 'renewal' ? (e.policyNumber ?? e.insurer ?? '') : (e.policyNumber ?? e.insurer ?? '')}
                </p>
              </div>
              <span className="text-[11.5px] text-muted-foreground flex-shrink-0">{fmtDate(e.date)}</span>
            </div>
          ))}
        </div>
      )}
    </AppScrollPage>
  )
}
