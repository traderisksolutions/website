'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Mail, FileText, X, Loader2 } from 'lucide-react'
import { AppSplitLayout, AppMainPanel, AppPageHeader, AppPageBody } from '@/components/app-shell'
import { DataTableToolbar, DataTableSearch } from '@/components/data-table/toolbar'
import { DetailSection, DetailField } from '@/components/detail-section'
import { StatusBadge } from '@/components/status-badge'

/**
 * "Companies" tab on the Active Contacts page — insurance clients (companies/policies/debit
 * notes), additive to the existing sales-lead contact list. Debit notes and PDF imports create
 * or match rows here via /api/companies, so this is where "merged into Active Contacts" surfaces.
 */

type CompanyRow = { id: string; name: string; address: string | null; type: string | null; domain: string | null }
type CompanyContact = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }
type Policy = { id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null; broker: string | null; currency: string | null; start_date: string | null; end_date: string | null; status: string | null }
type DebitNote = { id: string; debit_note_no: string; issue_date: string; currency: string; gross_amount: number; status: 'unpaid' | 'partially_paid' | 'paid'; insurer: string | null }

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export function CompaniesTab({ onSwitchToContacts }: { onSwitchToContacts: () => void }) {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => {
      fetch(`/api/companies${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ''}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : [])
        .then((rows: CompanyRow[]) => setCompanies(Array.isArray(rows) ? rows : []))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  return (
    <AppSplitLayout>
      <AppMainPanel>
        <AppPageHeader
          title="Companies"
          description={loading ? 'Loading…' : `${companies.length} compan${companies.length !== 1 ? 'ies' : 'y'}`}
          actions={(
            <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted">
              <button onClick={onSwitchToContacts} className="text-[11.5px] font-medium px-2.5 py-1 rounded text-muted-foreground hover:text-foreground">Contacts</button>
              <button className="text-[11.5px] font-semibold px-2.5 py-1 rounded bg-card shadow-sm text-foreground">Companies</button>
            </div>
          )}
        />
        <DataTableToolbar>
          <DataTableSearch value={q} onChange={setQ} placeholder="Search companies…" />
        </DataTableToolbar>
        <AppPageBody padded={false}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[--border-subtle] text-[10.5px] uppercase tracking-wider text-muted-foreground/60">
                <th className="text-left px-4 py-2 font-semibold">Company</th>
                <th className="text-left px-3 py-2 font-semibold">Address</th>
                <th className="text-left px-3 py-2 font-semibold">Type</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[--border-subtle]"><td colSpan={3} className="px-4 h-11"><div className="skeleton sk-cell" style={{ width: '60%', height: 10 }} /></td></tr>
              ))}
              {!loading && companies.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">No companies yet — they're created from Debit Note generation or PDF import.</td></tr>
              )}
              {!loading && companies.map(c => (
                <tr key={c.id} onClick={() => setSelectedId(c.id)} className="border-b border-[--border-subtle] hover:bg-accent/40 cursor-pointer">
                  <td className="px-4 py-2.5 font-medium flex items-center gap-1.5"><Building2 size={13} className="text-muted-foreground/50" /> <span className="uppercase">{c.name}</span></td>
                  <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[280px]">{c.address ?? '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{c.type ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AppPageBody>
      </AppMainPanel>

      {selectedId && <CompanyDetailPanel id={selectedId} onClose={() => setSelectedId(null)} />}
    </AppSplitLayout>
  )
}

function CompanyDetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<{ company: CompanyRow; contacts: { contacts: CompanyContact }[]; policies: Policy[]; debitNotes: DebitNote[] } | null>(null)

  useEffect(() => {
    setData(null)
    fetch(`/api/companies/${id}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(setData)
  }, [id])

  return (
    <div className="w-[340px] flex-shrink-0 border-l border-[--border-subtle] bg-card overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[--border-subtle] flex-shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground/55">Company</span>
        <button onClick={onClose} aria-label="Close" className="p-1 rounded-md hover:bg-muted text-muted-foreground/60 hover:text-foreground"><X size={13} /></button>
      </div>

      {!data ? (
        <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <DetailSection>
            <p className="text-[14px] font-semibold text-foreground uppercase">{data.company.name}</p>
            {data.company.address && <p className="text-[12px] text-muted-foreground mt-0.5">{data.company.address}</p>}
          </DetailSection>

          <DetailSection label="Contacts">
            {data.contacts.length === 0 && <p className="text-[11.5px] text-muted-foreground">None on file yet.</p>}
            {data.contacts.map(cc => (
              <DetailField key={cc.contacts.id} label={[cc.contacts.first_name, cc.contacts.last_name].filter(Boolean).join(' ') || 'Contact'}>
                <span className="flex items-center gap-1.5"><Mail size={11} className="text-muted-foreground/50" /> {cc.contacts.email ?? cc.contacts.phone ?? '—'}</span>
              </DetailField>
            ))}
          </DetailSection>

          <DetailSection label={`Policies (${data.policies.length})`}>
            {data.policies.length === 0 && <p className="text-[11.5px] text-muted-foreground">No policies yet.</p>}
            {data.policies.map(p => (
              <DetailField key={p.id} label={p.policy_number || p.class_of_insurance || 'Policy'}>
                {p.insurer} · ends {fmtDate(p.end_date)}
              </DetailField>
            ))}
          </DetailSection>

          <DetailSection label={`Debit notes (${data.debitNotes.length})`}>
            {data.debitNotes.length === 0 && <p className="text-[11.5px] text-muted-foreground">None yet.</p>}
            {data.debitNotes.map(dn => (
              <div key={dn.id} className="flex items-center justify-between text-[12px] mb-1.5">
                <span className="flex items-center gap-1.5"><FileText size={11} className="text-muted-foreground/50" /> {dn.debit_note_no}</span>
                <StatusBadge status={dn.status} />
              </div>
            ))}
          </DetailSection>

          <div className="px-4 pb-4 flex flex-col gap-1.5">
            <Link href={`/debit-notes?company_id=${id}`} className="text-[11.5px] font-semibold text-primary hover:underline">View all debit notes →</Link>
            <Link href={`/debit-notes/new`} className="text-[11.5px] font-semibold text-primary hover:underline">Generate a new debit note →</Link>
          </div>
        </>
      )}
    </div>
  )
}
