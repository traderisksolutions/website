'use client'

/**
 * What the proposal page and the email page share: the quotation as the API returns it, its
 * checks, and the PDF preview. No model is called.
 */
import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/crm/primitives'
import type { ProposalCheck, ProposalModel } from '@/lib/gb/eb-proposal'

export type QuotationView = {
  quotation: { id: string; company_id: string | null; company_name: string; thread_id: string | null; version: number; draft_id: string | null; sent_at: string | null; sent_to: string | null; created_at: string; products: string[]; draft_sent: boolean }
  model: ProposalModel
  checks: ProposalCheck[]
}

export function useQuotation(id: string) {
  const [view, setView] = useState<QuotationView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/eb/quotations/${id}`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? `The quotation could not be read (${res.status}).`); return }
      setView(d as QuotationView)
    } catch (e) { setError(e instanceof Error ? e.message : 'The quotation could not be read.') }
  }, [id])
  useEffect(() => { void load() }, [load])
  return { view, error, reload: load }
}

export function Checks({ checks, extra = [] }: { checks: ProposalCheck[]; extra?: ProposalCheck[] }) {
  const all = [...checks, ...extra]
  if (!all.length) return null
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-1.5" aria-label="Checks">
      {all.map(c => (
        <li key={`${c.label}|${c.text}`} className="grid grid-cols-1 sm:grid-cols-[170px_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-body">
          <span className={`inline-flex items-center gap-2 ${c.kind === 'warn' ? 'text-trs-warn' : 'text-trs-ink'}`}><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-trs-subtle" />{c.label}</span>
          <span className="text-trs-ink">{c.text}</span>
        </li>
      ))}
    </ul>
  )
}

export function PdfPreview({ id, height = 900, stamp }: { id: string; height?: number; stamp?: string }) {
  return (
    <div className="rounded overflow-hidden min-w-0 bg-trs-canvas">
      <iframe title="Proposal preview" src={`/api/eb/quotations/${id}/pdf${stamp ? `?v=${stamp}` : ''}#view=FitH`} className="block w-full border-0" style={{ height }} /* drift-ok: preview height from the caller */ />
    </div>
  )
}

export const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' }) : '—')

/** The email went but the proposal was not recorded as sent: say so, and record it on Try again. */
export function MarkSent({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function retry() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/eb/quotations/${id}/sent`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? `Not marked sent (${res.status}).`); return }
      onDone()
    } catch (e) { setError(e instanceof Error ? e.message : 'Not marked sent.') } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-wrap items-center gap-3" role="alert">
      <span className="text-body text-trs-neg">Sent, but not marked sent.{error ? ` ${error}` : ''}</span>
      <Btn size="xs" loading={busy} disabled={busy} onClick={() => void retry()}>Try again</Btn>
    </div>
  )
}
