'use client'

/**
 * Proposal, under Compare on /eb (Jarod, 19 Nov 2026; columns 20 Nov 2026): tick the columns that
 * go to the client (copies and insurer schedules included), keep the quotation, then open the
 * proposal (/eb/proposal/<id>). Excel downloads the Compare table. The checks are the ones the
 * proposal page and the email page show (src/lib/gb/eb-proposal.ts). No model is called.
 *
 * One quotation per page (20 Nov 2026): the first Save keeps it, every later Save or Prepare updates
 * the same row (`savedId`), and Prepare after an unchanged Save only opens the proposal. A quotation
 * whose proposal has gone is kept as a new version by the server.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Btn } from '@/components/crm/primitives'
import { Checkbox } from '@/components/ui/icon-button'
import { Register, RegisterCell, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import type { Member } from '@/lib/gb-quote'
import { compareSheet, type CompareModel, type EbColumn } from '@/lib/gb/eb-compare'
import { proposalChecks, snapshotFromCompare, type EditState } from '@/lib/gb/eb-proposal'
import { fmtMoney0 } from './eb-format'
import { ebFetch } from '@/lib/gb/fetch'

export function ProposalSection({ model, cols, members, company, companyId, threadId, effectiveDate, basis, workbook, savedId, onSaved, initialInclude, edit }: {
  model: CompareModel; cols: EbColumn[]; members: Member[]; company: string; companyId: string | null; threadId: string | null
  effectiveDate: string; basis: 'renewal' | 'new_business'; workbook: string | null
  savedId: string | null; onSaved: (id: string) => void; initialInclude: string[] | null; edit: EditState
}) {
  const router = useRouter()
  const labels = model.columns.map(c => c.label)
  const [include, setInclude] = useState<string[]>(initialInclude?.length ? labels.filter(l => initialInclude.includes(l)) : labels)
  // A column added after the first render (a copy, a schedule) is ticked; one taken away drops out.
  const key0 = labels.join('|')
  const [seen, setSeen] = useState(labels)
  useEffect(() => {
    setInclude(cur => [...labels.filter(l => cur.includes(l) || !seen.includes(l))])
    setSeen(labels)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key0])
  const [busy, setBusy] = useState<'save' | 'prepare' | 'excel' | null>(null)
  const [saved, setSaved] = useState<{ version: number; at: string; key: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const on = model.columns.filter(c => include.includes(c.label) && c.total > 0)
  const lowest = on.length ? on.reduce((a, b) => (b.total < a.total ? b : a)).label : null
  const snapshot = useMemo(() => snapshotFromCompare({ model, cols, include, company: company.trim(), effectiveDate, basis, members, workbook, edit }), [model, cols, include, company, effectiveDate, basis, members, workbook, edit])
  const key = useMemo(() => JSON.stringify(snapshot), [snapshot])
  const flagsFor = (label: string) => proposalChecks({ ...snapshot, products: [label] }).filter(c => c.kind === 'warn' && c.label !== 'Census').map(c => c.label)
  const census = proposalChecks(snapshot).find(c => c.label === 'Census')

  async function keep(then: 'save' | 'prepare') {
    if (!company.trim()) { setError('Name the company first.'); return }
    if (then === 'prepare' && savedId && saved?.key === key) { router.push(`/eb/proposal/${savedId}`); return }
    setBusy(then); setError(null)
    try {
      const res = await ebFetch('/api/eb/quotations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot, company_id: companyId, thread_id: threadId, id: savedId }) })
      const d = await res.json().catch(() => ({})) as { id?: string; version?: number; error?: string }
      if (!res.ok || !d.id) { setError(d.error ?? `The quotation was not saved (${res.status}).`); return }
      onSaved(d.id)
      setSaved({ version: d.version ?? 1, at: new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }), key })
      if (then === 'prepare') router.push(`/eb/proposal/${d.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The quotation was not saved.')
    } finally {
      setBusy(null)
    }
  }

  async function excel() {
    setBusy('excel'); setError(null)
    try {
      const res = await fetch('/api/eb/compare/xlsx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company, rows: compareSheet(model, { company, effectiveDate }) }) })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? `The Excel file was not made (${res.status}).`); return }
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url; a.download = (res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]) ?? 'Compare.xlsx'
      a.click(); URL.revokeObjectURL(url)
    } catch (e) { setError(e instanceof Error ? e.message : 'The Excel file was not made.') } finally { setBusy(null) }
  }

  const toggle = (l: string) => setInclude(cur => (cur.includes(l) ? cur.filter(x => x !== l) : labels.filter(x => x === l || cur.includes(x))))
  return (
    <section id="eb-proposal" className="flex flex-col gap-3" aria-labelledby="eb-proposal-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="eb-proposal-h" className="m-0 text-heading font-semibold">Proposal</h2>
        <span className="text-small text-trs-muted">{saved ? `Saved V${saved.version} at ${saved.at}` : 'Not saved'}</span>
      </div>
      <Register label="Insurers in the proposal" minWidth={640}>
        <RegisterHead><RegisterTh first>Insurer</RegisterTh><RegisterTh>Include</RegisterTh><RegisterTh>Premium a year</RegisterTh><RegisterTh last>Checks</RegisterTh></RegisterHead>
        <tbody>
          {model.columns.map(c => {
            const flags = flagsFor(c.label)
            const ticked = include.includes(c.label)
            return (
              <RegisterRow key={c.id}>
                <RegisterCell first primary={c.label} secondary={c.source} />
                <RegisterCell><Checkbox checked={ticked} onChange={() => toggle(c.label)} label={`Include ${c.label}`} /></RegisterCell>
                <RegisterCell className={ticked && lowest === c.label ? 'cell-best' : undefined}><span className={ticked ? 'text-trs-ink' : 'text-trs-subtle'}>{fmtMoney0(c.total)}</span></RegisterCell>
                <RegisterCell last align="left">
                  {flags.length ? <span className="text-small text-trs-warn">{flags.join(', ')}: priced at S$0 or not priced</span> : <span className="text-trs-muted">—</span>}
                </RegisterCell>
              </RegisterRow>
            )
          })}
        </tbody>
      </Register>
      {census?.kind === 'warn' && <p className="m-0 text-small text-trs-warn">{census.text}</p>}
      {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Btn loading={busy === 'excel'} disabled={!!busy} onClick={() => void excel()}>Excel</Btn>
        <Btn loading={busy === 'save'} disabled={!!busy || !include.length} onClick={() => void keep('save')}>Save quotation</Btn>
        <Btn level="primary" loading={busy === 'prepare'} disabled={!!busy || !include.length} onClick={() => void keep('prepare')}>{`Prepare proposal · ${include.length} ${include.length === 1 ? 'column' : 'columns'}`}</Btn>
      </div>
    </section>
  )
}
