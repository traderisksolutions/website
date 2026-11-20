'use client'

/**
 * Insurers on a kept quotation (docs/eb-v2.md P5): route with why, a broker's override with its
 * reason, where each request stands with the date of the step, a note; then the placement
 * module's quotes for the client. Saved as it is changed.
 */
import { useCallback, useEffect, useState } from 'react'
import { Btn, Chip } from '@/components/crm/primitives'
import { Input } from '@/components/ui/input'
import { Register, RegisterCell, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { SelectBox } from '@/components/ui/select-box'
import { fmtDate } from '@/lib/format'
import { INSURER_STATUSES, STAMP, STATUS_LABEL, type InsurerStatus, type TrackedInsurer } from '@/lib/gb/insurer-track'
import type { PlacementQuote } from '@/lib/gb/insurer-track-store'

const ROUTE_LABEL = { brochure: 'Brochure price', quote: 'Insurer to quote' } as const

export function EbInsurers({ id }: { id: string }) {
  const [rows, setRows] = useState<TrackedInsurer[] | null>(null)
  const [quotes, setQuotes] = useState<PlacementQuote[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [override, setOverride] = useState<{ insurer: string; route: 'brochure' | 'quote'; reason: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/eb/quotations/${id}/insurers`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? `The insurers could not be read (${r.status}).`); return }
      setRows(d.insurers); setQuotes(d.placementQuotes ?? []); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'The insurers could not be read.') }
  }, [id])
  useEffect(() => { void load() }, [load])

  async function save(insurer: string, body: Record<string, unknown>) {
    setBusy(insurer); setError(null)
    try {
      const r = await fetch(`/api/eb/quotations/${id}/insurers`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ insurer, ...body }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? `Not saved (${r.status}).`); return false }
      setRows(cur => cur?.map(x => x.insurer === insurer ? d.insurer : x) ?? cur)
      return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Not saved.'); return false }
    finally { setBusy(null) }
  }

  if (!rows) return error ? <p className="m-0 text-body text-trs-neg" role="alert">{error}</p> : null
  const stamp = (r: TrackedInsurer) => { const col = STAMP[r.status]; return col ? fmtDate(r[col as keyof TrackedInsurer] as string | null) : '–' }

  return (
    <section className="flex flex-col gap-3" aria-label="Insurers">
      <h2 className="m-0 text-heading font-medium">Insurers</h2>
      {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}
      <Register label="Insurers" minWidth={1000}>
        <RegisterHead>
          <RegisterTh first width={220}>Insurer</RegisterTh><RegisterTh width={210}>Route</RegisterTh><RegisterTh width={150}>Status</RegisterTh>
          <RegisterTh width={110}>Since</RegisterTh><RegisterTh last>Note</RegisterTh>
        </RegisterHead>
        <tbody>
          {rows.map(r => (
            <RegisterRow key={r.insurer}>
              <RegisterCell first primary={r.insurer} align="left" secondary={r.route_override ? `Overridden: ${r.override_reason ?? ''}` : r.reasons.join(' · ') || undefined} />
              <RegisterCell>
                <span className="inline-flex items-center gap-2">
                  <Chip tone={r.route === 'brochure' ? 'green' : 'amber'}>{ROUTE_LABEL[r.route]}</Chip>
                  {r.route_override
                    ? <Btn size="xs" level="tertiary" disabled={busy === r.insurer} onClick={() => void save(r.insurer, { route: null })}>Undo</Btn>
                    : <Btn size="xs" level="tertiary" disabled={busy === r.insurer} onClick={() => setOverride({ insurer: r.insurer, route: r.route === 'brochure' ? 'quote' : 'brochure', reason: '' })}>Change</Btn>}
                </span>
              </RegisterCell>
              <RegisterCell>
                <SelectBox label={`Status: ${r.insurer}`} value={r.status} disabled={busy === r.insurer} onChange={v => void save(r.insurer, { status: v as InsurerStatus })}
                  options={INSURER_STATUSES.map(s => ({ value: s, label: STATUS_LABEL[s] }))} />
              </RegisterCell>
              <RegisterCell>{stamp(r)}</RegisterCell>
              <RegisterCell last align="left">
                <Input aria-label={`Note: ${r.insurer}`} defaultValue={r.note ?? ''} disabled={busy === r.insurer}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (r.note ?? '')) void save(r.insurer, { note: v || null }) }} />
              </RegisterCell>
            </RegisterRow>
          ))}
        </tbody>
      </Register>

      {override && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={async e => { e.preventDefault(); if (await save(override.insurer, { route: override.route, override_reason: override.reason })) setOverride(null) }}>
          <label className="flex min-w-[280px] flex-1 flex-col gap-1 text-small text-trs-muted">
            {`${override.insurer}: ${ROUTE_LABEL[override.route]}, because`}
            <Input autoFocus value={override.reason} onChange={e => setOverride({ ...override, reason: e.target.value })} aria-label="Reason for the route" />
          </label>
          <Btn type="button" level="tertiary" onClick={() => setOverride(null)}>Cancel</Btn>
          <Btn type="submit" level="primary" disabled={!override.reason.trim() || busy === override.insurer}>Change route</Btn>
        </form>
      )}

      {quotes.length > 0 && (
        <Register label="Placement quotes" minWidth={860}>
          <RegisterHead>
            <RegisterTh first width={110}>Received</RegisterTh><RegisterTh width={200}>Insurer</RegisterTh><RegisterTh>Plan</RegisterTh>
            <RegisterTh>Premium</RegisterTh><RegisterTh>Valid until</RegisterTh><RegisterTh last>Status</RegisterTh>
          </RegisterHead>
          <tbody>
            {quotes.map(q => (
              <RegisterRow key={q.id}>
                <RegisterCell first primary={fmtDate(q.received)} />
                <RegisterCell align="left">{q.insurer}</RegisterCell>
                <RegisterCell align="left">{q.plan ?? '–'}</RegisterCell>
                <RegisterCell>{q.premium ?? '–'}</RegisterCell>
                <RegisterCell>{fmtDate(q.valid_until)}</RegisterCell>
                <RegisterCell last>{q.status}</RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
    </section>
  )
}
