'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppSplitLayout, AppMainPanel } from '@/components/app-shell'
import { DataTableSearch } from '@/components/data-table/toolbar'
import { DetailSection, DetailField } from '@/components/detail-section'
import { StatusBadge } from '@/components/status-badge'
import { Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'

/**
 * "Companies" tab on the Contacts page — insurance clients (companies/policies/debit
 * notes), additive to the existing sales-lead contact list. Debit notes and PDF imports create
 * or match rows here via /api/companies, so this is where "merged into Contacts" surfaces.
 */

const INK = '#202124'
const MUTED = '#5f6368'

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
    <AppSplitLayout className="bg-white">
      <AppMainPanel className="bg-white">

        {/* Header: title, count line, view tabs, search */}
        <div className="flex-shrink-0 px-6 sm:px-12 pt-10" style={{ color: INK }}>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Companies</h1>
              <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
                {loading ? 'Loading…' : `${companies.length} compan${companies.length !== 1 ? 'ies' : 'y'}`}
              </p>
              <div className="mt-4 flex items-center gap-6" role="tablist" aria-label="Contacts or companies">
                {(['contacts', 'companies'] as const).map(k => {
                  const on = k === 'companies'
                  return (
                    <button key={k} type="button" role="tab" aria-selected={on} onClick={on ? undefined : onSwitchToContacts}
                      className={cn('relative pb-2 bg-transparent border-0 cursor-pointer text-[15px]', on ? 'font-medium' : 'hover:text-[#202124]')}
                      style={{ color: on ? INK : MUTED }}>
                      {k === 'contacts' ? 'Contacts' : 'Companies'}
                      <span className={cn('absolute left-0 right-0 bottom-0 h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden />
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap pb-2">
              <DataTableSearch value={q} onChange={setQ} placeholder="Search companies" />
            </div>
          </div>
          <div className="mt-5" style={{ borderBottom: '1px solid #e8eaed' }} />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 sm:px-12 pt-6 pb-16" style={{ color: INK }}>
          <Register label="Insurance client companies" minWidth={600}>
            <RegisterHead>
              <RegisterTh first hint="Company name, and its domain">Company</RegisterTh>
              <RegisterTh hint="Registered address on file">Address</RegisterTh>
              <RegisterTh last hint="Client or insurer">Type</RegisterTh>
            </RegisterHead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e8eaed' }}>
                  <td colSpan={3} className="pl-6 pr-6 h-14"><div className="h-3.5 w-[60%] rounded bg-[#f1f3f4] animate-pulse" /></td>
                </tr>
              ))}
              {!loading && companies.length === 0 && (
                <RegisterEmpty colSpan={3}>
                  {q.trim() ? `No companies match “${q.trim()}”.` : 'No companies yet. Debit note generation and PDF import create them.'}
                </RegisterEmpty>
              )}
              {!loading && companies.map(c => {
                const on = selectedId === c.id
                return (
                  <RegisterRow key={c.id} selected={on} onClick={() => setSelectedId(c.id)}>
                    <RegisterCell first selected={on} title={c.name} primary={c.name} secondary={c.domain ?? 'No domain on file'} />
                    <RegisterCell className="max-w-[360px]"><span className="block truncate text-[14px]" style={{ color: '#3c4043' }}>{c.address ?? '—'}</span></RegisterCell>
                    <RegisterCell last><span className="text-[14px]" style={{ color: '#3c4043' }}>{c.type ?? '—'}</span></RegisterCell>
                  </RegisterRow>
                )
              })}
            </tbody>
          </Register>
        </div>
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

  const link = 'text-[13.5px] no-underline hover:underline underline-offset-4'

  return (
    <div className="fixed inset-0 z-40 md:static md:inset-auto md:z-auto md:w-[340px] md:flex-shrink-0 bg-white overflow-y-auto flex flex-col"
      style={{ color: INK, borderLeft: '1px solid #e8eaed' }}>
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #e8eaed' }}>
        <span className="text-[16px] font-medium tracking-[-0.01em]">Company</span>
        <button type="button" onClick={onClose} aria-label="Close"
          className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] hover:bg-[#f1f3f4] bg-transparent border-0 cursor-pointer"
          style={{ color: MUTED }}>
          <X size={14} />
        </button>
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <>
          <DetailSection>
            <p className="m-0 text-[15px] font-medium" style={{ color: INK }}>{data.company.name}</p>
            {data.company.address && <p className="m-0 mt-0.5 text-[13px]" style={{ color: MUTED }}>{data.company.address}</p>}
          </DetailSection>

          <DetailSection label="Contacts">
            {data.contacts.length === 0 && <p className="m-0 text-[13px]" style={{ color: MUTED }}>None on file.</p>}
            {data.contacts.map(cc => (
              <DetailField key={cc.contacts.id} label={[cc.contacts.first_name, cc.contacts.last_name].filter(Boolean).join(' ') || 'Contact'}>
                {cc.contacts.email ?? cc.contacts.phone ?? '—'}
              </DetailField>
            ))}
          </DetailSection>

          <DetailSection label={`Policies · ${data.policies.length}`}>
            {data.policies.length === 0 && <p className="m-0 text-[13px]" style={{ color: MUTED }}>No policies.</p>}
            {data.policies.map(p => (
              <DetailField key={p.id} label={p.policy_number || p.class_of_insurance || 'Policy'}>
                {p.insurer} · ends {fmtDate(p.end_date)}
              </DetailField>
            ))}
          </DetailSection>

          <DetailSection label={`Debit notes · ${data.debitNotes.length}`}>
            {data.debitNotes.length === 0 && <p className="m-0 text-[13px]" style={{ color: MUTED }}>None.</p>}
            {data.debitNotes.map(dn => (
              <div key={dn.id} className="flex items-center justify-between text-[14px] mb-2 last:mb-0">
                <span style={{ color: INK }}>{dn.debit_note_no}</span>
                <StatusBadge status={dn.status} />
              </div>
            ))}
          </DetailSection>

          <div className="px-4 pb-5 flex flex-col gap-2">
            <Link href={`/debit-notes?company_id=${id}`} className={link} style={{ color: INK }}>All debit notes →</Link>
            <Link href={`/debit-notes/new`} className={link} style={{ color: INK }}>New debit note →</Link>
          </div>
        </>
      )}
    </div>
  )
}
