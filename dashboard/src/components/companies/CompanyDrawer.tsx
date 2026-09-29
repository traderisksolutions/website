'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { X, ExternalLink, MoreHorizontal, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StaffMember } from '@/lib/crm/staff'
import type { Row } from '@/components/board/useBoardData'
import type { BoardActions } from '@/components/board/actions'
import { TodoEditor } from '@/components/board/TodoEditor'
import { relative } from '@/components/board/model'
import type { Policy } from '@/components/crm/PoliciesPanel'
import { EditCompanyDialog } from '@/components/crm/dialogs'
import type { CompanyThread, PaymentDerived, PaymentSummary, Company } from '@/lib/crm/types'
import { fmtMoney, fmtDate } from '@/lib/crm/format'
import { STAGE_LABEL } from '@/lib/crm/types'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { OwnerPicker } from './OwnerPicker'

/**
 * The company panel. Opens over Home or the Companies table and keeps them where they were.
 * Four tabs, nothing above them: Overview is the to-do list (blank when there is none),
 * Policies lists every policy and opens its debit note, Threads opens the thread, Finance is
 * the debit notes with what is due and when.
 */

type Tab = 'overview' | 'policies' | 'threads' | 'finance'
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' }, { key: 'policies', label: 'Policies' }, { key: 'threads', label: 'Threads' }, { key: 'finance', label: 'Finance' },
]

type Detail = { policies: Policy[]; payments: PaymentDerived[]; paymentSummary: PaymentSummary }

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

export function CompanyDrawer({ row, today, staff, staffList, workloads, actions, me, onClose, onPatchCompany, onCompanyUpdated }: {
  row: Row
  today: string
  staff: Map<string, StaffMember>
  staffList: StaffMember[]
  workloads: Map<string, { open: number; overdue: number }>
  actions: BoardActions
  me: string | null
  onClose: () => void
  onPatchCompany: (companyId: string, body: Record<string, unknown>) => Promise<void>
  onCompanyUpdated: (c: Company) => void
}) {
  const c = row.company
  const [tab, setTab] = useState<Tab>('overview')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [threads, setThreads] = useState<CompanyThread[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDetail(null); setThreads(null); setTab('overview'); setMenu(false)
    fetch(`/api/companies/${c.id}`, { cache: 'no-store' }).then(r => r.json()).then(d => setDetail(d)).catch(() => {})
  }, [c.id])
  useEffect(() => {
    if (tab === 'threads' && threads === null) fetch(`/api/companies/${c.id}/threads`, { cache: 'no-store' }).then(r => r.json()).then(d => setThreads(d.threads ?? [])).catch(() => setThreads([]))
  }, [tab, c.id, threads])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, c.id])

  void workloads
  const pinned = !!c.home_pinned_at
  const pinsAvailable = c.home_pinned_at !== undefined
  const noteForPolicy = (p: Policy) => detail?.payments.find(n => n.policy_id === p.id) ?? null
  const policyHref = (p: Policy) => { const n = noteForPolicy(p); return n ? `/debit-notes?company_id=${c.id}&open=${n.id}` : `/debit-notes?company_id=${c.id}` }
  const owner = c.owner_email ? (staff.get(c.owner_email)?.name ?? c.owner_email.split('@')[0]) : null

  return (
    <aside ref={panel} tabIndex={-1} role="dialog" aria-label={c.name}
      className="fixed right-0 z-40 w-full sm:w-[460px] bg-white flex flex-col outline-none"
      style={{ top: 56, bottom: 0, borderLeft: `1px solid ${RULE}`, boxShadow: '-24px 0 48px -32px rgba(32,33,36,0.25)', color: INK, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div className="flex-shrink-0 px-7 pt-7 pb-0">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[22px] font-medium leading-[1.2] tracking-[-0.01em]" style={{ textWrap: 'balance' }}>{c.name}</h2>
            <p className="m-0 mt-1.5 text-[13.5px] flex items-center gap-2 flex-wrap" style={{ color: MUTED }}>
              <span className="truncate">{STAGE_LABEL[c.stage as keyof typeof STAGE_LABEL] ?? c.stage}{c.domains[0] ? ` · ${c.domains[0]}` : ''}</span>
              <span aria-hidden>·</span>
              {/* Owners are chosen here, per company: one or many. Nobody is an owner by default. */}
              <OwnerPicker value={c.owner_emails} staff={staffList} onChange={list => void onPatchCompany(c.id, { owner_emails: list })} />
            </p>
          </div>
          <div className="relative flex items-center gap-1 flex-shrink-0 -mr-2 -mt-1">
            <button type="button" onClick={() => setMenu(v => !v)} aria-label="More actions" aria-expanded={menu} className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><MoreHorizontal size={18} /></button>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={18} /></button>
            {menu && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-[12px] bg-white p-1.5 z-10" style={{ border: `1px solid ${RULE}`, boxShadow: '0 12px 32px rgba(32,33,36,0.12)' }} onMouseLeave={() => setMenu(false)}>
                <Link href={`/companies/${c.id}`} className="block px-3 py-2 rounded-[8px] text-[14px] no-underline hover:bg-[#f8f9fa]" style={{ color: INK }}>Open company page</Link>
                {pinsAvailable && <button type="button" onClick={() => { setMenu(false); void onPatchCompany(c.id, { pinned: !pinned }) }} className="w-full text-left px-3 py-2 rounded-[8px] text-[14px] bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa] inline-flex items-center gap-2" style={{ color: INK }}><Pin size={14} /> {pinned ? 'Unpin from Home' : 'Pin to Home'}</button>}
                <Link href={`/debit-notes/new?companyId=${c.id}`} className="block px-3 py-2 rounded-[8px] text-[14px] no-underline hover:bg-[#f8f9fa]" style={{ color: INK }}>Add debit note</Link>
                <button type="button" onClick={() => { setMenu(false); setEditing(true) }} className="w-full text-left px-3 py-2 rounded-[8px] text-[14px] bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa]" style={{ color: INK }}>Edit company</button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs: text with an underline */}
        <div className="mt-6 flex items-center gap-6" role="tablist" style={{ borderBottom: `1px solid ${RULE}` }}>
          {TABS.map(t => {
            const on = tab === t.key
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                className={cn('relative pb-3 bg-transparent border-0 cursor-pointer text-[14px]', on ? 'font-medium' : 'hover:text-[#202124]')} style={{ color: on ? INK : MUTED }}>
                {t.label}
                <span className={cn('absolute left-0 right-0 -bottom-px h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden />
              </button>
            )
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-7 py-6">
        {tab === 'overview' && (
          <div className="flex flex-col gap-4">
            {pinsAvailable && (
              <p className="m-0 text-[13px]" style={{ color: MUTED }}>
                {pinned ? 'Pinned to Home.' : 'Not on Home.'}{' '}
                <button type="button" onClick={() => void onPatchCompany(c.id, { pinned: !pinned })} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>{pinned ? 'Unpin' : 'Pin to Home'}</button>
              </p>
            )}
            <TodoEditor companyId={c.id} tasks={c.tasks} today={today} staff={staff} staffList={staffList} me={me} actions={actions} />
          </div>
        )}

        {tab === 'policies' && (
          detail === null ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>Loading…</p> :
          detail.policies.length === 0 ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>No policies on file.</p> : (
            <Register label="Policies" minWidth={0}>
              <RegisterHead>
                <RegisterTh first>Cover</RegisterTh>
                <RegisterTh align="right" last>Renewal</RegisterTh>
              </RegisterHead>
              <tbody>
                {[...detail.policies].sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? '')).map(p => (
                  <RegisterRow key={p.id} onClick={() => { window.location.href = policyHref(p) }}>
                    <RegisterCell first identityWidth={230} primary={p.class_of_insurance ?? 'Policy'} secondary={[p.insurer, p.policy_number].filter(Boolean).join(' · ') || 'No insurer on file'} />
                    <RegisterCell last align="right" primary={p.end_date ? fmtDate(p.end_date) : 'No end date'} secondary={p.status && p.status !== 'active' ? p.status : p.premium ? fmtMoney(p.premium, p.currency ?? 'SGD') : undefined} />
                  </RegisterRow>
                ))}
              </tbody>
            </Register>
          )
        )}

        {tab === 'threads' && (
          threads === null ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>Loading…</p> :
          threads.length === 0 ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>No threads are filed under this company yet.</p> : (
            <Register label="Threads" minWidth={0}>
              <RegisterHead>
                <RegisterTh first>Thread</RegisterTh>
                <RegisterTh align="right" last>Last message</RegisterTh>
              </RegisterHead>
              <tbody>
                {threads.map(t => (
                  <RegisterRow key={t.id} onClick={() => { window.location.href = `/engagement?lead=${t.id}` }}>
                    <RegisterCell first identityWidth={250} primary={t.subject ?? '(no subject)'} secondary={[t.contact?.name ?? t.contact?.email ?? 'Unknown', t.needsReply ? 'Awaiting our reply' : null, t.category].filter(Boolean).join(' · ')} />
                    <RegisterCell last align="right" primary={relative(t.last_message_at)} />
                  </RegisterRow>
                ))}
              </tbody>
            </Register>
          )
        )}

        {tab === 'finance' && (
          detail === null ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>Loading…</p> :
          detail.payments.length === 0 ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>No debit notes yet.</p> : (
            <Register label="Debit notes" minWidth={0}>
              <RegisterHead>
                <RegisterTh first>Debit note</RegisterTh>
                <RegisterTh align="right" last>Amount due</RegisterTh>
              </RegisterHead>
              <tbody>
                {[...detail.payments].sort((a, b) => (a.payment_due_date ?? '').localeCompare(b.payment_due_date ?? '')).map(n => (
                  <RegisterRow key={n.id} onClick={() => { window.location.href = `/debit-notes?company_id=${c.id}&open=${n.id}` }}>
                    <RegisterCell first identityWidth={230} primary={n.debit_note_no} secondary={[n.classOfInsurance ?? n.insurer, n.payment_due_date ? `due ${fmtDate(n.payment_due_date)}` : null].filter(Boolean).join(' · ') || undefined} />
                    <RegisterCell last align="right" primary={n.outstanding > 0 ? fmtMoney(n.outstanding, n.currency) : <span style={{ color: MUTED }}>Settled</span>} />
                  </RegisterRow>
                ))}
                <RegisterRow>
                  <RegisterCell first identityWidth={230}><span className="text-[13px]" style={{ color: MUTED }}>Total due</span></RegisterCell>
                  <RegisterCell last align="right"><span className="text-[14px] font-medium tabular-nums" style={{ color: INK }}>{detail.paymentSummary.byCurrency.filter(m => m.outstanding > 0).map(m => fmtMoney(m.outstanding, m.currency)).join(' · ') || '—'}</span></RegisterCell>
                </RegisterRow>
              </tbody>
            </Register>
          )
        )}
      </div>

      <div className="flex-shrink-0 px-7 py-4 flex items-center justify-between" style={{ borderTop: `1px solid ${RULE}` }}>
        <span className="text-[12.5px]" style={{ color: MUTED }}>Esc to close</span>
        <Link href={`/companies/${c.id}`} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-[10px] text-white text-[14px] font-medium no-underline" style={{ background: INK }}><ExternalLink size={14} /> Open company</Link>
      </div>

      <EditCompanyDialog open={editing} onClose={() => setEditing(false)} company={c} onSaved={onCompanyUpdated} />
    </aside>
  )
}
