'use client'

/**
 * Clients › Admin desk: the top 20% by commission (src/lib/clients/admin-desk.ts). Left, each
 * business with its open requests; right, the one chosen: the work that comes round again with
 * when it is next due, every open request with who it waits on, and its member movements in
 * progress. Rules only; no model.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtDate, money } from '@/lib/format'
import type { DeskBusiness } from '@/lib/clients/admin-desk'
import type { MovementBatch } from '@/app/api/policies/movements/route'

const OWES: Record<string, string> = { trs: 'TRS', insurer: 'Insurer', client: 'Client', date: 'A date' }
const STAGE: Record<string, string> = { held: 'Held', to_send: 'To send', insurer: 'With insurer', to_bill: 'To bill', billed: 'Billed' }
const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)

export default function AdminDeskPage() {
  const [data, setData] = useState<{ from: string | null; businesses: DeskBusiness[] } | null>(null)
  const [moves, setMoves] = useState<MovementBatch[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/clients/admin-desk', { cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? `The desk could not load (${r.status})`); return }
      setData(d); setPick(p => p ?? d.businesses?.[0]?.id ?? null)
    }).catch(e => setError(e instanceof Error ? e.message : 'The desk could not load'))
    fetch('/api/policies/movements', { cache: 'no-store' }).then(r => r.ok ? r.json() : { batches: [] }).then(d => setMoves(d.batches ?? [])).catch(() => {})
  }, [])

  const b = data?.businesses.find(x => x.id === pick) ?? null
  const myMoves = useMemo(() => b ? moves.filter(m => b.members.includes(m.company_id) && m.stage !== 'billed') : [], [b, moves])
  const open = data?.businesses.reduce((a, x) => a + x.open.length, 0) ?? 0
  const t = today()

  return (
    <div className="bg-white text-trs-ink">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-6 pb-20 min-w-0">
        <PageHeader title="Admin desk" meta={data ? `Top 20% · ${data.businesses.length} businesses · ${open} open requests${data.from ? ` since ${fmtDate(data.from)}` : ''}` : 'Loading…'} />
        {error && <p className="mt-4 text-[14px] text-trs-neg" role="alert">{error}</p>}
        {!data && !error && <div className="mt-8"><Spinner label="Reading every request…" /></div>}
        {data && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            <nav aria-label="Businesses" className="min-w-0">
              <ul className="m-0 p-0 list-none flex flex-col">
                {data.businesses.map(x => {
                  const on = x.id === pick
                  const late = x.cycles.filter(c => c.next < t).length
                  return (
                    <li key={x.id}>
                      <button type="button" onClick={() => setPick(x.id)} aria-current={on ? 'true' : undefined}
                        className="w-full text-left bg-transparent border-0 cursor-pointer px-3 py-2 rounded-[8px] hover:bg-trs-canvas" style={on ? { background: 'var(--trs-tint, #f3f7f4)' } : undefined}>
                        <span className="block text-[13.5px] truncate">{x.name}</span>
                        <span className="block text-[12px] text-trs-muted tabular-nums">#{x.rank} · {x.open.length} open · {x.open.filter(r => r.owner === 'trs').length} with TRS{x.cycles.length ? ` · ${x.cycles.length} repeat${x.cycles.length === 1 ? '' : 's'}${late ? `, ${late} due` : ''}` : ''}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>

            {b && (
              <section className="min-w-0 flex flex-col gap-8" aria-label={b.name}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="m-0 text-[22px] font-medium"><Link href={`/companies/${b.id}?tab=knowledge`} className="text-trs-ink no-underline hover:underline">{b.name}</Link></h2>
                  <span className="text-[13px] text-trs-muted tabular-nums">#{b.rank} · {money(b.commission, { dp: 0 })} commission, 12 months{b.nextRenewal ? ` · renews ${fmtDate(b.nextRenewal)}` : ''}</span>
                </div>

                <div>
                  <h3 className="m-0 mb-2 text-[15px] font-medium">Repeats · {b.cycles.length}</h3>
                  {b.cycles.length === 0 ? <p className="m-0 text-[13.5px] text-trs-muted">None found.</p> : (
                    <Register label="Repeats" minWidth={760} dense={false}>
                      <RegisterHead><RegisterTh first>Thread</RegisterTh><RegisterTh>Every</RegisterTh><RegisterTh align="right">Times</RegisterTh><RegisterTh>Last</RegisterTh><RegisterTh last>Next expected</RegisterTh></RegisterHead>
                      <tbody>
                        {b.cycles.map(c => (
                          <RegisterRow key={c.thread_id}>
                            <RegisterCell first nowrap={false} primary={<Link href={`/engagement?lead=${c.thread_id}`} className="text-trs-ink no-underline hover:underline">{c.label}</Link>} secondary={c.type} />
                            <RegisterCell>{c.everyDays} days · {c.cadence}</RegisterCell>
                            <RegisterCell align="right">{c.count}</RegisterCell>
                            <RegisterCell>{fmtDate(c.last)}</RegisterCell>
                            <RegisterCell last><span className={c.next < t ? 'text-trs-neg' : undefined}>{fmtDate(c.next)}</span></RegisterCell>
                          </RegisterRow>
                        ))}
                      </tbody>
                    </Register>
                  )}
                </div>

                <div>
                  <h3 className="m-0 mb-2 text-[15px] font-medium">Open requests · {b.open.length}</h3>
                  {b.open.length === 0 ? <p className="m-0 text-[13.5px] text-trs-muted">None open.</p> : (
                    <Register label="Open requests" minWidth={760} dense={false}>
                      <RegisterHead><RegisterTh first>Request</RegisterTh><RegisterTh>Type</RegisterTh><RegisterTh>Waiting on</RegisterTh><RegisterTh>Since</RegisterTh><RegisterTh last>Due</RegisterTh></RegisterHead>
                      <tbody>
                        {b.open.map(r => (
                          <RegisterRow key={r.id}>
                            <RegisterCell first nowrap={false} primary={r.thread_id ? <Link href={`/engagement?lead=${r.thread_id}`} className="text-trs-ink no-underline hover:underline">{r.what}</Link> : r.what} />
                            <RegisterCell>{r.type}</RegisterCell>
                            <RegisterCell>{OWES[r.owner] ?? r.owner}</RegisterCell>
                            <RegisterCell>{fmtDate(r.since)}</RegisterCell>
                            <RegisterCell last><span className={r.due && r.due.slice(0, 10) < t ? 'text-trs-neg' : undefined}>{r.due ? fmtDate(r.due) : '—'}</span></RegisterCell>
                          </RegisterRow>
                        ))}
                      </tbody>
                    </Register>
                  )}
                </div>

                <div>
                  <h3 className="m-0 mb-2 text-[15px] font-medium">Member movements in progress · {myMoves.length}</h3>
                  {myMoves.length === 0 ? <p className="m-0 text-[13.5px] text-trs-muted">None in progress.</p> : (
                    <Register label="Member movements" minWidth={700} dense={false}>
                      <RegisterHead><RegisterTh first>Policy</RegisterTh><RegisterTh>Stage</RegisterTh><RegisterTh align="right">Joins</RegisterTh><RegisterTh align="right">Leaves</RegisterTh><RegisterTh last align="right">Days waiting</RegisterTh></RegisterHead>
                      <tbody>
                        {myMoves.map(m => (
                          <RegisterRow key={m.key}>
                            <RegisterCell first primary={<Link href="/movements" className="text-trs-ink no-underline hover:underline">{m.policy_number ?? m.insurer ?? 'Policy'}</Link>} secondary={m.insurer ?? undefined} />
                            <RegisterCell>{STAGE[m.stage] ?? m.stage}</RegisterCell>
                            <RegisterCell align="right">{m.joins}</RegisterCell>
                            <RegisterCell align="right">{m.leaves}</RegisterCell>
                            <RegisterCell last align="right">{m.days_waiting}</RegisterCell>
                          </RegisterRow>
                        ))}
                      </tbody>
                    </Register>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
