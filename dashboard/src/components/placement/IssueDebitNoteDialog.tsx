'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Btn, Field, inputCls } from '@/components/crm/primitives'
import { optionLabel } from '@/lib/placement/compare'
import type { LinePosition, Placement, PlacementQuote } from '@/lib/placement/types'
import type { PolicyView } from '@/components/policies/types'
import { callApi, dialogCls, errText, ERROR, INK, MUTED } from './shared'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
/** A year's cover: 1 Dec 2026 → 30 Nov 2027. */
const yearEnd = (start: string) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + 1); d.setUTCDate(d.getUTCDate() - 1); return iso(d) }

/** The quote the line is bound to: the policy's choice, else the client's pick, else the one marked selected. */
export function boundQuote(pos: LinePosition, policy: PolicyView | null): PlacementQuote | null {
  const all = [...pos.dispatches.flatMap(d => d.quotes), ...pos.engineQuotes]
  return all.find(q => q.id === policy?.chosen_quote_id) ?? all.find(q => q.id === pos.line.picked_quote_id) ?? all.find(q => q.status === 'selected') ?? null
}

type Issued = { debitNoteNo: string; downloadUrl: string | null; driveFolderUrl: string | null }

/**
 * The debit note for a bound line, prefilled from the chosen quote and the policy: insurer,
 * premium, period from inception, description naming the insurer and plan. Issuing it renders
 * the PDF, files it in the company's Drive folder and, once filed, marks the line done.
 */
export function IssueDebitNoteDialog({ target, onClose, onDone }: {
  target: { pos: LinePosition; placement: Placement; policy: PolicyView | null } | null
  onClose: () => void
  onDone: () => void
}) {
  const [number, setNumber] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [description, setDescription] = useState('')
  const [premium, setPremium] = useState('')
  const [gst, setGst] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)

  const quote = target ? boundQuote(target.pos, target.policy) : null
  const product = target && quote?.dispatch_id ? target.pos.dispatches.find(d => d.dispatch.id === quote.dispatch_id)?.dispatch.insurer_product_name ?? null : null

  // The fields follow the line that opened the dialog.
  useEffect(() => {
    if (!target) return
    const { pos, placement, policy } = target
    const q = boundQuote(pos, policy)
    const today = iso(new Date())
    const s = policy?.start_date?.slice(0, 10) || placement.inception_date || today
    const label = pos.line.label ?? pos.line.product_line
    const prod = q?.dispatch_id ? pos.dispatches.find(d => d.dispatch.id === q.dispatch_id)?.dispatch.insurer_product_name : q?.plan_label
    setNumber(policy?.policy_number ?? '')
    setStart(s); setEnd(policy?.end_date?.slice(0, 10) || yearEnd(s))
    setDescription(q ? `${label} premium — ${q.insurer_name}${prod ? ` · ${prod}` : ''} (${optionLabel(pos, q)})` : `${label} premium`)
    setPremium(q?.premium_amount != null ? String(q.premium_amount) : '')
    setGst(''); setIssueDate(today); setDueDate(addDays(today, 30))
    setError(null); setBusy(false); setIssued(null)
  }, [target])

  async function issue() {
    if (!target) return
    const { pos, placement, policy } = target
    const amount = Number(premium.replace(/[^0-9.]/g, ''))
    if (!amount) { setError('Enter the premium.'); return }
    if (!start || !end) { setError('Enter the period of cover.'); return }
    setBusy(true); setError(null)
    try {
      if (policy) {
        // The number and term go on the policy first, so the note carries them.
        await callApi(`/api/policies/${policy.id}`, { method: 'PATCH', body: number.trim()
          ? { lifecycle: 'live', policy_number: number.trim(), start_date: start, end_date: end, insurer: quote?.insurer_name }
          : { start_date: start, end_date: end } })
      }
      const r = await callApi<Issued>('/api/debit-notes', { method: 'POST', body: {
        company: { companyId: placement.company_id },
        contact: placement.client_contact_id ? { contactId: placement.client_contact_id } : null,
        policy: policy ? { policyId: policy.id } : {
          insurer: quote?.insurer_name ?? 'Unknown insurer', policyNumber: number.trim() || null, classOfInsurance: pos.line.label ?? pos.line.product_line,
          productType: pos.line.product_line, startDate: start, endDate: end, premium: amount, currency: quote?.currency ?? 'SGD',
        },
        debitNote: {
          currency: quote?.currency ?? 'SGD', lineItems: [{ description: description.trim() || 'Premium', amount }],
          gstAmount: gst.trim() ? Number(gst.replace(/[^0-9.]/g, '')) : null, issueDate, paymentDueDate: dueDate || null,
          insurer: quote?.insurer_name ?? null, eventType: 'new_business', source: 'manual', origin: 'new',
        },
      } })
      setIssued(r)
      onDone()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  const title = target ? `${target.pos.line.label ?? target.pos.line.product_line} · ${target.placement.ref}` : ''
  return (
    <Dialog open={!!target} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className={dialogCls}>
        <DialogHeader>
          <DialogTitle>Issue debit note</DialogTitle>
          <DialogDescription>{title}{quote ? ` · ${quote.insurer_name}${product ? ` · ${product}` : ''}` : ''}</DialogDescription>
        </DialogHeader>
        {issued ? (
          <div className="flex flex-col gap-3 text-[14px]" style={{ color: INK }}>
            <p className="m-0">{issued.debitNoteNo} issued{issued.driveFolderUrl ? ' and filed in Drive. The line is done.' : '. It is not in Drive yet, so the line stays open until it is filed.'}</p>
            <div className="flex gap-3">
              {issued.downloadUrl && <a href={issued.downloadUrl} target="_blank" rel="noreferrer" style={{ color: INK }}>Open PDF ↗</a>}
              {issued.driveFolderUrl && <a href={issued.driveFolderUrl} target="_blank" rel="noreferrer" style={{ color: INK }}>Drive folder ↗</a>}
            </div>
            <div className="flex justify-end"><Btn level="primary" onClick={onClose}>Done</Btn></div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {!quote && <p className="m-0 text-[13px]" style={{ color: MUTED }}>No chosen quote on this line; fill the figures in by hand.</p>}
            {!target?.policy && <p className="m-0 text-[13px]" style={{ color: MUTED }}>This line has no policy record; one is created with the note, and the line is closed by hand.</p>}
            <Field label="Policy number (from the insurer)"><input className={inputCls} value={number} onChange={e => setNumber(e.target.value)} placeholder="Leave blank if not issued yet" /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Cover from"><input className={inputCls} type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
              <Field label="Cover to"><input className={inputCls} type="date" value={end} onChange={e => setEnd(e.target.value)} /></Field>
            </div>
            <Field label="Description on the note"><input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={`Premium (${quote?.currency ?? 'SGD'})`}><input className={inputCls} inputMode="decimal" value={premium} onChange={e => setPremium(e.target.value)} /></Field>
              <Field label="GST, if the insurer charges it"><input className={inputCls} inputMode="decimal" value={gst} onChange={e => setGst(e.target.value)} placeholder="0.00" /></Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Issue date"><input className={inputCls} type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></Field>
              <Field label="Payment due"><input className={inputCls} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field>
            </div>
            {quote?.premium_text && <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>As quoted: {quote.premium_text}</p>}
            {error && <p className="text-[13px] m-0" style={{ color: ERROR }}>{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Btn level="tertiary" onClick={onClose} disabled={busy}>Cancel</Btn>
              <Btn level="primary" className="h-10 px-4" onClick={issue} loading={busy}>Issue and file in Drive</Btn>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
