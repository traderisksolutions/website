'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SectionCard, Empty, Spinner, Btn, Field, inputCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtDate } from '@/lib/crm/format'
import { productLineLabel } from '@/lib/product-lines'
import { threadHref } from '@/lib/placement/position'
import type { PlacementBundle, PlacementRound } from '@/lib/placement/types'
import { callApi, errText, dialogCls, INK, MUTED, ERROR } from '@/components/placement/shared'
import { fmtAmount, lifecycleWord, type PolicyView, type SpineQuote } from './types'

const COLS = 8

/**
 * The company's policies: one row per line of cover, from first quote to lapse. A row opens to
 * the quotes received for it; the chosen one is marked in words.
 */
export function PoliciesRegister({ policies, bundle, onChanged }: {
  policies: PolicyView[] | null
  bundle: PlacementBundle | null
  onChanged: () => void
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
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
      <SectionCard title="Policies">
        {!policies && <Spinner label="Loading policies…" />}
        {policies && policies.length === 0 && <Empty compact>No policies on file.</Empty>}
        {policies && policies.length > 0 && (
          <Register label="Policies" minWidth={1100}>
            <RegisterHead>
              <RegisterTh first>Line</RegisterTh>
              <RegisterTh>Insurer</RegisterTh>
              <RegisterTh align="right">Premium</RegisterTh>
              <RegisterTh>Period</RegisterTh>
              <RegisterTh>Status</RegisterTh>
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
                const under = [p.class_of_insurance && p.class_of_insurance !== line ? p.class_of_insurance : null, p.product_line ? productLineLabel(p.product_line) : null, p.policy_number].filter(Boolean).join(' · ')
                const canClose = !['closed', 'declined', 'lapsed'].includes(p.lifecycle)
                return (
                  <PolicyRows key={p.id} expanded={expanded} onToggle={() => setOpen(o => ({ ...o, [p.id]: !o[p.id] }))}
                    row={
                      <>
                        <RegisterCell first identityWidth={280} primary={line} secondary={under || undefined} />
                        <RegisterCell primary={p.insurer ?? '—'} />
                        <RegisterCell align="right" primary={premium != null ? fmtAmount(premium, p.currency ?? 'SGD') : '—'} secondary={p.bound_premium == null && p.billed != null ? 'billed' : undefined} />
                        <RegisterCell primary={period} />
                        <RegisterCell primary={lifecycleWord(p.lifecycle)} />
                        <RegisterCell align="right" primary={p.debitNoteCount} />
                        <RegisterCell align="right" primary={p.is_eb && p.membersActive != null ? p.membersActive : '—'} />
                        <RegisterCell last align="right" primary={p.is_eb && p.netToDate != null ? fmtAmount(p.netToDate, p.currency ?? 'SGD') : '—'} />
                      </>
                    }
                    detail={
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px]" style={{ color: MUTED }}>{quotes.length === 0 ? 'No quotes yet' : `${quotes.length} quote${quotes.length === 1 ? '' : 's'}`}</span>
                          <span className="ml-auto flex items-center gap-1.5 flex-wrap">
                            {p.lifecycle === 'bound' && <Btn size="xs" level="secondary" disabled={busy === p.id} onClick={e => { e.stopPropagation(); setLiveFor(p) }}>Mark live</Btn>}
                            {canClose && p.lifecycle !== 'bound' && p.lifecycle !== 'live' && p.lifecycle !== 'renewal_due' && (
                              <Btn size="xs" level="tertiary" disabled={busy === p.id} onClick={e => { e.stopPropagation(); void setLifecycle(p, 'declined') }}>Declined</Btn>
                            )}
                            {canClose && <Btn size="xs" level="tertiary" disabled={busy === p.id} onClick={e => { e.stopPropagation(); void setLifecycle(p, 'closed') }}>Close</Btn>}
                          </span>
                        </div>
                        {errors[p.id] && <p className="text-[13px] m-0" style={{ color: ERROR }}>{errors[p.id]}</p>}
                        {quotes.length > 0 && (
                          <Register label={`${line} quotes`} minWidth={880}>
                            <RegisterHead>
                              <RegisterTh first>Insurer</RegisterTh>
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
                                    <RegisterCell first identityWidth={220} primary={q.insurer_name} secondary={q.plan_label ?? undefined} />
                                    <RegisterCell align="right" primary={rounds.get(q.round_id)?.round_no ?? '—'} />
                                    <RegisterCell align="right" primary={q.premium_amount != null ? fmtAmount(q.premium_amount, q.currency ?? 'SGD') : (q.premium_text ?? '—')} secondary={q.needs_review ? 'check' : undefined} />
                                    <RegisterCell primary={q.limit_text ?? '—'} />
                                    <RegisterCell primary={q.valid_until ? fmtDate(q.valid_until) : '—'} />
                                    <RegisterCell primary={q.source === 'rate_table' ? 'Rate table' : 'Insurer'} />
                                    <RegisterCell>
                                      {q.thread_id
                                        ? <Link href={threadHref(q.thread_id) ?? '#'} onClick={e => e.stopPropagation()} className="text-[14px] no-underline hover:underline" style={{ color: INK }}>Thread</Link>
                                        : <span className="text-[14px]" style={{ color: MUTED }}>—</span>}
                                    </RegisterCell>
                                    <RegisterCell last align="right">
                                      {chosen
                                        ? <span className="text-[14px]" style={{ color: INK }}>Chosen</span>
                                        : <Btn size="xs" level="tertiary" disabled={busy !== null || q.status === 'not_chosen'} loading={busy === q.id} onClick={e => { e.stopPropagation(); void choose(p, q.id) }}>Choose</Btn>}
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

/** A policy row and, when opened, one full-width detail row beneath it. */
function PolicyRows({ row, detail, expanded, onToggle }: { row: React.ReactNode; detail: React.ReactNode; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <RegisterRow onClick={onToggle} selected={expanded}>{row}</RegisterRow>
      {expanded && (
        <tr style={{ borderBottom: '1px solid #e8eaed', background: '#fafafa' }}>
          <td colSpan={COLS} className="px-6 py-4">{detail}</td>
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
