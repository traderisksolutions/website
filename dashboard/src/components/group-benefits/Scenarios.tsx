'use client'

/**
 * Scenarios A, B, C on the quotation page: three requirements read from the client thread, each
 * priced at every insurer. One table, insurers down, scenarios across; the card in force per
 * insurer, other cards folded. An insurer the client ruled out is priced and marked. "Use in
 * builder" opens the plan builder on that scenario.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { ThreadSelectorModal } from '@/components/group-benefits/ThreadSelectorModal'
import { shortInsurer, PRICE_DERIVATION } from '@/lib/gb/insurer-names'
import { Tip } from '@/components/Tip'
import type { ScenarioPack } from '@/lib/gb/scenario-run'
import type { ScenarioInsurer } from '@/lib/gb/scenarios'

const money = (n: number) => n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 })
const BTN2 = 'inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-[#d5d9d4] bg-white text-[#0f1412] hover:bg-[#faf9f6] no-underline cursor-pointer disabled:opacity-50'
const BTN1 = 'inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-[#132c1c] text-white hover:opacity-90 no-underline border-0 cursor-pointer disabled:opacity-50'
const MUTED = '#4a5550'

export function Scenarios({ quotationId, hasCensus }: { quotationId: string; hasCensus: boolean }) {
  const [pack, setPack] = useState<ScenarioPack | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickThread, setPickThread] = useState(false)
  const [showOther, setShowOther] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [drafted, setDrafted] = useState<{ draftId: string; threadId: string; to: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/group-benefits/quote/${quotationId}/scenarios`, { cache: 'no-store' })
    const d = await res.json().catch(() => ({})) as { pack?: ScenarioPack | null; threadId?: string | null }
    setPack(d.pack ?? null); setThreadId(d.threadId ?? null); setLoaded(true)
  }, [quotationId])
  useEffect(() => { void load() }, [load])

  async function run(body: { thread_id?: string; lead_id?: string }) {
    setBusy(true); setError(null); setPickThread(false)
    try {
      const res = await fetch(`/api/group-benefits/quote/${quotationId}/scenarios`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({})) as { pack?: ScenarioPack; threadId?: string; error?: string }
      if (!res.ok || !d.pack) { setError(d.error ?? `Scenarios failed (${res.status})`); return }
      setPack(d.pack); if (d.threadId) setThreadId(d.threadId)
    } finally { setBusy(false) }
  }
  const start = () => (threadId ? void run({ thread_id: threadId }) : setPickThread(true))

  async function draftToClient() {
    if (!threadId) { setPickThread(true); return }
    setDrafting(true); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/quote/${quotationId}/client-draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: threadId }) })
      const d = await res.json().catch(() => ({})) as { draftId?: string; threadId?: string; to?: string; error?: string }
      if (!res.ok || !d.draftId) { setError(d.error ?? `Draft failed (${res.status})`); return }
      setDrafted({ draftId: d.draftId, threadId: d.threadId ?? threadId, to: d.to ?? '' })
    } finally { setDrafting(false) }
  }

  if (!loaded) return null
  const b = pack?.brief
  const inForce = pack ? pack.scenarios[0].insurers.filter(i => i.inForce) : []
  const other = pack ? pack.scenarios[0].insurers.filter(i => !i.inForce) : []
  const cell = (ins: ScenarioInsurer | undefined) => {
    if (!ins) return <span style={{ color: '#8c958f' }}>—</span>
    return (
      <span className="flex flex-col items-end">
        <span className={cn('text-[14px] font-medium tabular-nums', ins.excluded && 'line-through')} style={{ color: ins.excluded ? '#8c958f' : '#0f1412' }}>{money(ins.total)}</span>
        <span className="text-[11.5px] tabular-nums" style={{ color: MUTED }}>{money(ins.net)} net{ins.missing ? ` · ${ins.missing} unpriced` : ''}{ins.withinBudget === false ? ' · over budget' : ins.withinBudget === true ? ' · within budget' : ''}</span>
      </span>
    )
  }
  const rows = (list: ScenarioInsurer[]) => list.map(first => {
    const per = pack!.scenarios.map(s => s.insurers.find(i => i.rate_table_id === first.rate_table_id))
    const flags = [first.current ? 'current insurer' : null, first.excluded ? 'client ruled out' : null, first.preferred ? 'preferred' : null].filter(Boolean).join(' · ')
    return (
      <RegisterRow key={first.rate_table_id}>
        <RegisterCell first primary={shortInsurer(first.insurer_name)} secondary={flags || undefined} />
        {per.map((ins, i) => <RegisterCell key={i} align="right" last={i === per.length - 1}>{cell(ins)}</RegisterCell>)}
      </RegisterRow>
    )
  })

  return (
    <section id="scenarios" className="mb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="m-0 text-[16px] font-medium">Pricing options <Tip text={PRICE_DERIVATION} width={420} placement="bottomLeft" /></h2>
        <div className="flex flex-wrap items-center gap-2">
          {pack && <span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>Read {new Date(pack.at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })} · {pack.messages} messages · {pack.employees} employees, {pack.dependants} dependants</span>}
          <button onClick={start} disabled={busy || !hasCensus} className={pack ? BTN2 : BTN1} title={hasCensus ? undefined : 'Needs a member list first'}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? 'Reading the thread…' : pack ? 'Read the thread again' : 'Price 3 options from the thread'}
          </button>
          {pack && !drafted && (
            <button onClick={() => void draftToClient()} disabled={drafting || busy} className={BTN1} title="Premium summary, derivation and suggestion, with the report attached. Waits in the thread; nothing sends.">
              {drafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {drafting ? 'Writing…' : 'Draft to client'}
            </button>
          )}
          {drafted && <span className="text-[13px]"><span style={{ color: MUTED }}>Draft to {drafted.to} waits in the thread · </span><Link href={`/engagement?lead=${drafted.threadId}`} className="no-underline hover:underline" style={{ color: '#0f1412' }}>Open thread →</Link></span>}
        </div>
      </div>
      {error && <p className="m-0 mb-3 text-[13px]" style={{ color: '#a1242f' }}>{error}</p>}
      {!pack && !busy && <p className="m-0 text-[14px]" style={{ color: MUTED }}>Not priced. Reads the client's benefits threads for the current plan, budget, must-haves, wishes and insurers ruled out, then prices like for like, lower cost and enhanced at every insurer.</p>}

      {pack && (
        <>
          <Register label="Pricing options" minWidth={760}>
            <RegisterHead>
              <RegisterTh first width={200}>Insurer</RegisterTh>
              {pack.scenarios.map((s, i) => (
                <RegisterTh key={s.key} align="right" last={i === pack.scenarios.length - 1}>{s.name}</RegisterTh>
              ))}
            </RegisterHead>
            <tbody>
              {rows(inForce)}
              {showOther && rows(other)}
            </tbody>
          </Register>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]" style={{ color: MUTED }}>
            <span>Totals include 9% GST · {pack.basis === 'renewal' ? 'renewal' : 'new business'} from {new Date(pack.effectiveDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            {b?.budget != null && <span>Budget {money(b.budget)}{b.budgetNetOfGst === false ? ' incl. GST' : ' excl. GST'}{b.budgetText ? ` (“${b.budgetText}”)` : ''}</span>}
            {b?.expiringPremium != null && <span>Expiring premium {money(b.expiringPremium)}</span>}
            {other.length > 0 && <button type="button" onClick={() => setShowOther(v => !v)} className="bg-transparent border-0 p-0 cursor-pointer hover:underline text-[12.5px]" style={{ color: MUTED }}>{showOther ? 'Hide' : 'Show'} {other.length} card{other.length === 1 ? '' : 's'} not in force on this date</button>}
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {pack.scenarios.map(s => (
              <div key={s.key} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="m-0 text-[13px] font-semibold">{s.name}</p>
                  <Link href={`/pricing-matrix/quote/${quotationId}/plans?scenario=${s.key}`} className="text-[12.5px] font-medium no-underline hover:underline whitespace-nowrap" style={{ color: '#0f1412' }}>Use in builder</Link>
                </div>
                <p className="m-0 mt-1 text-[13px] leading-snug" style={{ color: MUTED }}>{s.summary}</p>
                <ul className="m-0 mt-1.5 pl-4 list-disc flex flex-col gap-0.5 text-[13px]" style={{ color: '#2a332f' }}>
                  {s.changes.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            ))}
          </div>

          {b && (
            <details className="mt-5">
              <summary className="cursor-pointer text-[14px] font-medium list-none [&::-webkit-details-marker]:hidden"><span className="inline-block w-4 text-[#8c958f]">›</span>Thread signals</summary>
              <dl className="m-0 mt-3 grid gap-x-6 gap-y-2 grid-cols-[160px_minmax(0,1fr)] text-[13.5px] max-w-[95ch]">
                <dt style={{ color: MUTED }}>Basis</dt><dd className="m-0">{b.basis === 'renewal' ? 'Renewal' : 'New business'}{b.currentInsurer ? ` · current insurer ${b.currentInsurer}` : ''}{b.renewalDate ? ` · renews ${b.renewalDate}` : ''}</dd>
                {b.currentPlanText && <><dt style={{ color: MUTED }}>Current plan</dt><dd className="m-0">{b.currentPlanText}</dd></>}
                {b.mustHaves.length > 0 && <><dt style={{ color: MUTED }}>Must-haves</dt><dd className="m-0">{b.mustHaves.join(', ')}</dd></>}
                {b.wishes.length > 0 && <><dt style={{ color: MUTED }}>Wishes</dt><dd className="m-0">{b.wishes.map(w => `${w.cover} ${w.change}${w.detail ? ` (${w.detail})` : ''}`).join(' · ')}</dd></>}
                {b.optional.length > 0 && <><dt style={{ color: MUTED }}>Optional</dt><dd className="m-0">{b.optional.join(', ')}</dd></>}
                {(b.excludeInsurers.length > 0 || b.preferInsurers.length > 0) && <><dt style={{ color: MUTED }}>Insurers</dt><dd className="m-0">{[b.excludeInsurers.length ? `ruled out: ${b.excludeInsurers.join(', ')}` : null, b.preferInsurers.length ? `preferred: ${b.preferInsurers.join(', ')}` : null].filter(Boolean).join(' · ')}</dd></>}
                {b.decisions.length > 0 && <><dt style={{ color: MUTED }}>Decided</dt><dd className="m-0"><ul className="m-0 pl-4 list-disc">{b.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></dd></>}
                {b.open.length > 0 && <><dt style={{ color: MUTED }}>Open</dt><dd className="m-0"><ul className="m-0 pl-4 list-disc">{b.open.map((d, i) => <li key={i}>{d}</li>)}</ul></dd></>}
                {pack.notes.length > 0 && <><dt style={{ color: MUTED }}>Rate cards</dt><dd className="m-0"><ul className="m-0 pl-4 list-disc">{pack.notes.map((d, i) => <li key={i}>{d}</li>)}</ul></dd></>}
              </dl>
            </details>
          )}
        </>
      )}
      {pickThread && <ThreadSelectorModal onPick={leadId => void run({ lead_id: leadId })} onClose={() => { if (!busy) setPickThread(false) }} busyLabel={busy ? 'Reading the thread…' : null} />}
    </section>
  )
}
