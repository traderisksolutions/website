'use client'

/**
 * What the proposal page and the email page share: the quotation as the API returns it, its
 * checks, and the PDF preview. No model is called.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ProposalCheck, ProposalModel } from '@/lib/gb/eb-proposal'

export type QuotationView = {
  quotation: { id: string; company_id: string | null; company_name: string; thread_id: string | null; version: number; draft_id: string | null; sent_at: string | null; sent_to: string | null; created_at: string; products: string[] }
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
        <li key={`${c.label}|${c.text}`} className="grid grid-cols-1 sm:grid-cols-[170px_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13.5px]">
          <span className={`inline-flex items-center gap-2 ${c.kind === 'warn' ? 'text-trs-warn' : 'text-trs-pos'}`}><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />{c.label}</span>
          <span className="text-trs-ink">{c.text}</span>
        </li>
      ))}
    </ul>
  )
}

export function PdfPreview({ id, height = 900, stamp }: { id: string; height?: number; stamp?: string }) {
  return (
    <div className="rounded-[10px] overflow-hidden min-w-0" style={{ background: '#efebe7' }}>
      <iframe title="Proposal preview" src={`/api/eb/quotations/${id}/pdf${stamp ? `?v=${stamp}` : ''}#view=FitH`} className="block w-full border-0" style={{ height }} />
    </div>
  )
}

export const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' }) : '—')
