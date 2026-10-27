'use client'

import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Btn, Field, inputCls } from '@/components/crm/primitives'
import { fmtDate } from '@/lib/crm/format'
import { productLineLabel } from '@/lib/product-lines'
import type { CompanyThread } from '@/lib/crm/types'
import { threadTitle } from '@/lib/crm/subject'
import type { Placement, PlacementLine, Spec } from '@/lib/placement/types'
import { callApi, errText, dialogCls, selectCls, ProductLineSelect, SpecFields, INK, MUTED, ERROR } from './shared'
import { ContactPicker } from './ContactPicker'

type Row = { key: number; product_line: string; label: string; spec: Spec }
type Proposal = { title: string; inception_date: string | null; lines: { product_line: string; label: string; spec: Spec }[]; client_asks: string[] }

let seq = 1
const blankRow = (): Row => ({ key: seq++, product_line: '', label: '', spec: {} })
/** Employment benefits lines: the employee list and the rate engine live on the Members tab. */
const EB_LINES = new Set(['employee_benefits', 'group_health'])

/**
 * A placement: the client's ask, one row per policy to be priced. "Read from thread" fills the
 * rows from the client's email; the broker checks and corrects before anything goes out.
 */
export function NewPlacementDialog({ open, onClose, companyId, companyName, threads, onDone }: {
  open: boolean
  onClose: () => void
  companyId: string
  companyName: string
  threads: CompanyThread[]
  onDone: () => void
}) {
  const [threadId, setThreadId] = useState('')
  const [title, setTitle] = useState('')
  const [inception, setInception] = useState('')
  const [rows, setRows] = useState<Row[]>([blankRow()])
  const [dispatch, setDispatch] = useState(true)
  /** The broker's pick of insurer contacts per line row; absent until that row's list has loaded. */
  const [picks, setPicks] = useState<Record<number, Set<string>>>({})
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asks, setAsks] = useState<string[]>([])
  const [created, setCreated] = useState<{ unrouted: string[] } | null>(null)

  useEffect(() => {
    if (!open) return
    setThreadId(''); setTitle(''); setInception(''); setRows([blankRow()]); setDispatch(true); setPicks({})
    setReading(false); setBusy(false); setError(null); setAsks([]); setCreated(null)
  }, [open])

  const sortedThreads = [...threads].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))

  function setRow(key: number, patch: Partial<Row>) {
    setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r))
    // A different product line has a different contact list: the pick starts over.
    if (patch.product_line !== undefined) setPicks(ps => { const n = { ...ps }; delete n[key]; return n })
  }
  const setPick = (key: number, next: Set<string>) => setPicks(ps => ({ ...ps, [key]: next }))

  async function readThread() {
    if (!threadId) return
    setReading(true); setError(null)
    try {
      const d = await callApi<{ proposal: Proposal | null }>('/api/placements/propose', { method: 'POST', body: { thread_id: threadId } })
      if (!d.proposal || d.proposal.lines.length === 0) { setError('Nothing to quote was read from that thread.'); return }
      setRows(d.proposal.lines.map(l => ({ key: seq++, product_line: l.product_line, label: l.label || productLineLabel(l.product_line), spec: l.spec ?? {} })))
      if (d.proposal.title) setTitle(d.proposal.title)
      if (d.proposal.inception_date) setInception(d.proposal.inception_date)
      setAsks(d.proposal.client_asks ?? [])
    } catch (e) {
      setError(errText(e))
    } finally {
      setReading(false)
    }
  }

  const validRows = rows.filter(r => r.product_line)
  const picksPending = dispatch && validRows.some(r => !picks[r.key])

  async function create() {
    if (validRows.length === 0) { setError('Add at least one line.'); return }
    setBusy(true); setError(null)
    try {
      const d = await callApi<{ placement: Placement; lines: PlacementLine[]; dispatched: unknown; unrouted?: string[] }>('/api/placements', {
        method: 'POST',
        body: {
          company_id: companyId,
          title: title.trim() || undefined,
          client_thread_id: threadId || undefined,
          inception_date: inception || undefined,
          lines: validRows.map(r => ({
            product_line: r.product_line, label: r.label.trim() || undefined, spec: r.spec,
            contact_ids: dispatch ? [...(picks[r.key] ?? [])] : undefined,
          })),
          dispatch,
        },
      })
      onDone()
      const unrouted = Array.isArray(d.unrouted) ? d.unrouted : []
      if (unrouted.length > 0) { setCreated({ unrouted }); setBusy(false); return }
      onClose()
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className={dialogCls}>
        <DialogHeader>
          <DialogTitle>New placement</DialogTitle>
          <DialogDescription>{companyName}</DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[14px]" style={{ color: INK }}>Placement created.</p>
            <p className="m-0 text-[14px]" style={{ color: INK }}>No insurer contact on file for: {created.unrouted.join(', ')}.</p>
            <div className="flex justify-end pt-2">
              <Btn level="primary" className="h-10 px-4" onClick={onClose}>Done</Btn>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <Field label="Client thread">
                <select className={selectCls} value={threadId} onChange={e => setThreadId(e.target.value)}>
                  <option value="">None</option>
                  {sortedThreads.map(t => (
                    <option key={t.id} value={t.id}>{threadTitle(t).slice(0, 80)} · {fmtDate(t.last_message_at)}</option>
                  ))}
                </select>
              </Field>
              <Btn level="secondary" className="h-10" disabled={!threadId || reading} loading={reading} onClick={readThread}>
                {reading ? 'Reading the thread…' : 'Read from thread'}
              </Btn>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Title">
                <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder={`Quotes for ${companyName}`} />
              </Field>
              <Field label="Inception date">
                <input className={inputCls} type="date" value={inception} onChange={e => setInception(e.target.value)} />
              </Field>
            </div>

            {asks.length > 0 && (
              <div className="text-[13px]" style={{ color: MUTED }}>
                <span className="block mb-1" style={{ color: INK }}>Client asks</span>
                <ul className="m-0 pl-4">{asks.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium" style={{ color: INK }}>Lines</span>
                <Btn level="tertiary" size="xs" onClick={() => setRows(rs => [...rs, blankRow()])}><Plus size={12} /> Add line</Btn>
              </div>
              {rows.map((r, i) => (
                <div key={r.key} className="rounded-[12px] p-3 flex flex-col gap-2.5" style={{ border: '1px solid #e8eaed' }}>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2.5 items-end">
                    <Field label={`Line ${i + 1}`}>
                      <ProductLineSelect value={r.product_line} onChange={slug => setRow(r.key, { product_line: slug, label: r.label || (slug ? productLineLabel(slug) : '') })} />
                    </Field>
                    <Field label="Label">
                      <input className={inputCls} value={r.label} onChange={e => setRow(r.key, { label: e.target.value })} />
                    </Field>
                    <Btn level="tertiary" size="xs" className="h-10 sm:mb-0" aria-label="Remove line" disabled={rows.length === 1} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}>
                      <X size={12} /> Remove
                    </Btn>
                  </div>
                  <SpecFields compact value={r.spec} onChange={spec => setRow(r.key, { spec })} />
                  {EB_LINES.has(r.product_line) && <p className="m-0 text-[13px]" style={{ color: MUTED }}>Employee list and pricing follow on the Members tab</p>}
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 text-[14px] cursor-pointer" style={{ color: INK }}>
              <input type="checkbox" checked={dispatch} onChange={e => setDispatch(e.target.checked)} />
              Prepare the insurer emails now
            </label>

            {dispatch && validRows.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="text-[14px] font-medium" style={{ color: INK }}>Insurers to ask</span>
                {validRows.map(r => (
                  <div key={r.key} className="flex flex-col gap-2">
                    <span className="text-[12.5px]" style={{ color: MUTED }}>Line {rows.indexOf(r) + 1} · {r.label.trim() || productLineLabel(r.product_line)}</span>
                    <ContactPicker productLines={[r.product_line]} value={picks[r.key] ?? null} onChange={next => setPick(r.key, next)} />
                  </div>
                ))}
              </div>
            )}

            {error && <p className="text-[13px] m-0" style={{ color: ERROR }}>{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Btn level="tertiary" onClick={onClose} disabled={busy}>Cancel</Btn>
              <Btn level="primary" className="h-10 px-4" onClick={create} loading={busy} disabled={validRows.length === 0 || reading || picksPending}>Create</Btn>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
