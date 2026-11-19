'use client'

/**
 * The Employment Benefits proposals on a company's Working on tab (Jarod, 19 Nov 2026): where the
 * latest one stands (request in, quotation saved, proposal sent, client decides, bound) and every
 * version kept, with its insurers, the lowest premium and when it went. Nothing shows for a
 * company without a kept quotation. No model is called.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { tableFrame } from '@/components/cases/shared'
import { shortDate } from './proposal-shared'

type Row = { id: string; version: number; created_at: string; created_by: string | null; sent_at: string | null; sent_to: string | null; products: string[]; totals: number[]; lowest: number | null; lives: number; period: string; thread_id: string | null }
const f0 = (n: number) => Math.round(n).toLocaleString('en-SG')

export function ProposalTrack({ companyId, justSent }: { companyId: string; justSent?: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    let off = false
    fetch(`/api/eb/quotations?company=${companyId}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : { quotations: [] })).then(d => { if (!off) setRows(d.quotations ?? []) }).catch(() => { if (!off) setRows([]) })
    return () => { off = true }
  }, [companyId])
  if (!rows?.length) return null
  const last = rows[0]
  const sent = rows.find(r => r.sent_at)
  const steps: { label: string; detail: string; state: 'done' | 'now' | 'later' }[] = [
    { label: 'Request in', detail: last.thread_id ? 'on the client thread' : 'no thread on file', state: 'done' },
    { label: 'Quotation saved', detail: `${shortDate(last.created_at)} · ${last.products.length} insurers`, state: 'done' },
    { label: 'Proposal sent', detail: sent ? `${shortDate(sent.sent_at)} · V${sent.version}` : 'not sent', state: sent ? 'done' : 'now' },
    { label: 'Client decides', detail: sent ? 'waiting on the client' : '—', state: sent ? 'now' : 'later' },
    { label: 'Bound', detail: last.period.split(' to ')[0] ? `by ${last.period.split(' to ')[0]}` : '—', state: 'later' },
  ]
  return (
    <section className="mb-8 flex flex-col gap-4" aria-labelledby="eb-track-h">
      {justSent && sent && <p className="m-0 text-[13.5px] text-trs-pos" role="status">Sent 1 email. Proposal V{sent.version} is on the client’s thread.</p>}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="eb-track-h" className="m-0 text-[17px] font-semibold">Employment Benefits proposal</h2>
        <span className="text-[13px] text-trs-muted">{last.period} · {last.lives} lives · {sent ? 'waiting on the client' : 'TRS to act'}</span>
      </div>
      <div className="overflow-x-auto">
        <ol className="m-0 p-0 list-none grid grid-cols-5 border-t border-trs-ink min-w-[640px]" aria-label="Where the proposal stands">
          {steps.map(s => (
            <li key={s.label} className="flex flex-col gap-1 border-r border-trs-line px-3 pt-3 pb-1 first:pl-0 last:border-r-0">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full border-[1.5px] ${s.state === 'done' ? 'border-trs-green bg-trs-green' : s.state === 'now' ? 'border-trs-green-2 bg-[#e0fcd8]' : 'border-trs-line-2 bg-white'}`} />
              <span className={`text-[14px] ${s.state === 'later' ? 'text-trs-subtle' : 'font-medium text-trs-ink'}`}>{s.label}</span>
              <span className="text-[12.5px] text-trs-muted">{s.detail}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className={tableFrame}>
        <table className="trs-table" style={{ minWidth: 720 }} aria-label="Proposals kept">
          <thead><tr><th>Proposal</th><th>Saved</th><th>Insurers</th><th>Lowest a year</th><th>Sent</th><th /></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="cell-left px-3">V{r.version}</td>
                <td className="px-3 tabular-nums">{shortDate(r.created_at)}</td>
                <td className="px-3">{r.products.length}</td>
                <td className="px-3 tabular-nums">{r.lowest != null ? `S$${f0(r.totals[r.lowest])}` : '—'}<span className="block text-[12px] text-trs-muted">{r.lowest != null ? r.products[r.lowest] : ''}</span></td>
                <td className="px-3">{r.sent_at ? <>{shortDate(r.sent_at)}<span className="block text-[12px] text-trs-muted">{r.sent_to}</span></> : <span className="text-trs-muted">Not sent</span>}</td>
                <td className="px-3"><Link href={r.sent_at ? `/eb/proposal/${r.id}` : `/eb/proposal/${r.id}/email`} className="text-[13px] underline decoration-trs-line-2 underline-offset-2">{r.sent_at ? 'Open' : 'Email to client'}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
