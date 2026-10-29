'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Btn, Field, textareaCls } from '@/components/crm/primitives'
import { productLineLabel } from '@/lib/product-lines'
import { describeChanges, specDiff } from '@/lib/placement/spec'
import type { PlacementLine, RoundReason, Spec } from '@/lib/placement/types'
import { callApi, errText, dialogCls, selectCls, SpecFields, INK, MUTED, ERROR } from './shared'
import { ContactPicker } from './ContactPicker'

const REASONS: { value: Exclude<RoundReason, 'initial'>; label: string }[] = [
  { value: 'client_change', label: 'Client change' },
  { value: 'insurer_query', label: 'Insurer query' },
  { value: 'expiry',        label: 'Quote expired' },
  { value: 'broker',        label: 'Broker' },
]

/**
 * A new round on one line: the spec after a change, sent again to the insurers on that line.
 * The "What changes" list is the field-by-field diff; the summary is what the insurers read.
 */
export function NewRoundDialog({ open, onClose, placementId, line, currentSpec, prefill, currentContactIds, companyId, onDone }: {
  open: boolean
  /** The client company: lets the picker rank insurers by its industry, as on the first round. */
  companyId?: string
  onClose: () => void
  placementId: string
  line: PlacementLine
  currentSpec: Spec
  prefill?: { spec: Spec; source_log_id: string }
  /** The insurer contacts asked in the current round; selected first in the picker. */
  currentContactIds?: string[]
  onDone: () => void
}) {
  const [reason, setReason] = useState<Exclude<RoundReason, 'initial'>>('client_change')
  const [spec, setSpec] = useState<Spec>({})
  const [summary, setSummary] = useState('')
  const [summaryTouched, setSummaryTouched] = useState(false)
  const [picks, setPicks] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ unrouted: string[] } | null>(null)

  useEffect(() => {
    if (!open) return
    setReason('client_change')
    setSpec({ ...currentSpec, ...(prefill?.spec ?? {}) })
    setSummary(''); setSummaryTouched(false); setPicks(null)
    setBusy(false); setError(null); setCreated(null)
  }, [open, line.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const changes = useMemo(() => specDiff(currentSpec, spec), [currentSpec, spec])
  const autoSummary = useMemo(() => describeChanges(changes), [changes])
  const summaryText = summaryTouched ? summary : autoSummary

  async function save() {
    setBusy(true); setError(null)
    try {
      const d = await callApi<{ unrouted?: string[] }>(`/api/placements/${placementId}/rounds`, {
        method: 'POST',
        body: {
          line_id: line.id,
          spec,
          reason,
          change_summary: summaryText.trim() || undefined,
          source_log_id: prefill?.source_log_id,
          contact_ids: picks ? [...picks] : undefined,
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
          <DialogTitle>New round</DialogTitle>
          <DialogDescription>{line.label ?? productLineLabel(line.product_line)}</DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[14px]" style={{ color: INK }}>Round opened.</p>
            <p className="m-0 text-[14px]" style={{ color: INK }}>No insurer contact on file for: {created.unrouted.join(', ')}.</p>
            <div className="flex justify-end pt-2">
              <Btn level="primary" className="h-10 px-4" onClick={onClose}>Done</Btn>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Reason">
                <select className={selectCls} value={reason} onChange={e => setReason(e.target.value as Exclude<RoundReason, 'initial'>)}>
                  {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
            </div>

            <SpecFields value={spec} onChange={setSpec} />

            <div>
              <span className="block text-[12.5px] mb-1.5" style={{ color: MUTED }}>What changes</span>
              {changes.length === 0
                ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>No field differs from the current round.</p>
                : (
                  <ul className="m-0 pl-4 text-[14px] flex flex-col gap-1" style={{ color: INK }}>
                    {changes.map(c => (
                      <li key={c.field}>
                        <span style={{ color: MUTED }}>{c.label}: </span>
                        {c.from && c.to ? `${c.from} → ${c.to}` : c.to ? `added ${c.to}` : `removed (was ${c.from})`}
                      </li>
                    ))}
                  </ul>
                )}
            </div>

            <Field label="Change summary">
              <textarea
                className={textareaCls}
                rows={3}
                value={summaryText}
                onChange={e => { setSummaryTouched(true); setSummary(e.target.value) }}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <span className="text-[12.5px]" style={{ color: MUTED }}>Insurers to ask</span>
              <ContactPicker productLines={[line.product_line]} value={picks} onChange={setPicks} preferIds={currentContactIds} companyId={companyId} />
            </div>

            {error && <p className="text-[13px] m-0" style={{ color: ERROR }}>{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Btn level="tertiary" onClick={onClose} disabled={busy}>Cancel</Btn>
              <Btn level="primary" className="h-10 px-4" onClick={save} loading={busy} disabled={picks === null}>Open round and draft emails</Btn>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
