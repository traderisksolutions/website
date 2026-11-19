'use client'

/**
 * Proposal, under Total on /eb (Jarod, 19 Nov 2026): tick the insurers that go to the client, keep
 * the quotation, then open the proposal (/eb/proposal/<id>). The checks are the ones the proposal
 * page and the email page show (src/lib/gb/eb-proposal.ts). No model is called.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Btn } from '@/components/crm/primitives'
import { tableFrame } from '@/components/cases/shared'
import type { Member } from '@/lib/gb-quote'
import { categoryTotal, type CoverKey, type Priced } from '@/lib/gb/eb-quote'
import { proposalChecks, snapshotFrom } from '@/lib/gb/eb-proposal'

type Picks = Record<string, Record<string, Record<CoverKey, string>>>
const f0 = (n: number) => Math.round(n).toLocaleString('en-SG')

export function ProposalSection({ priced, picks, members, company, companyId, threadId, effectiveDate, basis }: {
  priced: Priced; picks: Picks; members: Member[]; company: string; companyId: string | null; threadId: string | null
  effectiveDate: string; basis: 'renewal' | 'new_business'
}) {
  const router = useRouter()
  const [include, setInclude] = useState<string[]>(priced.products)
  const [busy, setBusy] = useState<'save' | 'prepare' | null>(null)
  const [saved, setSaved] = useState<{ id: string; version: number; at: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const totals = useMemo(() => priced.products.map(p => priced.categories.reduce((a, c) => a + categoryTotal(c, p, picks[c.name]?.[p] ?? ({} as Record<CoverKey, string>)), 0)), [priced, picks])
  const lowest = useMemo(() => {
    const on = priced.products.map((p, i) => ({ p, t: totals[i] })).filter(x => include.includes(x.p) && x.t > 0)
    return on.length ? on.reduce((a, b) => (b.t < a.t ? b : a)).p : null
  }, [priced, totals, include])
  const snapshot = useMemo(() => snapshotFrom({ priced, picks, products: include, company: company.trim(), effectiveDate, basis, members, categories: priced.categories.map(c => c.name) }), [priced, picks, include, company, effectiveDate, basis, members])
  // Checks per insurer: one row's flags are the covers chosen there but priced at S$0 or not at all.
  const flagsFor = (p: string) => {
    const one = proposalChecks({ ...snapshot, products: [p] })
    return one.filter(c => c.kind === 'warn' && c.label !== 'Census').map(c => c.label)
  }
  const census = proposalChecks(snapshot).find(c => c.label === 'Census')

  async function keep(then: 'save' | 'prepare') {
    if (!company.trim()) { setError('Name the company first.'); return }
    setBusy(then); setError(null)
    try {
      const res = await fetch('/api/eb/quotations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot, company_id: companyId, thread_id: threadId }) })
      const d = await res.json().catch(() => ({})) as { id?: string; version?: number; error?: string }
      if (!res.ok || !d.id) { setError(d.error ?? `The quotation was not saved (${res.status}).`); return }
      if (then === 'prepare') { router.push(`/eb/proposal/${d.id}`); return }
      setSaved({ id: d.id, version: d.version ?? 1, at: new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The quotation was not saved.')
    } finally {
      setBusy(null)
    }
  }

  const toggle = (p: string) => setInclude(cur => (cur.includes(p) ? cur.filter(x => x !== p) : priced.products.filter(x => x === p || cur.includes(x))))
  return (
    <section id="eb-proposal" className="flex flex-col gap-3" aria-labelledby="eb-proposal-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="eb-proposal-h" className="m-0 text-[17px] font-semibold">Proposal</h2>
        <span className="text-[12.5px] text-trs-muted">{saved ? `Saved V${saved.version} at ${saved.at}` : 'Not saved'}</span>
      </div>
      <div className={tableFrame}>
        <table className="trs-table" style={{ minWidth: 640 }} aria-label="Insurers in the proposal">
          <thead><tr><th>Insurer</th><th>Include</th><th>Premium a year</th><th>Checks</th></tr></thead>
          <tbody>
            {priced.products.map((p, i) => {
              const flags = flagsFor(p)
              const on = include.includes(p)
              return (
                <tr key={p}>
                  <td className="cell-left px-3">{p}</td>
                  <td className="px-3"><input type="checkbox" checked={on} onChange={() => toggle(p)} aria-label={`Include ${p}`} className="h-4 w-4 accent-[#132c1c] cursor-pointer" /></td>
                  <td className="px-3 tabular-nums" style={{ background: on && lowest === p ? '#e0fcd8' : undefined, color: on ? undefined : '#8c958f' }}>{f0(totals[i])}</td>
                  <td className="cell-left px-3 text-[12.5px]">
                    {flags.length
                      ? <span className="inline-flex items-center gap-1.5 text-trs-warn"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />{flags.join(', ')}: priced at S$0 or not priced</span>
                      : <span className="text-trs-muted">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {census?.kind === 'warn' && <p className="m-0 text-[12.5px] text-trs-warn">{census.text}</p>}
      {error && <p className="m-0 text-[13.5px] text-trs-neg" role="alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Btn loading={busy === 'save'} disabled={!!busy || !include.length} onClick={() => void keep('save')}>Save quotation</Btn>
        <Btn level="primary" loading={busy === 'prepare'} disabled={!!busy || !include.length} onClick={() => void keep('prepare')}>{`Prepare proposal · ${include.length} insurer${include.length === 1 ? '' : 's'}`}</Btn>
      </div>
    </section>
  )
}
