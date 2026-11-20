'use client'

/**
 * Review one insurer's benefit schedule before it goes live.
 *
 * The scan reads a brochure onto the canonical lines and stops. Nothing here reaches a quotation
 * until somebody accepts it, because a misread limit becomes a premium quoted to a client — and
 * all three tables on file are already quoting, so a scan that wrote straight through would
 * change what clients are told the moment a model finished reading a PDF.
 *
 * Laid out as the brochure prints it: one row per benefit line, one column per plan tier, so a
 * reviewer can hold the brochure beside the screen and read across. Where a value is replacing
 * one already live, the old value sits under the new one — that is the thing being decided.
 */

import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, RefreshCw, Check, X } from 'lucide-react'
import { Btn } from '@/components/crm/primitives'
import { Register } from '@/components/ui/register'

type Candidate = {
  id: string; product_code: string; plan_code: string | null; canon_benefit: string
  benefitName: string; value_text: string; value_numeric: number | null
  source: string | null; current_text: string | null; status: string
}
type Unmatched = { product_code: string | null; plan_code: string | null; label: string; value: string }
type Payload = {
  table: { id: string; insurerName: string | null; planYear: number | null; pdfName: string | null
           status: string; scannedAt: string | null; notes: string | null; unmatched: Unmatched[] }
  candidates: Candidate[]
  pending: number
  error?: string
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [d, setD] = useState<Payload | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/group-benefits/rate-tables/${id}/schedule`, { cache: 'no-store' })
    const j = await res.json()
    if (res.ok) setD(j as Payload); else setError(j.error ?? 'Could not load')
  }, [id])
  useEffect(() => { load() }, [load])

  async function scan() {
    setBusy('scan'); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/rate-tables/${id}/schedule`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) setError(j.error ?? 'Scan failed')
      await load()
    } finally { setBusy(null) }
  }

  async function decide(decision: 'accepted' | 'rejected', candidateIds?: string[]) {
    setBusy(decision); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/rate-tables/${id}/schedule`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, candidateIds }),
      })
      const j = await res.json()
      if (!res.ok) setError(j.error ?? 'Could not record that')
      await load()
    } finally { setBusy(null) }
  }

  // One table per product, benefit lines down, plan tiers across — the brochure's own shape.
  const grids = useMemo(() => {
    if (!d) return []
    const byProduct = new Map<string, Candidate[]>()
    for (const c of d.candidates) {
      const list = byProduct.get(c.product_code) ?? []
      list.push(c); byProduct.set(c.product_code, list)
    }
    return Array.from(byProduct.entries()).map(([product, rows]) => {
      const plans = Array.from(new Set(rows.map(r => r.plan_code ?? '\u0000all')))
        .sort((a, b) => a === '\u0000all' ? 1 : b === '\u0000all' ? -1 : a.localeCompare(b, 'en', { numeric: true }))
      const lines = new Map<string, { name: string; byPlan: Map<string, Candidate> }>()
      for (const r of rows) {
        const e = lines.get(r.canon_benefit) ?? { name: r.benefitName, byPlan: new Map() }
        e.byPlan.set(r.plan_code ?? '\u0000all', r); lines.set(r.canon_benefit, e)
      }
      return { product, plans, lines: Array.from(lines.entries()) }
    })
  }, [d])

  if (!d && !error) return <div className="p-8"><Loader2 className="animate-spin text-trs-muted" /></div>

  const t = d?.table
  const cell = 'text-body tabular-nums align-top'

  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white text-trs-ink" >
      <div className="mx-auto max-w-[1280px] px-6 sm:px-12 pt-12 pb-20">
        <Breadcrumbs className="mb-3" current={{ label: 'Benefit schedule', href: `/eb/rates/${id}/schedule` }} fallback={{ label: t?.insurerName ? `Rate table · ${t.insurerName}` : 'Rate table', href: `/eb/rates/${id}` }} />

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="m-0 text-title font-medium leading-[1.08]">
              {t?.insurerName || 'Benefit schedule'}
            </h1>
            <p className="m-0 text-body mt-2 tabular-nums text-trs-muted" >
              {t?.planYear ? `${t.planYear} plan year · ` : ''}
              {d?.candidates.length ?? 0} line{(d?.candidates.length ?? 0) === 1 ? '' : 's'} read
              {d?.pending ? ` · ${d.pending} awaiting a decision` : ' · all decided'}
              {t?.scannedAt ? ` · scanned ${when(t.scannedAt)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Btn size="xs" onClick={scan} disabled={!!busy}>
              {busy === 'scan' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {busy === 'scan' ? 'Reading the brochure…' : t?.scannedAt ? 'Scan again' : 'Scan the brochure'}
            </Btn>
            {!!d?.pending && (
              <>
                <Btn size="xs" onClick={() => decide('rejected')} disabled={!!busy}>
                  <X size={13} /> Reject all {d.pending}
                </Btn>
                <Btn size="xs" level="primary" onClick={() => decide('accepted')} disabled={!!busy}>
                  {busy === 'accepted' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Accept all {d.pending}
                </Btn>
              </>
            )}
          </div>
        </div>

        {error && <p className="text-small mb-4 text-trs-neg" >{error}</p>}

        {t?.notes && (
          <p className="text-small mb-6 px-3 py-2.5 rounded border border-trs-line bg-trs-tint text-trs-ink-2" >
            {t.notes}
          </p>
        )}

        {grids.length === 0 && !busy && (
          <p className="text-body text-trs-muted" >
            Nothing read from this brochure yet.
          </p>
        )}

        {grids.map(g => (
          <section key={g.product} className="mb-8">
            <h2 className="m-0 mb-2 text-small font-semibold text-trs-muted" >
              {g.product}
            </h2>
            <Register label={g.product} minWidth={260 + g.plans.length * 150}>
                <thead>
                  <tr>
                    <th className="font-semibold sticky left-0 z-10 min-w-[260px] text-trs-muted">Benefit</th>
                    {g.plans.map(p => (
                      <th key={p} className="font-semibold min-w-[150px] text-trs-ink">
                        {p === '\u0000all' ? 'All tiers' : p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.lines.map(([code, line]) => (
                    <tr key={code}>
                      <td className="text-body sticky left-0 bg-white z-10 text-trs-ink" >
                        {line.name}
                        <span className="block text-small text-trs-subtle" >{code}</span>
                      </td>
                      {g.plans.map(p => {
                        const c = line.byPlan.get(p)
                        if (!c) return <td key={p} className={`${cell} text-trs-line-2`}>—</td>
                        const changed = c.current_text != null && c.current_text.trim() !== c.value_text.trim()
                        return (
                          <td key={p} className={`${cell} text-trs-ink`}>
                            {c.value_text}
                            {changed && (
                              <span className="block text-small line-through text-trs-subtle" >
                                {c.current_text}
                              </span>
                            )}
                            {c.source && !changed && (
                              <span className="block text-small text-trs-subtle" >{c.source}</span>
                            )}
                            {c.status !== 'pending' && (
                              <span className={`block text-small ${c.status === 'accepted' ? 'text-trs-pos' : 'text-trs-neg'}`}>
                                {c.status}
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
            </Register>
          </section>
        ))}

        {!!t?.unmatched?.length && (
          <section className="mb-8">
            <h2 className="m-0 mb-2 text-small font-semibold text-trs-muted" >
              Printed in the brochure, not in the canonical schedule
            </h2>
            <div className="border border-trs-line rounded overflow-hidden">
              {Array.from(new Map(t.unmatched.map(u => [u.label, u])).values()).map(u => (
                <div key={u.label} className="flex items-baseline justify-between gap-4 px-3 py-2 border-t border-trs-field first:border-t-0">
                  <span className="text-body text-trs-ink" >{u.label}</span>
                  <span className="text-body tabular-nums text-right text-trs-muted" >{u.value}</span>
                </div>
              ))}
            </div>
            <p className="text-small mt-1.5 text-trs-muted" >
              These cannot be compared across insurers until the line is added to the canonical schedule in
              src/lib/gb/canon.ts.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
