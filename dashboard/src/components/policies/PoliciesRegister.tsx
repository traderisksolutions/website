'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SectionCard, Empty, Spinner, Btn, Field, inputCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { statusWord } from '@/components/documents/DataRoom'
import type { DataRoomStatus } from '@/lib/documents/taxonomy'
import { fmtDate } from '@/lib/crm/format'
import { productLineLabel } from '@/lib/product-lines'
import { threadHref } from '@/lib/placement/position'
import type { PlacementBundle, PlacementRound } from '@/lib/placement/types'
import { callApi, errText, dialogCls, INK, MUTED, ERROR } from '@/components/placement/shared'
import { XlGrid, XlHead, XlHeadRow, XlTh, XlRow, XlCell } from '@/components/ui/xl-grid'
import type { DerivedPaymentStatus, PaymentDerived } from '@/lib/crm/types'
import { MembersPanel } from './MembersPanel'
import { fmtAmount, lifecycleWord, type PolicyView, type SpineQuote } from './types'

type Section = 'quotes' | 'employees' | 'dns'
const PAY_WORD: Record<DerivedPaymentStatus, string> = { paid: 'Paid', partial: 'Part paid', unpaid: 'Unpaid', overdue: 'Overdue' }

/** Line · Policy no. · Insurer · Premium · Period · Status · Notes · Members · Net */
const COLS = 10
/** A button inside the dense grid: 22px tall so the row stays 34px. */
const ROW_BTN = 'h-[22px] px-1.5 text-[12px] rounded-[6px]'
const PLAN_MAX = 36
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/**
 * The company's policies: one row per line of cover, from first quote to lapse. A row opens to
 * the quotes received for it; the chosen one is marked in words.
 */
export function PoliciesRegister({ policies, bundle, onChanged, title = 'Policies', payments, onOpenDrafts, docStatus }: {
  policies: PolicyView[] | null
  /** Data-room status per policy id: what is on file against what the policy needs. */
  docStatus?: Record<string, DataRoomStatus> | null
  bundle: PlacementBundle | null
  onChanged: () => void
  title?: string
  /** The company's debit notes; each opened policy lists its own. */
  payments?: PaymentDerived[] | null
  onOpenDrafts?: () => void
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [section, setSection] = useState<Record<string, Section>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [liveFor, setLiveFor] = useState<PolicyView | null>(null)

  const setErr = (id: string, msg: string | null) => setErrors(e => { const n = { ...e }; if (msg) n[id] = msg; else delete n[id]; return n })

  const rounds = useMemo(() => new Map((bundle?.rounds ?? []).map(r => [r.id, r] as [string, PlacementRound])), [bundle])
  const quotesFor = (p: PolicyView): SpineQuote[] => {
    if (!bundle || !p.placement_line_id) return []
    return (bundle.quotes as SpineQuote[]).filter(q => q.line_id === p.placement_line_id && q.status !== 'superseded')
      .sort((a, b) => (a.premium_amount ?? Infinity) - (b.premium_amount ?? Infinity))
  }

  async function choose(p: PolicyView, quoteId: string) {
    setBusy(quoteId); setErr(p.id, null)
    try {
      await callApi(`/api/policies/${p.id}/choose`, { method: 'POST', body: { quote_id: quoteId } })
      onChanged()
    } catch (e) { setErr(p.id, errText(e)) } finally { setBusy(null) }
  }

  async function setLifecycle(p: PolicyView, lifecycle: 'closed' | 'declined') {
    setBusy(p.id); setErr(p.id, null)
    try {
      await callApi(`/api/policies/${p.id}`, { method: 'PATCH', body: { lifecycle } })
      onChanged()
    } catch (e) { setErr(p.id, errText(e)) } finally { setBusy(null) }
  }

  const sorted = useMemo(() => policies ? [...policies].sort((a, b) => (b.start_date ?? b.end_date ?? '').localeCompare(a.start_date ?? a.end_date ?? '')) : [], [policies])

  return (
    <>
      <SectionCard title={title}>
        {!policies && <Spinner label="Loading policies…" />}
        {policies && policies.length === 0 && <Empty compact>No policies on file.</Empty>}
        {policies && policies.length > 0 && (
          <Register label="Policies" minWidth={1100} dense>
            <RegisterHead>
              <RegisterTh first>Line</RegisterTh>
              <RegisterTh>Policy no.</RegisterTh>
              <RegisterTh>Insurer</RegisterTh>
              <RegisterTh align="right">Premium</RegisterTh>
              <RegisterTh>Period</RegisterTh>
              <RegisterTh>Status</RegisterTh>
              <RegisterTh>Documents</RegisterTh>
              <RegisterTh align="right">Notes</RegisterTh>
              <RegisterTh align="right">Members</RegisterTh>
              <RegisterTh last align="right">Net</RegisterTh>
            </RegisterHead>
            <tbody>
              {sorted.map(p => {
                const quotes = quotesFor(p)
                const expanded = !!open[p.id]
                const premium = p.bound_premium ?? p.billed ?? p.premium
                const period = p.start_date || p.end_date ? `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}` : '—'
                const line = p.label ?? p.class_of_insurance ?? (p.product_line ? productLineLabel(p.product_line) : 'Policy')
                // Class and product line sit behind the Line cell's title; the policy number has its own column.
                const under = [line, p.class_of_insurance && p.class_of_insurance !== line ? p.class_of_insurance : null, p.product_line ? productLineLabel(p.product_line) : null].filter(Boolean).join(' · ')
                const canClose = !['closed', 'declined', 'lapsed'].includes(p.lifecycle)
                const dns = (payments ?? []).filter(d => d.policy_id === p.id || (!!p.policy_number && d.policyNumber === p.policy_number))
                const sec: Section = section[p.id] ?? (quotes.length === 0 && p.is_eb ? 'employees' : quotes.length === 0 && dns.length ? 'dns' : 'quotes')
                const sections: { key: Section; label: string }[] = [
                  { key: 'quotes', label: `Quotes · ${quotes.length}` },
                  ...(p.is_eb ? [{ key: 'employees' as const, label: `Employees${p.membersActive != null ? ` · ${p.membersActive}` : ''}` }] : []),
                  { key: 'dns', label: `Debit notes & payments · ${dns.length}` },
                ]
                return (
                  <PolicyRows key={p.id} expanded={expanded} onToggle={() => setOpen(o => ({ ...o, [p.id]: !o[p.id] }))}
                    row={
                      <>
                        <RegisterCell first primary={line} title={under} />
                        <RegisterCell title={p.policy_number ?? undefined}><span className="block max-w-[160px] truncate text-[13.5px] tabular-nums">{p.policy_number ?? '—'}</span></RegisterCell>
                        <RegisterCell title={p.insurer ?? undefined}><span className="block max-w-[170px] truncate text-[13.5px]">{p.insurer ?? '—'}</span></RegisterCell>
                        <RegisterCell align="right" primary={premium != null ? fmtAmount(premium, p.currency ?? 'SGD') : '—'} title={p.bound_premium == null && p.billed != null ? 'Billed to date; no bound premium on file' : undefined} />
                        <RegisterCell primary={period} />
                        <RegisterCell primary={lifecycleWord(p.lifecycle)} />
                        <RegisterCell primary={docStatus?.[p.id] ? statusWord(docStatus[p.id]) : '—'}
                          title={docStatus?.[p.id]?.missing.length ? `Missing: ${docStatus[p.id].missing.map(m => m.label).join(', ')}` : undefined} />
                        <RegisterCell align="right" primary={p.debitNoteCount} />
                        <RegisterCell align="right" primary={p.is_eb && p.membersActive != null ? p.membersActive : '—'} />
                        <RegisterCell last align="right" primary={p.is_eb && p.netToDate != null ? fmtAmount(p.netToDate, p.currency ?? 'SGD') : '—'} />
                      </>
                    }
                    detail={
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-h-6">
                          <span className="flex items-center gap-1" role="tablist">
                            {sections.map(x => (
                              <button key={x.key} type="button" role="tab" aria-selected={sec === x.key}
                                onClick={e => { e.stopPropagation(); setSection(o => ({ ...o, [p.id]: x.key })) }}
                                className="h-6 px-2 rounded-[6px] border-0 cursor-pointer text-[12.5px]"
                                style={{ background: sec === x.key ? '#e6e8e4' : 'transparent', color: sec === x.key ? INK : MUTED, fontWeight: sec === x.key ? 500 : 400 }}>
                                {x.label}
                              </button>
                            ))}
                          </span>
                          <span className="ml-auto flex items-center gap-1.5 flex-wrap">
                            {p.lifecycle === 'bound' && <Btn size="xs" level="secondary" className={ROW_BTN} disabled={busy === p.id} onClick={e => { e.stopPropagation(); setLiveFor(p) }}>Mark live</Btn>}
                            {canClose && p.lifecycle !== 'bound' && p.lifecycle !== 'live' && p.lifecycle !== 'renewal_due' && (
                              <Btn size="xs" level="tertiary" className={ROW_BTN} disabled={busy === p.id} onClick={e => { e.stopPropagation(); void setLifecycle(p, 'declined') }}>Declined</Btn>
                            )}
                            {canClose && <Btn size="xs" level="tertiary" className={ROW_BTN} disabled={busy === p.id} onClick={e => { e.stopPropagation(); void setLifecycle(p, 'closed') }}>Close</Btn>}
                          </span>
                        </div>
                        {errors[p.id] && <p className="text-[12.5px] m-0" style={{ color: ERROR }}>{errors[p.id]}</p>}
                        {sec === 'employees' && <MembersPanel policies={[p]} bundle={bundle} onChanged={onChanged} onOpenDrafts={onOpenDrafts ?? (() => {})} />}
                        {sec === 'dns' && <PolicyDebitNotes notes={dns} />}
                        {sec === 'quotes' && quotes.length === 0 && <span className="text-[12.5px]" style={{ color: MUTED }}>No quotes on file for this policy.</span>}
                        {sec === 'quotes' && quotes.length > 0 && (
                          <Register label={`${line} quotes`} minWidth={960} dense>
                            <RegisterHead>
                              <RegisterTh first>Insurer</RegisterTh>
                              <RegisterTh>Plan</RegisterTh>
                              <RegisterTh align="right">Round</RegisterTh>
                              <RegisterTh align="right">Premium</RegisterTh>
                              <RegisterTh>Limit</RegisterTh>
                              <RegisterTh>Valid until</RegisterTh>
                              <RegisterTh>Source</RegisterTh>
                              <RegisterTh>Thread</RegisterTh>
                              <RegisterTh last />
                            </RegisterHead>
                            <tbody>
                              {quotes.map(q => {
                                const chosen = q.id === p.chosen_quote_id || q.status === 'selected'
                                return (
                                  <RegisterRow key={q.id}>
                                    <RegisterCell first primary={q.insurer_name} title={q.insurer_name} />
                                    <RegisterCell title={q.plan_label ?? undefined}><span className="text-[13px]" style={{ color: MUTED }}>{q.plan_label ? clip(q.plan_label, PLAN_MAX) : '—'}</span></RegisterCell>
                                    <RegisterCell align="right" primary={rounds.get(q.round_id)?.round_no ?? '—'} />
                                    <RegisterCell align="right" primary={`${q.premium_amount != null ? fmtAmount(q.premium_amount, q.currency ?? 'SGD') : (q.premium_text ?? '—')}${q.needs_review ? ' · check' : ''}`} />
                                    <RegisterCell primary={q.limit_text ?? '—'} />
                                    <RegisterCell primary={q.valid_until ? fmtDate(q.valid_until) : '—'} />
                                    <RegisterCell primary={q.source === 'rate_table' ? 'Rate table' : 'Insurer'} />
                                    <RegisterCell>
                                      {q.thread_id
                                        ? <Link href={threadHref(q.thread_id) ?? '#'} onClick={e => e.stopPropagation()} className="text-[13px] no-underline hover:underline" style={{ color: INK }}>Thread</Link>
                                        : <span className="text-[13px]" style={{ color: MUTED }}>—</span>}
                                    </RegisterCell>
                                    <RegisterCell last align="right">
                                      {chosen
                                        ? <span className="text-[13px]" style={{ color: INK }}>Chosen</span>
                                        : <Btn size="xs" level="tertiary" className={ROW_BTN} disabled={busy !== null || q.status === 'not_chosen'} loading={busy === q.id} onClick={e => { e.stopPropagation(); void choose(p, q.id) }}>Choose</Btn>}
                                    </RegisterCell>
                                  </RegisterRow>
                                )
                              })}
                            </tbody>
                          </Register>
                        )}
                      </div>
                    }
                  />
                )
              })}
            </tbody>
          </Register>
        )}
      </SectionCard>

      <MarkLiveDialog policy={liveFor} onClose={() => setLiveFor(null)} onDone={onChanged} />
    </>
  )
}

/** The debit notes billed under one policy, newest first. */
function PolicyDebitNotes({ notes }: { notes: PaymentDerived[] }) {
  if (notes.length === 0) return <span className="text-[12.5px]" style={{ color: MUTED }}>No debit notes on this policy yet. Raise one from Debit Notes.</span>
  const sorted = [...notes].sort((a, b) => b.issue_date.localeCompare(a.issue_date))
  return (
    <XlGrid label="Debit notes" minWidth={860}>
      <XlHead>
        <XlHeadRow>
          <XlTh sticky align="left" width={120}>DN no.</XlTh>
          <XlTh>Issued</XlTh><XlTh>For</XlTh><XlTh>Insurer</XlTh><XlTh>Amount</XlTh><XlTh>Paid</XlTh><XlTh>Outstanding</XlTh><XlTh>Due</XlTh><XlTh>Status</XlTh><XlTh>Drive</XlTh>
        </XlHeadRow>
      </XlHead>
      <tbody>
        {sorted.map(d => (
          <XlRow key={d.id}>
            <XlCell label align="left" strong>{d.debit_note_no}</XlCell>
            <XlCell>{fmtDate(d.issue_date)}</XlCell>
            <XlCell>{d.event_type ? d.event_type.replace(/_/g, ' ') : ''}</XlCell>
            <XlCell>{d.insurer ?? ''}</XlCell>
            <XlCell>{fmtAmount(d.gross_amount, d.currency)}</XlCell>
            <XlCell>{d.paid_amount ? fmtAmount(d.paid_amount, d.currency) : ''}</XlCell>
            <XlCell>{d.outstanding > 0 ? fmtAmount(d.outstanding, d.currency) : ''}</XlCell>
            <XlCell>{d.payment_due_date ? fmtDate(d.payment_due_date) : ''}</XlCell>
            <XlCell fill={d.derived === 'paid' ? 'good' : d.derived === 'overdue' ? 'bad' : d.derived === 'partial' ? 'warn' : null}>{PAY_WORD[d.derived]}</XlCell>
            <XlCell>{d.drive_folder_url ? <a href={d.drive_folder_url} target="_blank" rel="noreferrer" className="no-underline hover:underline" style={{ color: INK }}>Filed ↗</a> : ''}</XlCell>
          </XlRow>
        ))}
      </tbody>
    </XlGrid>
  )
}

/** A policy row and, when opened, one full-width detail row beneath it. */
function PolicyRows({ row, detail, expanded, onToggle }: { row: React.ReactNode; detail: React.ReactNode; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <RegisterRow onClick={onToggle} selected={expanded}>{row}</RegisterRow>
      {expanded && (
        <tr style={{ borderBottom: '1px solid #e6e8e4', background: '#fafafa' }}>
          <td colSpan={COLS} className="px-[10px] py-2">{detail}</td>
        </tr>
      )}
    </>
  )
}

/** Policy number and period, then the policy is live. */
function MarkLiveDialog({ policy, onClose, onDone }: { policy: PolicyView | null; onClose: () => void; onDone: () => void }) {
  const [number, setNumber] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The fields follow the policy that opened the dialog.
  useEffect(() => {
    if (!policy) return
    setNumber(policy.policy_number ?? ''); setStart(policy.start_date?.slice(0, 10) ?? ''); setEnd(policy.end_date?.slice(0, 10) ?? ''); setError(null); setBusy(false)
  }, [policy])

  async function save() {
    if (!policy) return
    if (!number.trim() || !start || !end) { setError('Policy number, start and end are required.'); return }
    setBusy(true); setError(null)
    try {
      await callApi(`/api/policies/${policy.id}`, { method: 'PATCH', body: { lifecycle: 'live', policy_number: number.trim(), start_date: start, end_date: end } })
      onDone()
      onClose()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <Dialog open={!!policy} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className={dialogCls}>
        <DialogHeader>
          <DialogTitle>Mark live</DialogTitle>
          <DialogDescription>{policy ? `${policy.label ?? policy.class_of_insurance ?? 'Policy'}${policy.insurer ? ` · ${policy.insurer}` : ''}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label="Policy number"><input className={inputCls} value={number} onChange={e => setNumber(e.target.value)} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Start"><input className={inputCls} type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
            <Field label="End"><input className={inputCls} type="date" value={end} onChange={e => setEnd(e.target.value)} /></Field>
          </div>
          {error && <p className="text-[13px] m-0" style={{ color: ERROR }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Btn level="tertiary" onClick={onClose} disabled={busy}>Cancel</Btn>
            <Btn level="primary" className="h-10 px-4" onClick={save} loading={busy}>Mark live</Btn>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
