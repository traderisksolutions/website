'use client'

/**
 * The EB analysis report: the suggested package, insurer and premium; one rung up with the extra
 * cost; one rung down with the saving; every insurer on every rung behind it. One run priced it
 * all (src/lib/gb/analysis.ts); this page only reads the pack. Ruled-out insurers are greyed and
 * still readable. A rung header makes that rung the suggestion.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { Btn } from '@/components/crm/primitives'
import { shortInsurer } from '@/lib/gb/insurer-names'
import { PACKAGES, type PackageKey } from '@/lib/gb/packages'
import type { AnalysisPack, AnalysisInsurer, AnalysisRung } from '@/lib/gb/analysis'
import { fmtDate, money } from '@/lib/format'

type Payload = { quotation: { id: string; company_name: string | null; effective_date: string | null; basis: string | null; member_count: number }; pack: AnalysisPack | null; error?: string }

const INK = '#0f1412', MUTED = '#4a5550', SUBTLE = '#8c958f', HAIR = '#e6e8e4', GREEN = '#132c1c'
const BTN2 = 'inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-[#d5d9d4] bg-white text-[#0f1412] hover:bg-[#faf9f6] no-underline cursor-pointer'
const pepm = (net: number, employees: number) => employees > 0 ? money(net / employees / 12, { dp: 0 }) : '—'

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Payload | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/group-benefits/quote/${id}/analysis`, { cache: 'no-store' })
    const d = await res.json().catch(() => ({})) as Payload
    if (!res.ok) { setError(d.error ?? `Could not load (${res.status}).`); return }
    setData(d)
  }, [id])
  useEffect(() => { void load() }, [load])

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/quote/${id}/analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({})) as { pack?: AnalysisPack; error?: string }
      if (!res.ok || !d.pack) { setError(d.error ?? `Failed (${res.status}).`); return }
      setData(prev => prev ? { ...prev, pack: d.pack! } : prev)
    } finally { setBusy(null) }
  }

  const q = data?.quotation, pack = data?.pack ?? null
  const company = q?.company_name || 'Untitled'
  const idx = pack ? PACKAGES.findIndex(p => p.key === pack.suggested) : -1
  const rung = (i: number): AnalysisRung | null => pack && i >= 0 && i < pack.rungs.length ? pack.rungs[i] : null
  const sug = rung(idx), up = rung(idx + 1), down = rung(idx - 1)

  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-10 pb-20">
        <Breadcrumbs className="mb-3" current={{ label: `${company} · analysis`, href: `/pricing-matrix/quote/${id}/analysis` }} fallback={{ label: `${company} · quotation`, href: `/pricing-matrix/quote/${id}` }} />
        <div className="flex items-end justify-between gap-6 flex-wrap mb-8">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">{company}</h1>
            {q && <p className="m-0 mt-2 text-[13.5px]" style={{ color: MUTED }}>{q.member_count} lives{pack ? ` · ${pack.employees} employees${pack.dependants ? `, ${pack.dependants} dependants` : ''}` : ''} · starts {q.effective_date ? fmtDate(q.effective_date) : '—'} · {q.basis === 'renewal' ? 'renewal' : 'new business'}{pack?.currentInsurer ? ` · current insurer ${pack.currentInsurer}` : ''}{pack ? ` · priced ${fmtDate(pack.at)}` : ''}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/pricing-matrix/quote/${id}`} className={BTN2}>Quotation</Link>
            <Link href={`/pricing-matrix/quote/${id}/plans`} className={BTN2}>Choose plans</Link>
            <Btn level="secondary" onClick={() => post({ run: true }, 'run')} loading={busy === 'run'}>{pack ? 'Price again' : 'Run analysis'}</Btn>
          </div>
        </div>
        {error && <p className="m-0 mb-4 text-[13.5px]" style={{ color: '#a1242f' }} role="alert">{error}</p>}
        {!data && !error && <p className="m-0 text-[14px]" style={{ color: MUTED }}>Loading…</p>}
        {data && !pack && <p className="m-0 text-[14px]" style={{ color: MUTED }}>No analysis on this quotation yet. Run analysis prices every package at every insurer on its census, in one run.</p>}

        {pack && sug && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-x-10 gap-y-6 items-start">
              <Suggested rung={sug} employees={pack.employees} because={pack.because} />
              <div className="flex flex-col gap-5">
                {up && <Step label="Add a little" rung={up} base={sug} employees={pack.employees} />}
                {down && <Step label="Save a little" rung={down} base={sug} employees={pack.employees} />}
              </div>
            </section>

            <section className="mt-12">
              <h2 className="m-0 mb-1 text-[16px] font-medium">Every package at every insurer</h2>
              <p className="m-0 mb-4 text-[13px]" style={{ color: MUTED }}>Annual premium net of GST. The line joins the best price on each rung. Ruled-out insurers are greyed.</p>
              <Chart pack={pack} employees={pack.employees} />
            </section>

            <section className="mt-10">
              <div className="overflow-x-auto">
                <table className="trs-table w-full text-[13px]" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2" style={{ color: MUTED }}>Insurer</th>
                      {pack.rungs.map(r => (
                        <th key={r.key} className="text-right px-3 py-2" style={{ background: r.key === pack.suggested ? '#f1f2ee' : undefined }}>
                          <button type="button" onClick={() => post({ suggested: r.key }, r.key)} disabled={!!busy} title="Make this the suggested package" className="bg-transparent border-0 p-0 cursor-pointer text-[13px] font-semibold" style={{ color: INK }}>{r.name}{r.key === pack.suggested ? ' ·' : ''}</button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {insurerOrder(pack).map(ins => (
                      <InsurerRows key={ins} pack={pack} insurer={ins} open={open === ins} onToggle={() => setOpen(o => o === ins ? null : ins)} />
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="m-0 mt-3 pl-4 text-[12.5px]" style={{ color: MUTED }}>
                {pack.notes.map((n, i) => <li key={i}>{n}</li>)}
                <li>A rung name makes it the suggestion; a row opens the plan picked at each rung.</li>
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function Suggested({ rung, employees, because }: { rung: AnalysisRung; employees: number; because: string }) {
  const b = rung.best
  const row = b ? rung.insurers.find(i => i.insurer_name === b.insurer_name && !i.variant) : null
  return (
    <div>
      <p className="m-0 text-[11.5px] uppercase" style={{ color: SUBTLE, letterSpacing: '0.06em' }}>Suggested</p>
      <h2 className="m-0 mt-1 text-[28px] font-medium tracking-[-0.02em] leading-[1.1]">{rung.name}{b ? ` at ${shortInsurer(b.insurer_name)}` : ''}</h2>
      {b && <p className="m-0 mt-2 text-[22px] font-medium tabular-nums">{money(b.net, { dp: 0 })} <span className="text-[14px] font-normal" style={{ color: MUTED }}>a year net · {money(b.total, { dp: 0 })} with GST · {pepm(b.net, employees)} per employee a month</span></p>}
      <ul className="m-0 mt-4 pl-4 text-[14px] flex flex-col gap-1">{rung.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
      <p className="m-0 mt-3 text-[12.5px]" style={{ color: MUTED }}>Suggested as {because}.{row?.unpriced ? ` ${row.unpriced} member line${row.unpriced === 1 ? '' : 's'} not priced on this card.` : ''}{row?.notes.length ? ` ${row.notes.join('; ')}.` : ''}</p>
    </div>
  )
}

function Step({ label, rung, base, employees }: { label: string; rung: AnalysisRung; base: AnalysisRung; employees: number }) {
  const b = rung.best, bb = base.best
  const delta = b && bb ? b.net - bb.net : null
  const changed = rung.facts.filter((f, i) => f !== base.facts[i])
  return (
    <div>
      <p className="m-0 text-[11.5px] uppercase" style={{ color: SUBTLE, letterSpacing: '0.06em' }}>{label}</p>
      <h3 className="m-0 mt-1 text-[17px] font-medium">{rung.name}{b ? ` at ${shortInsurer(b.insurer_name)}` : ''}</h3>
      {b && delta != null && <p className="m-0 mt-1 text-[15px] tabular-nums">{delta >= 0 ? '+' : '−'}{money(Math.abs(delta), { dp: 0 })} a year <span className="text-[13px]" style={{ color: MUTED }}>· {money(b.net, { dp: 0 })} net · {delta >= 0 ? '+' : '−'}{pepm(Math.abs(delta), employees)} per employee a month</span></p>}
      <ul className="m-0 mt-2 pl-4 text-[13px] flex flex-col gap-0.5" style={{ color: MUTED }}>{(changed.length ? changed : rung.facts).map((f, i) => <li key={i}>{f}</li>)}</ul>
    </div>
  )
}

function insurerOrder(pack: AnalysisPack): string[] {
  const seen = new Map<string, number>()
  for (const r of pack.rungs) for (const i of r.insurers) if (!i.variant) seen.set(i.insurer_name, Math.min(seen.get(i.insurer_name) ?? Infinity, i.net))
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n)
}

function InsurerRows({ pack, insurer, open, onToggle }: { pack: AnalysisPack; insurer: string; open: boolean; onToggle: () => void }) {
  const cell = (r: AnalysisRung, variant: AnalysisInsurer['variant']) => r.insurers.find(i => i.insurer_name === insurer && i.variant === variant) ?? null
  const plain = pack.rungs.map(r => cell(r, null))
  const coins = pack.rungs.map(r => cell(r, 'co-insurance'))
  const excluded = plain.some(c => c?.excluded)
  const hasCoins = coins.some(Boolean)
  const colour = excluded ? SUBTLE : INK
  return (
    <>
      <tr style={{ borderTop: `1px solid ${HAIR}` }}>
        <td className="px-3 py-2"><button type="button" onClick={onToggle} aria-expanded={open} className="bg-transparent border-0 p-0 cursor-pointer text-[13px] text-left" style={{ color: colour, textDecoration: excluded ? 'line-through' : 'none' }}>{shortInsurer(insurer)}{excluded ? ' · ruled out' : ''}{pack.currentInsurer && shortInsurer(pack.currentInsurer) === shortInsurer(insurer) ? ' · current' : ''}</button></td>
        {plain.map((c, i) => {
          const best = pack.rungs[i].best?.insurer_name === insurer
          return <td key={i} className="px-3 py-2 text-right tabular-nums" style={{ color: colour, fontWeight: best ? 600 : 400, background: pack.rungs[i].key === pack.suggested ? '#f1f2ee' : undefined }}>{c ? <>{money(c.net, { dp: 0 })}{c.unpriced ? <span title={`${c.unpriced} member lines not priced`} style={{ color: SUBTLE }}> *</span> : null}</> : '—'}</td>
        })}
      </tr>
      {hasCoins && (
        <tr>
          <td className="px-3 py-1 text-[12.5px]" style={{ color: SUBTLE }}>with 20% co-insurance</td>
          {coins.map((c, i) => <td key={i} className="px-3 py-1 text-right tabular-nums text-[12.5px]" style={{ color: SUBTLE, background: pack.rungs[i].key === pack.suggested ? '#f1f2ee' : undefined }}>{c ? money(c.net, { dp: 0 }) : '—'}</td>)}
        </tr>
      )}
      {open && (
        <tr>
          <td className="px-3 py-2 text-[12.5px]" style={{ color: SUBTLE }}>plans</td>
          {plain.map((c, i) => <td key={i} className="px-3 py-2 text-right text-[12px]" style={{ color: MUTED, background: pack.rungs[i].key === pack.suggested ? '#f1f2ee' : undefined }}>{c ? Object.entries(c.plans).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ') : '—'}{c?.notes.length ? <div style={{ color: SUBTLE }}>{c.notes.join('; ')}</div> : null}</td>)}
        </tr>
      )}
    </>
  )
}

/** Chart A: the package ladder across, premium up, a cross per insurer, the best price joined. */
function Chart({ pack, employees }: { pack: AnalysisPack; employees: number }) {
  const W = 960, H = 380, L = 70, R = 30, T = 20, B = 44
  const pts = useMemo(() => pack.rungs.flatMap((r, i) => r.insurers.filter(x => !x.variant).map(x => ({ i, x, best: r.best?.insurer_name === x.insurer_name }))), [pack])
  const nets = pts.map(p => p.x.net)
  const lo = Math.floor(Math.min(...nets) * 0.9 / 5000) * 5000, hi = Math.ceil(Math.max(...nets) * 1.05 / 5000) * 5000
  const xs = (i: number) => L + 40 + i * ((W - L - R - 80) / 4)
  const ys = (n: number) => T + (1 - (n - lo) / Math.max(1, hi - lo)) * (H - T - B)
  const ticks: number[] = []; for (let v = lo; v <= hi; v += Math.max(5000, Math.round((hi - lo) / 6 / 5000) * 5000)) ticks.push(v)
  const best = pack.rungs.map((r, i) => r.best ? { x: xs(i), y: ys(r.best.net) } : null).filter((p): p is { x: number; y: number } => !!p)
  const idx = pack.rungs.findIndex(r => r.key === pack.suggested)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Annual premium by package and insurer" className="w-full h-auto block">
      {idx >= 0 && <rect x={xs(idx) - 70} y={T} width={140} height={H - T - B} fill="#f1f2ee" />}
      {ticks.map(v => <g key={v}><line x1={L} x2={W - R} y1={ys(v)} y2={ys(v)} stroke={HAIR} /><text x={L - 8} y={ys(v) + 4} textAnchor="end" fontSize="11" fill={SUBTLE}>{v >= 1000 ? `${Math.round(v / 1000)}k` : v}</text></g>)}
      {pack.rungs.map((r, i) => <text key={r.key} x={xs(i)} y={H - B + 18} textAnchor="middle" fontSize="12" fontWeight={r.key === pack.suggested ? 600 : 400} fill={INK}>{r.name}</text>)}
      <path d={best.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('')} fill="none" stroke={GREEN} strokeWidth="2" opacity=".6" />
      {pts.map((p, k) => {
        const x = xs(p.i), y = ys(p.x.net), c = p.x.excluded ? '#c3c8c1' : p.best ? GREEN : '#8c958f'
        const side = k % 2 === 0 ? 1 : -1
        return (
          <g key={k}>
            <path d={`M${x - 5} ${y - 5}L${x + 5} ${y + 5}M${x - 5} ${y + 5}L${x + 5} ${y - 5}`} stroke={c} strokeWidth="2.2" fill="none" />
            <text x={x + side * 9} y={y + 4} textAnchor={side > 0 ? 'start' : 'end'} fontSize="11" fill={p.x.excluded ? '#c3c8c1' : p.best ? INK : MUTED} fontWeight={p.best ? 600 : 400}>{shortInsurer(p.x.insurer_name)}{p.best ? ` ${Math.round(p.x.net / 1000)}k` : ''}</text>
          </g>
        )
      })}
      <text transform={`translate(16 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize="11.5" fill={MUTED}>Annual premium, net of GST, S$</text>
      <text x={W - R} y={H - 4} textAnchor="end" fontSize="11" fill={SUBTLE}>{employees} employees · per employee a month at the suggested rung: {pack.rungs[idx]?.best ? pepm(pack.rungs[idx].best!.net, employees) : '—'}</text>
    </svg>
  )
}
