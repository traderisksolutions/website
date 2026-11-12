'use client'

/**
 * The EB analysis report. Fifteen numbers first: the suggested package, one rung down and one
 * rung up, at every insurer. Then the suggested package in words with the cost of each step, the
 * broker's own numbers (Customise), chart A and the full ladder. One run priced it all
 * (src/lib/gb/analysis.ts); this page reads the pack. Ruled-out insurers are greyed and still
 * readable; co-insurance rows show on a toggle; a rung name makes it the suggestion. Back is the
 * EB register, the stage before this one.
 */
import { anchorRows, coverOfProduct, LAST_YEAR_COVERS, LAST_YEAR_COVER_WORD, type LastYearCover } from '@/lib/gb/last-year'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { Btn, Field, inputCls, Segmented } from '@/components/crm/primitives'
import { shortInsurer } from '@/lib/gb/insurer-names'
import { PACKAGES, type PackageKey } from '@/lib/gb/packages'
import { DEFAULT_CUSTOM, type CustomSpec } from '@/lib/gb/custom'
import type { AnalysisPack, AnalysisInsurer, AnalysisRung, CurrentPlan } from '@/lib/gb/analysis'
import { fmtDate, money } from '@/lib/format'
import { COVER_WORD, SCHEDULE_COVERS, type Schedule } from '@/lib/gb/current'

type Payload = { quotation: { id: string; company_name: string | null; effective_date: string | null; basis: string | null; member_count: number }; categories?: { name: string; members: number }[]; pack: AnalysisPack | null; error?: string }

const INK = '#0f1412', MUTED = '#4a5550', SUBTLE = '#8c958f', HAIR = '#e6e8e4', GREEN = '#132c1c', FIELD = '#f1f2ee'
const BTN2 = 'inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-[#d5d9d4] bg-white text-[#0f1412] hover:bg-[#faf9f6] no-underline cursor-pointer'
const pepm = (net: number, employees: number) => employees > 0 ? money(net / employees / 12, { dp: 0 }) : '—'
const k = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Payload | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [showCoins, setShowCoins] = useState(true)
  const [customise, setCustomise] = useState(false)
  const [splitting, setSplitting] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/group-benefits/quote/${id}/analysis`, { cache: 'no-store' })
    const d = await res.json().catch(() => ({})) as Payload
    if (!res.ok) { setError(d.error ?? `Could not load (${res.status}).`); return }
    setData(d)
  }, [id])
  useEffect(() => { void load() }, [load])

  async function post(body: Record<string, unknown>, key: string): Promise<boolean> {
    setBusy(key); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/quote/${id}/analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({})) as { pack?: AnalysisPack; error?: string }
      if (!res.ok || !d.pack) { setError(d.error ?? `Failed (${res.status}).`); return false }
      setData(prev => prev ? { ...prev, pack: d.pack! } : prev)
      return true
    } finally { setBusy(null) }
  }

  const q = data?.quotation, pack = data?.pack ?? null
  const company = q?.company_name || 'Untitled'
  const idx = pack ? PACKAGES.findIndex(p => p.key === pack.suggested) : -1
  const rung = (i: number): AnalysisRung | null => pack && i >= 0 && i < pack.rungs.length ? pack.rungs[i] : null
  const sug = rung(idx), up = rung(idx + 1), down = rung(idx - 1)
  const insurers = useMemo(() => pack ? insurerOrder(pack) : [], [pack])

  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-10 pb-20">
        <Breadcrumbs className="mb-3" current={{ label: `${company} · analysis`, href: `/pricing-matrix/quote/${id}/analysis` }} fallback={pack?.source ?? { label: 'Employment Benefits', href: '/pricing-matrix' }} />
        <div className="flex items-end justify-between gap-6 flex-wrap mb-8">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">{company}</h1>
            {q && <p className="m-0 mt-2 text-[13.5px]" style={{ color: MUTED }}>{q.member_count} lives{pack ? ` · ${pack.employees} employees${pack.dependants ? `, ${pack.dependants} dependants` : ''}` : ''} · starts {q.effective_date ? fmtDate(q.effective_date) : '—'} · {q.basis === 'renewal' ? 'renewal' : 'new business'}{pack?.currentInsurer ? ` · current insurer ${pack.currentInsurer}` : ''}{pack ? ` · priced ${fmtDate(pack.at)}` : ''}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Btn level="secondary" onClick={() => setCustomise(v => !v)} disabled={!pack}>{customise ? 'Close customise' : 'Customise'}</Btn>
            {pack?.mode !== 'current' && <Btn level="secondary" onClick={() => setSplitting(v => !v)} disabled={!pack}>{splitting ? 'Close split' : 'Split by category'}</Btn>}
            <Link href={`/pricing-matrix/quote/${id}`} className={BTN2}>Quotation</Link>
            <Btn level="secondary" onClick={() => post({ run: true }, 'run')} loading={busy === 'run'}>{pack ? 'Price again' : 'Run analysis'}</Btn>
          </div>
        </div>
        {error && <p className="m-0 mb-4 text-[13.5px]" style={{ color: '#a1242f' }} role="alert">{error}</p>}
        {!data && !error && <p className="m-0 text-[14px]" style={{ color: MUTED }}>Loading…</p>}
        {data && !pack && <p className="m-0 text-[14px]" style={{ color: MUTED }}>No analysis on this quotation yet. Run analysis prices every package at every insurer on its census, in one run.</p>}

        {pack && pack.mode === 'current' && <CurrentView pack={pack} customise={customise} busy={busy} onCustom={spec => post({ custom: spec }, 'custom')} />}

        {pack && pack.mode !== 'current' && sug && (
          <>
            {customise && <Customise pack={pack} busy={busy === 'custom'} onRun={spec => post({ custom: spec }, 'custom')} />}
            {splitting && <Split pack={pack} categories={data?.categories ?? []} busy={busy === 'split'} onRun={a => post({ split: a }, 'split')} />}

            {/* The fifteen numbers */}
            <section>
              <h2 className="m-0 mb-1 text-[16px] font-medium">Fifteen prices</h2>
              <p className="m-0 mb-3 text-[13px]" style={{ color: MUTED }}>Annual premium net of GST, every insurer, on the suggested package and the rung either side. Bold is the lowest on the rung.</p>
              <div className="overflow-x-auto">
                <table className="trs-table w-full text-[13.5px]" style={{ borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead><tr>
                    <th className="text-left px-3 py-2" style={{ color: MUTED }}>Insurer</th>
                    {[down, sug, up].map((r, i) => r ? <th key={r.key} className="text-right px-3 py-2" style={{ background: i === 1 ? FIELD : undefined }}>{i === 0 ? 'Save a little · ' : i === 2 ? 'Add a little · ' : 'Suggested · '}{r.name}</th> : <th key={i} />)}
                    {pack.custom && <th className="text-right px-3 py-2">Custom</th>}
                    {pack.split && <th className="text-right px-3 py-2">Split</th>}
                  </tr></thead>
                  <tbody>
                    {insurers.map(ins => {
                      const cells = [down, sug, up].map(r => r ? r.insurers.find(x => x.insurer_name === ins && !x.variant) ?? null : null)
                      const excluded = cells.some(c => c?.excluded)
                      const colour = excluded ? SUBTLE : INK
                      return (
                        <tr key={ins} style={{ borderTop: `1px solid ${HAIR}` }}>
                          <td className="px-3 py-2" style={{ color: colour, textDecoration: excluded ? 'line-through' : 'none' }}>{shortInsurer(ins)}{excluded ? ' · ruled out' : ''}{pack.currentInsurer && shortInsurer(pack.currentInsurer) === shortInsurer(ins) ? ' · current' : ''}</td>
                          {cells.map((c, i) => { const r = [down, sug, up][i]; const best = !!r?.best && r.best.insurer_name === ins; return <td key={i} className="px-3 py-2 text-right tabular-nums" style={{ color: colour, fontWeight: best ? 600 : 400, background: i === 1 ? FIELD : undefined }}>{c ? <>{money(c.net, { dp: 0 })}{c.unpriced ? <span title={`${c.unpriced} member lines not priced`} style={{ color: SUBTLE }}> *</span> : null}</> : r ? '—' : ''}</td> })}
                          {pack.custom && (() => { const c = pack.custom!.insurers.find(x => x.insurer_name === ins && !x.variant); const best = pack.custom!.best?.insurer_name === ins; return <td className="px-3 py-2 text-right tabular-nums" style={{ color: colour, fontWeight: best ? 600 : 400 }}>{c ? money(c.net, { dp: 0 }) : '—'}</td> })()}
                          {pack.split && (() => { const c = pack.split!.insurers.find(x => x.insurer_name === ins && !x.variant); const best = pack.split!.best?.insurer_name === ins; return <td className="px-3 py-2 text-right tabular-nums" style={{ color: colour, fontWeight: best ? 600 : 400 }}>{c ? money(c.net, { dp: 0 }) : '—'}</td> })()}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {pack.custom && <p className="m-0 mt-2 text-[12.5px]" style={{ color: MUTED }}>Custom: {pack.custom.summary}.</p>}
              {pack.split && <p className="m-0 mt-1 text-[12.5px]" style={{ color: MUTED }}>Split: {pack.split.summary}.</p>}
            </section>

            <section className="mt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-x-10 gap-y-6 items-start">
              <Suggested rung={sug} employees={pack.employees} because={pack.because} />
              <div className="flex flex-col gap-5">
                {up && <Step label="Add a little" rung={up} base={sug} employees={pack.employees} />}
                {down && <Step label="Save a little" rung={down} base={sug} employees={pack.employees} />}
                {pack.custom && <CustomCard custom={pack.custom} base={sug} employees={pack.employees} />}
                {pack.split && <SplitCard split={pack.split} base={sug} employees={pack.employees} />}
              </div>
            </section>

            <section className="mt-12">
              <h2 className="m-0 mb-1 text-[16px] font-medium">Every package at every insurer</h2>
              <p className="m-0 mb-4 text-[13px]" style={{ color: MUTED }}>The line joins the best price on each rung.</p>
              <Chart pack={pack} employees={pack.employees} />
            </section>

            <section className="mt-10">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <h2 className="m-0 text-[16px] font-medium">The full ladder</h2>
                <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: MUTED }}><input id="show-coins" type="checkbox" checked={showCoins} onChange={e => setShowCoins(e.target.checked)} /> 20% co-insurance options</label>
              </div>
              <div className="overflow-x-auto">
                <table className="trs-table w-full text-[13px]" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2" style={{ color: MUTED }}>Insurer</th>
                      {pack.rungs.map(r => (
                        <th key={r.key} className="text-right px-3 py-2" style={{ background: r.key === pack.suggested ? FIELD : undefined }}>
                          <button type="button" onClick={() => post({ suggested: r.key }, r.key)} disabled={!!busy} title="Make this the suggested package" className="bg-transparent border-0 p-0 cursor-pointer text-[13px] font-semibold" style={{ color: INK }}>{r.name}{r.key === pack.suggested ? ' ·' : ''}</button>
                        </th>
                      ))}
                      {pack.custom && <th className="text-right px-3 py-2">Custom</th>}
                      {pack.split && <th className="text-right px-3 py-2">Split</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {insurers.map(ins => <InsurerRows key={ins} pack={pack} insurer={ins} open={open === ins} showCoins={showCoins} onToggle={() => setOpen(o => o === ins ? null : ins)} />)}
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

function CustomCard({ custom, base, employees }: { custom: NonNullable<AnalysisPack['custom']>; base: AnalysisRung; employees: number }) {
  const b = custom.best, bb = base.best
  const delta = b && bb ? b.net - bb.net : null
  const notes = Object.values(custom.notes).flat()
  return (
    <div>
      <p className="m-0 text-[11.5px] uppercase" style={{ color: SUBTLE, letterSpacing: '0.06em' }}>Custom</p>
      <h3 className="m-0 mt-1 text-[17px] font-medium">{b ? `${shortInsurer(b.insurer_name)} lowest` : 'No price'}</h3>
      {b && delta != null && <p className="m-0 mt-1 text-[15px] tabular-nums">{delta >= 0 ? '+' : '−'}{money(Math.abs(delta), { dp: 0 })} a year against the suggestion <span className="text-[13px]" style={{ color: MUTED }}>· {money(b.net, { dp: 0 })} net · {pepm(b.net, employees)} per employee a month</span></p>}
      <p className="m-0 mt-2 text-[13px]" style={{ color: MUTED }}>{custom.summary}</p>
      {notes.length > 0 && <p className="m-0 mt-1 text-[12.5px]" style={{ color: SUBTLE }}>{[...new Set(notes)].join('; ')}</p>}
    </div>
  )
}

/** The first-screen numbers; critical illness and accident behind More. */
function Customise({ pack, busy, onRun }: { pack: AnalysisPack; busy: boolean; onRun: (spec: CustomSpec) => void }) {
  const [s, setS] = useState<CustomSpec>(pack.custom?.spec ?? DEFAULT_CUSTOM)
  const [more, setMore] = useState(false)
  const set = <K extends keyof CustomSpec>(key: K, v: CustomSpec[K]) => setS(x => ({ ...x, [key]: v }))
  const numSel = (id: string, value: number | null, opts: (number | null)[], onChange: (v: number | null) => void, none = 'None') => (
    <select id={id} value={value == null ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} className={inputCls}>
      {opts.map(o => <option key={String(o)} value={o == null ? '' : String(o)}>{o == null ? none : `S$${o.toLocaleString('en-SG')}`}</option>)}
    </select>
  )
  const limits = s.limitKind === 'annual' ? [30_000, 60_000, 80_000, 150_000, 200_000, 250_000, 300_000] : [15_000, 20_000, 25_000, 30_000]
  return (
    <section className="mb-10 rounded-[12px] p-5" style={{ background: FIELD }}>
      <h2 className="m-0 mb-1 text-[16px] font-medium">Customise</h2>
      <p className="m-0 mb-4 text-[13px]" style={{ color: MUTED }}>Your numbers, resolved to the plan at each insurer that meets them, priced in one run and shown as Custom beside the packages.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Hospital"><Segmented size="sm" value={s.hospital} onChange={v => set('hospital', v)} options={[{ value: 'private', label: 'Private' }, { value: 'government', label: 'Government' }]} /></Field>
        <Field label="Ward"><Segmented size="sm" value={String(s.beds)} onChange={v => set('beds', Number(v) as 1 | 2 | 4)} options={[{ value: '1', label: '1-bed' }, { value: '2', label: '2-bed' }, { value: '4', label: '4-bed' }]} /></Field>
        <Field label="Limit basis"><Segmented size="sm" value={s.limitKind} onChange={v => { set('limitKind', v); set('limit', v === 'annual' ? 60_000 : 15_000) }} options={[{ value: 'per_disability', label: 'Per stay' }, { value: 'annual', label: 'Annual' }]} /></Field>
        <Field label={s.limitKind === 'annual' ? 'Annual limit' : 'Per-stay limit'}>{numSel('c-limit', s.limit, limits, v => set('limit', v ?? 15_000))}</Field>
        <Field label="Co-insurance"><Segmented size="sm" value={String(s.coins)} onChange={v => set('coins', Number(v) as 0 | 20 | 25)} options={[{ value: '0', label: 'Nil' }, { value: '20', label: '20%' }, { value: '25', label: '25%' }]} /></Field>
        <Field label="Major medical">{numSel('c-gmm', s.gmm, [null, 40_000, 60_000, 80_000, 100_000], v => set('gmm', v), 'Off')}</Field>
        <Field label="GP co-pay per visit">{numSel('c-gp', s.gpCopay, [null, 0, 5, 10, 15, 20], v => set('gpCopay', v), 'No GP cover')}</Field>
        <Field label="Specialist a year">{numSel('c-sp', s.spLimit, [null, 500, 1_000, 1_500, 2_000, 3_000, 5_000], v => set('spLimit', v), 'No specialist cover')}</Field>
        <Field label="Dental a year">{numSel('c-gd', s.gdLimit, [null, 250, 500, 800, 1_000, 1_500], v => set('gdLimit', v), 'No dental')}</Field>
        <Field label="Term life">{numSel('c-gtl', s.gtl, [null, 50_000, 100_000, 150_000, 200_000, 300_000, 500_000], v => set('gtl', v), 'No life cover')}</Field>
        <Field label="Dependants"><Segmented size="sm" value={s.deps} onChange={v => set('deps', v)} options={[{ value: 'medical', label: 'On medical covers' }, { value: 'none', label: 'Employees only' }]} /></Field>
        {more && <Field label="Critical illness">{numSel('c-gci', s.gci, [null, 25_000, 50_000, 100_000, 150_000, 250_000], v => set('gci', v), 'None')}</Field>}
        {more && <Field label="Personal accident">{numSel('c-pa', s.pa, [null, 50_000, 100_000, 150_000, 200_000, 250_000, 300_000, 500_000], v => set('pa', v), 'None')}</Field>}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Btn level="primary" onClick={() => onRun(s)} loading={busy}>Price this</Btn>
        <button type="button" onClick={() => setMore(v => !v)} className="bg-transparent border-0 p-0 text-[13px] underline underline-offset-[3px] cursor-pointer" style={{ color: MUTED }}>{more ? 'Fewer' : 'More: critical illness, accident'}</button>
      </div>
    </section>
  )
}

function SplitCard({ split, base, employees }: { split: NonNullable<AnalysisPack['split']>; base: AnalysisRung; employees: number }) {
  const b = split.best, bb = base.best
  const delta = b && bb ? b.net - bb.net : null
  return (
    <div>
      <p className="m-0 text-[11.5px] uppercase" style={{ color: SUBTLE, letterSpacing: '0.06em' }}>Split</p>
      <h3 className="m-0 mt-1 text-[17px] font-medium">{b ? `${shortInsurer(b.insurer_name)} lowest` : 'No price'}</h3>
      {b && delta != null && <p className="m-0 mt-1 text-[15px] tabular-nums">{delta >= 0 ? '+' : '−'}{money(Math.abs(delta), { dp: 0 })} a year against the suggestion <span className="text-[13px]" style={{ color: MUTED }}>· {money(b.net, { dp: 0 })} net · {pepm(b.net, employees)} per employee a month</span></p>}
      <p className="m-0 mt-2 text-[13px]" style={{ color: MUTED }}>{split.summary}</p>
    </div>
  )
}

/** Management on one rung, staff on another: each census category to a package, priced as one programme. */
function Split({ pack, categories, busy, onRun }: { pack: AnalysisPack; categories: { name: string; members: number }[]; busy: boolean; onRun: (a: Record<string, PackageKey>) => void }) {
  const [a, setA] = useState<Record<string, PackageKey>>(() => Object.fromEntries(categories.map(c => [c.name, (pack.split?.assignments[c.name] ?? pack.suggested) as PackageKey])))
  return (
    <section className="mb-10 rounded-[12px] p-5" style={{ background: FIELD }}>
      <h2 className="m-0 mb-1 text-[16px] font-medium">Split by category</h2>
      <p className="m-0 mb-4 text-[13px]" style={{ color: MUTED }}>{categories.length > 1 ? 'Each category of the census on its own package; dependants follow their employee. Priced as one programme, shown as Split beside the packages.' : 'The census carries one category. Give it a grade column (Management, Staff) to split it; dependants follow their employee.'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {categories.map(c => (
          <Field key={c.name} label={`${c.name} · ${c.members} employee${c.members === 1 ? '' : 's'}`}>
            <select id={`split-${c.name}`} value={a[c.name] ?? pack.suggested} onChange={e => setA(x => ({ ...x, [c.name]: e.target.value as PackageKey }))} className={inputCls}>
              {PACKAGES.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </Field>
        ))}
      </div>
      <div className="mt-4"><Btn level="primary" onClick={() => onRun(a)} loading={busy} disabled={!categories.length}>Price split</Btn></div>
    </section>
  )
}

function insurerOrder(pack: AnalysisPack): string[] {
  const seen = new Map<string, number>()
  for (const r of pack.rungs) for (const i of r.insurers) if (!i.variant) seen.set(i.insurer_name, Math.min(seen.get(i.insurer_name) ?? Infinity, i.net))
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n)
}

function InsurerRows({ pack, insurer, open, showCoins, onToggle }: { pack: AnalysisPack; insurer: string; open: boolean; showCoins: boolean; onToggle: () => void }) {
  const cell = (r: AnalysisRung, variant: AnalysisInsurer['variant']) => r.insurers.find(i => i.insurer_name === insurer && i.variant === variant) ?? null
  const plain = pack.rungs.map(r => cell(r, null))
  const coins = pack.rungs.map(r => cell(r, 'co-insurance'))
  const custom = pack.custom?.insurers.find(i => i.insurer_name === insurer && !i.variant) ?? null
  const split = pack.split?.insurers.find(i => i.insurer_name === insurer && !i.variant) ?? null
  const excluded = plain.some(c => c?.excluded)
  const hasCoins = showCoins && coins.some(Boolean)
  const colour = excluded ? SUBTLE : INK
  const bg = (i: number) => pack.rungs[i].key === pack.suggested ? FIELD : undefined
  return (
    <>
      <tr style={{ borderTop: `1px solid ${HAIR}` }}>
        <td className="px-3 py-2"><button type="button" onClick={onToggle} aria-expanded={open} className="bg-transparent border-0 p-0 cursor-pointer text-[13px] text-left" style={{ color: colour, textDecoration: excluded ? 'line-through' : 'none' }}>{shortInsurer(insurer)}{excluded ? ' · ruled out' : ''}{pack.currentInsurer && shortInsurer(pack.currentInsurer) === shortInsurer(insurer) ? ' · current' : ''}</button></td>
        {plain.map((c, i) => { const best = pack.rungs[i].best?.insurer_name === insurer; return <td key={i} className="px-3 py-2 text-right tabular-nums" style={{ color: colour, fontWeight: best ? 600 : 400, background: bg(i) }}>{c ? <>{money(c.net, { dp: 0 })}{c.unpriced ? <span title={`${c.unpriced} member lines not priced`} style={{ color: SUBTLE }}> *</span> : null}</> : '—'}</td> })}
        {pack.custom && <td className="px-3 py-2 text-right tabular-nums" style={{ color: colour, fontWeight: pack.custom.best?.insurer_name === insurer ? 600 : 400 }}>{custom ? money(custom.net, { dp: 0 }) : '—'}</td>}
        {pack.split && <td className="px-3 py-2 text-right tabular-nums" style={{ color: colour, fontWeight: pack.split.best?.insurer_name === insurer ? 600 : 400 }}>{split ? money(split.net, { dp: 0 }) : '—'}</td>}
      </tr>
      {hasCoins && (
        <tr>
          <td className="px-3 py-1 text-[12.5px]" style={{ color: SUBTLE }}>with 20% co-insurance</td>
          {coins.map((c, i) => <td key={i} className="px-3 py-1 text-right tabular-nums text-[12.5px]" style={{ color: SUBTLE, background: bg(i) }}>{c ? money(c.net, { dp: 0 }) : '—'}</td>)}
          {pack.custom && <td />}
          {pack.split && <td />}
        </tr>
      )}
      {open && (
        <tr>
          <td className="px-3 py-2 text-[12.5px]" style={{ color: SUBTLE }}>plans</td>
          {plain.map((c, i) => <td key={i} className="px-3 py-2 text-right text-[12px]" style={{ color: MUTED, background: bg(i) }}>{c ? Object.entries(c.plans).filter(([, v]) => v).map(([kk, v]) => `${kk} ${v}`).join(' · ') : '—'}{c?.notes.length ? <div style={{ color: SUBTLE }}>{c.notes.join('; ')}</div> : null}</td>)}
          {pack.custom && <td className="px-3 py-2 text-right text-[12px]" style={{ color: MUTED }}>{custom ? Object.entries(custom.plans).filter(([, v]) => v).map(([kk, v]) => `${kk} ${v}`).join(' · ') : '—'}{custom && pack.custom.notes[custom.rate_table_id]?.length ? <div style={{ color: SUBTLE }}>{pack.custom.notes[custom.rate_table_id].join('; ')}</div> : null}</td>}
          {pack.split && <td className="px-3 py-2 text-right text-[12px]" style={{ color: MUTED }}>{split ? Object.entries(split.plans).filter(([, v]) => v).map(([kk, v]) => `${kk} ${v}`).join(' · ') : '—'}</td>}
        </tr>
      )}
    </>
  )
}

/** Chart A: the package ladder across, premium up, a cross per insurer, the best price joined. */
function Chart({ pack, employees }: { pack: AnalysisPack; employees: number }) {
  const W = 960, H = 380, L = 70, R = 30, T = 20, B = 44
  const cols = [...pack.rungs, ...(pack.custom ? [{ key: 'custom', name: 'Custom', insurers: pack.custom.insurers, best: pack.custom.best }] : []), ...(pack.split ? [{ key: 'split', name: 'Split', insurers: pack.split.insurers, best: pack.split.best }] : [])]
  const pts = useMemo(() => cols.flatMap((r, i) => r.insurers.filter(x => !x.variant).map(x => ({ i, x, best: r.best?.insurer_name === x.insurer_name }))), [cols])
  const nets = pts.map(p => p.x.net)
  const lo = Math.floor(Math.min(...nets) * 0.9 / 5000) * 5000, hi = Math.ceil(Math.max(...nets) * 1.05 / 5000) * 5000
  const xs = (i: number) => L + 40 + i * ((W - L - R - 80) / Math.max(1, cols.length - 1))
  const ys = (n: number) => T + (1 - (n - lo) / Math.max(1, hi - lo)) * (H - T - B)
  const ticks: number[] = []; for (let v = lo; v <= hi; v += Math.max(5000, Math.round((hi - lo) / 6 / 5000) * 5000)) ticks.push(v)
  const best = cols.map((r, i) => r.best ? { x: xs(i), y: ys(r.best.net) } : null).filter((p): p is { x: number; y: number } => !!p)
  const idx = cols.findIndex(r => r.key === pack.suggested)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Annual premium by package and insurer" className="w-full h-auto block">
      {idx >= 0 && <rect x={xs(idx) - 70} y={T} width={140} height={H - T - B} fill={FIELD} />}
      {ticks.map(v => <g key={v}><line x1={L} x2={W - R} y1={ys(v)} y2={ys(v)} stroke={HAIR} /><text x={L - 8} y={ys(v) + 4} textAnchor="end" fontSize="11" fill={SUBTLE}>{k(v)}</text></g>)}
      {cols.map((r, i) => <text key={r.key} x={xs(i)} y={H - B + 18} textAnchor="middle" fontSize="12" fontWeight={r.key === pack.suggested ? 600 : 400} fill={INK}>{r.name}</text>)}
      <path d={best.slice(0, pack.rungs.length).map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('')} fill="none" stroke={GREEN} strokeWidth="2" opacity=".6" />
      {pts.map((p, n) => {
        const x = xs(p.i), y = ys(p.x.net), c = p.x.excluded ? '#c3c8c1' : p.best ? GREEN : '#8c958f'
        const side = n % 2 === 0 ? 1 : -1
        return (
          <g key={n}>
            <title>{`${shortInsurer(p.x.insurer_name)} · ${cols[p.i].name} · ${money(p.x.net, { dp: 0 })}`}</title>
            <path d={`M${x - 5} ${y - 5}L${x + 5} ${y + 5}M${x - 5} ${y + 5}L${x + 5} ${y - 5}`} stroke={c} strokeWidth="2.2" fill="none" />
            {p.best && <text x={x + 9} y={y + 4} textAnchor="start" fontSize="11" fill={INK} fontWeight={600}>{shortInsurer(p.x.insurer_name)} {k(p.x.net)}</text>}
            {void side}
          </g>
        )
      })}
      <text transform={`translate(16 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize="11.5" fill={MUTED}>Annual premium, net of GST, S$</text>
      <text x={W - R} y={H - 4} textAnchor="end" fontSize="11" fill={SUBTLE}>{employees} employees · per employee a month at the suggested rung: {pack.rungs[idx]?.best ? pepm(pack.rungs[idx].best!.net, employees) : '—'}</text>
    </svg>
  )
}

const SHORT: Record<string, string> = {
  current: 'Current', beds_more: '+1 bed', beds_fewer: '−1 bed', type: 'Hospital type', limit_down: 'Limit ↓', limit_up: 'Limit ↑', annual: 'Annual limit',
  coins: '20% co-ins', gmm_off: 'No major medical', gmm_on: 'Add major medical', life_down: 'Life ↓', life_up: 'Life ↑',
}

/** The schedule as a client's HR reads it: one line per plan. */
function scheduleLines(s: Schedule, counts: AnalysisPack['planCounts']): { cover: string; lines: string[] }[] {
  const n = (v: number) => `S$${v.toLocaleString('en-SG')}`
  const label = (v: string) => v === '*' ? 'Everyone' : /^\d+$/.test(v) ? `Plan ${v}` : v
  const people = (c: string, v: string) => counts?.[c]?.find(x => x.value === v)?.people
  return SCHEDULE_COVERS.map(c => {
    const map = s[c] as Record<string, unknown>
    const lines = Object.entries(map).map(([v, f]) => {
      const who = `${label(v)}${people(c, v) != null ? ` (${people(c, v)})` : ''}`
      if (f == null) return `${who}: not covered`
      if (c === 'GHS') { const h = f as Schedule['GHS'][string] & object; return `${who}: ${h.foreignWorker ? 'foreign workers, ' : ''}${h.hospital === 'private' ? 'private' : 'government'} ${h.beds}-bed, ${n(h.limit)} ${h.limitKind === 'annual' ? 'a year' : 'per stay'}${h.coins ? `, ${h.coins}% co-insurance` : ''}` }
      if (c === 'GTL') { const l = f as { kind: string; n: number }; return `${who}: ${l.kind === 'multiple' ? `${l.n} × monthly salary` : n(l.n)}` }
      if (c === 'GOPC') return `${who}: co-pay S$${f} per visit`
      return `${who}: ${n(f as number)}${c === 'EMM' ? '' : ' a year'}`
    })
    return { cover: COVER_WORD[c], lines }
  }).filter(x => x.lines.length)
}

function CurrentView({ pack, customise, busy, onCustom }: { pack: AnalysisPack; customise: boolean; busy: string | null; onCustom: (s: CustomSpec) => void }) {
  const cur = pack.rungs[0]
  const changes = pack.rungs.slice(1)
  const order = cur ? cur.insurers.filter(i => !i.variant).map(i => i.insurer_name) : []
  const curOf = (ins: string) => cur?.insurers.find(i => i.insurer_name === ins && !i.variant) ?? null
  const isCurrentInsurer = (ins: string) => !!pack.currentInsurer && shortInsurer(pack.currentInsurer) === shortInsurer(ins)
  const lowestCur = cur?.best?.insurer_name
  const lines = pack.schedule ? scheduleLines(pack.schedule, pack.planCounts) : []
  return (
    <>
      {customise && <Customise pack={pack} busy={busy === 'custom'} onRun={onCustom} />}
      {pack.lastYear && (() => {
        const row = cur?.insurers.find(i => isCurrentInsurer(i.insurer_name) && !i.variant) ?? null
        const gross = pack.lastYear.gst === 'included'
        const a = anchorRows(pack.lastYear, row?.by_product, row && row.net > 0 ? row.total / row.net - 1 : 0)
        const thisYearFigure = row ? (gross ? row.total : row.net) : null
        const pc = (n: number | null) => n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(1)}%`
        const tone = (n: number | null) => n == null || Math.abs(n) < 0.0005 ? MUTED : n > 0 ? '#a1242f' : '#1f7a3a'
        return (
          <section className="mb-10" aria-labelledby="anchor">
            <h2 id="anchor" className="m-0 mb-3 text-[16px] font-medium">Anchor</h2>
            <div className="flex flex-wrap gap-x-10 gap-y-3 mb-4">
              <div><p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Last year{pack.lastYear.product ? `, ${pack.lastYear.product}` : ''}</p><p className="m-0 text-[24px] tabular-nums">{a.lastYear != null ? money(a.lastYear, { dp: 0 }) : <span className="text-[16px]" style={{ color: MUTED }}>Not stated</span>}</p></div>
              <div><p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Same cover this year{row ? `, ${shortInsurer(row.insurer_name)}` : ''}</p><p className="m-0 text-[24px] tabular-nums">{thisYearFigure != null ? money(thisYearFigure, { dp: 0 }) : '—'}</p></div>
              <div><p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Change{gross ? ', with GST' : ', net of GST'}</p><p className="m-0 text-[24px] tabular-nums" style={{ color: tone(a.change) }}>{pc(a.change)}</p></div>
            </div>
            {a.rows.some(r => r.lastYear != null) && (
              <div className="overflow-x-auto">
                <table className="trs-table text-[13.5px]" style={{ borderCollapse: 'collapse', minWidth: 520 }}>
                  <thead><tr><th className="text-left px-3 py-2">Cover</th><th className="text-right px-3 py-2">Last year</th><th className="text-right px-3 py-2">This year{row ? `, ${shortInsurer(row.insurer_name)}` : ''}</th><th className="text-right px-3 py-2">Change</th></tr></thead>
                  <tbody>
                    {a.rows.map(r => (
                      <tr key={r.cover} style={{ borderTop: `1px solid ${HAIR}` }}>
                        <td className="px-3 py-2">{LAST_YEAR_COVER_WORD[r.cover]}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.lastYear != null ? money(r.lastYear, { dp: 0 }) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.thisYear != null ? money(r.thisYear, { dp: 0 }) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: tone(r.change) }}>{pc(r.change)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })()}
      <section>
        <h2 className="m-0 mb-1 text-[16px] font-medium">Current cover</h2>
        <p className="m-0 mb-3 text-[13px]" style={{ color: MUTED }}>As confirmed from the census{pack.currentInsurer ? `; with ${pack.currentInsurer} today` : ''}.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3 mb-2">
          {lines.map(l => (
            <div key={l.cover}>
              <p className="m-0 text-[12.5px] font-semibold" style={{ color: INK }}>{l.cover}</p>
              <ul className="m-0 pl-4 text-[13px]" style={{ color: MUTED }}>{l.lines.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          ))}
        </div>
        {pack.unscheduled && pack.unscheduled.length > 0 && <p className="m-0 mt-2 text-[12.5px]" style={{ color: '#a1242f' }}>{pack.unscheduled.length} lives left out: their hospital plan is not stated.</p>}
      </section>

      <PlansAndPremium pack={pack} order={order} curOf={curOf} isCurrentInsurer={isCurrentInsurer} lowest={lowestCur} />

      <section className="mt-10">
        <h2 className="m-0 mb-1 text-[16px] font-medium">One change at a time</h2>
        <p className="m-0 mb-3 text-[13px]" style={{ color: MUTED }}>Each row changes one thing for everyone (foreign workers keep their cover). The figure under each premium is the difference from the current cover at the same insurer.</p>
        <div className="overflow-x-auto">
          <table className="trs-table w-full text-[13px]" style={{ borderCollapse: 'collapse', minWidth: 860 }}>
            <thead><tr>
              <th className="text-left px-3 py-2" style={{ color: MUTED }}>Change</th>
              {order.map(ins => <th key={ins} className="text-right px-3 py-2" style={{ color: curOf(ins)?.excluded ? SUBTLE : INK }}>{shortInsurer(ins)}</th>)}
            </tr></thead>
            <tbody>
              {changes.map(r => (
                <tr key={r.key} style={{ borderTop: `1px solid ${HAIR}` }}>
                  <td className="px-3 py-2"><span style={{ color: INK }}>{r.name}</span><div className="text-[12px]" style={{ color: SUBTLE }}>{r.facts[0]}</div></td>
                  {order.map(ins => {
                    const c = r.insurers.find(i => i.insurer_name === ins && !i.variant), base = curOf(ins)
                    const d = c && base ? c.net - base.net : null
                    const grey = c?.excluded
                    return (
                      <td key={ins} className="px-3 py-2 text-right tabular-nums" style={{ color: grey ? SUBTLE : INK, fontWeight: r.best?.insurer_name === ins ? 600 : 400 }}>
                        {c ? money(c.net, { dp: 0 }) : '—'}
                        {d != null && <div className="text-[12px] font-normal" style={{ color: grey ? SUBTLE : Math.abs(d) < 1 ? SUBTLE : d < 0 ? '#1f7a3a' : '#a1242f' }}>{Math.abs(d) < 1 ? 'same plan' : `${d > 0 ? '+' : '−'}${money(Math.abs(d), { dp: 0 })}`}</div>}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {pack.custom && (
                <tr style={{ borderTop: `1px solid ${HAIR}` }}>
                  <td className="px-3 py-2"><span style={{ color: INK }}>Custom</span><div className="text-[12px]" style={{ color: SUBTLE }}>{pack.custom.summary}</div></td>
                  {order.map(ins => { const c = pack.custom!.insurers.find(i => i.insurer_name === ins && !i.variant); return <td key={ins} className="px-3 py-2 text-right tabular-nums" style={{ fontWeight: pack.custom!.best?.insurer_name === ins ? 600 : 400 }}>{c ? money(c.net, { dp: 0 }) : '—'}</td> })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="m-0 mb-1 text-[16px] font-medium">Premium by change</h2>
        <p className="m-0 mb-4 text-[13px]" style={{ color: MUTED }}>A cross per insurer; the line joins the lowest premium for each change.</p>
        <Chart pack={{ ...pack, rungs: pack.rungs.map(r => ({ ...r, name: SHORT[r.key] ?? r.name })) }} employees={pack.employees} />
      </section>

      <ul className="m-0 mt-6 pl-4 text-[12.5px]" style={{ color: MUTED }}>{pack.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
    </>
  )
}


/**
 * Nathan's layout (TRS EB Package Calculator): one column per insurer; per cover, the plan that
 * insurer sells for the current cover and its premium; then totals, the change against last
 * year, and what the hospital, outpatient and dental plans give, from the brochure facts.
 */
function PlansAndPremium({ pack, order, curOf, isCurrentInsurer, lowest }: { pack: AnalysisPack; order: string[]; curOf: (ins: string) => AnalysisInsurer | null; isCurrentInsurer: (ins: string) => boolean; lowest: string | undefined }) {
  const cols = order.map(ins => { const c = curOf(ins)!; const byCover: Partial<Record<LastYearCover, number>> = {}; for (const [k, v] of Object.entries(c.by_product ?? {})) { const cv = coverOfProduct(k); if (cv) byCover[cv] = (byCover[cv] ?? 0) + v } return { ins, c, plan: pack.currentPlans?.[c.rate_table_id] ?? null, byCover } })
  const covers = LAST_YEAR_COVERS.filter(cv => cols.some(x => x.byCover[cv] != null))
  const ly = pack.lastYear ? (pack.lastYear.total ?? null) : null
  const gross = pack.lastYear?.gst === 'included'
  const cell = 'px-3 py-2 text-right tabular-nums align-top'
  const pc = (n: number) => `${n > 0 ? '+' : n < 0 ? '\u2212' : ''}${Math.abs(n * 100).toFixed(1)}%`
  const ward = (g: CurrentPlan['ghs']) => !g ? '\u2014' : `${g.hospital === 'government' ? 'Government' : g.hospital === 'private' ? 'Private' : ''} ${g.beds ? `${g.beds}-bed` : ''}`.trim() || '\u2014'
  const limit = (g: CurrentPlan['ghs']) => !g || g.limit == null ? '\u2014' : `${money(g.limit, { dp: 0 })} ${g.kind === 'annual' ? 'a year' : g.kind === 'per_disability' ? 'per disability' : ''}`.trim()
  const head = (ins: string, c: AnalysisInsurer) => <th key={ins} className="px-3 py-2 text-right" style={{ color: c.excluded ? SUBTLE : INK }}>{shortInsurer(ins)}{isCurrentInsurer(ins) ? <div className="text-[11.5px] font-normal" style={{ color: MUTED }}>current, renewal card</div> : null}{c.excluded ? <div className="text-[11.5px] font-normal">ruled out</div> : null}</th>
  return (
    <section className="mt-8" aria-labelledby="plans-premium">
      <h2 id="plans-premium" className="m-0 mb-3 text-[16px] font-medium">Plans and premium</h2>
      <div className="overflow-x-auto">
        <table className="trs-table w-full text-[13px]" style={{ borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr><th className="text-left px-3 py-2">Cover</th>{cols.map(x => head(x.ins, x.c))}</tr></thead>
          <tbody>
            {covers.map(cv => (
              <tr key={cv} style={{ borderTop: `1px solid ${HAIR}` }}>
                <td className="px-3 py-2 align-top">{LAST_YEAR_COVER_WORD[cv]}</td>
                {cols.map(x => (
                  <td key={x.ins} className={cell} style={{ color: x.c.excluded ? SUBTLE : INK }}>
                    {x.byCover[cv] != null ? money(x.byCover[cv]!, { dp: 0 }) : '\u2014'}
                    {x.plan?.plans[cv] && <div className="text-[11.5px]" style={{ color: SUBTLE }}>{x.plan.plans[cv]}</div>}
                  </td>
                ))}
              </tr>
            ))}
            <tr style={{ borderTop: `1px solid ${HAIR}`, fontWeight: 600 }}><td className="px-3 py-2">Total, net of GST</td>{cols.map(x => <td key={x.ins} className={cell} style={{ color: x.c.excluded ? SUBTLE : INK, fontWeight: x.ins === lowest ? 700 : 600 }}>{money(x.c.net, { dp: 0 })}</td>)}</tr>
            <tr style={{ borderTop: `1px solid ${HAIR}` }}><td className="px-3 py-2">With GST</td>{cols.map(x => <td key={x.ins} className={cell}>{money(x.c.total, { dp: 0 })}</td>)}</tr>
            {ly != null && ly > 0 && <tr style={{ borderTop: `1px solid ${HAIR}` }}><td className="px-3 py-2">Against last year</td>{cols.map(x => { const d = ((gross ? x.c.total : x.c.net) - ly) / ly; return <td key={x.ins} className={cell} style={{ color: Math.abs(d) < 0.0005 ? MUTED : d > 0 ? '#a1242f' : '#1f7a3a' }}>{pc(d)}</td> })}</tr>}
            <tr style={{ borderTop: `1px solid ${HAIR}` }}><td className="px-3 py-2">Per employee a month</td>{cols.map(x => <td key={x.ins} className={cell}>{pepm(x.c.net, pack.employees)}</td>)}</tr>
            {cols.some(x => x.c.unpriced) && <tr style={{ borderTop: `1px solid ${HAIR}` }}><td className="px-3 py-2">Lines not priced</td>{cols.map(x => <td key={x.ins} className={cell}>{x.c.unpriced || '\u2014'}</td>)}</tr>}
            {pack.currentPlans && (<>
              <tr style={{ borderTop: `1px solid ${HAIR}` }}><td className="px-3 pt-4 pb-1 text-[12px] font-semibold" style={{ color: MUTED }} colSpan={cols.length + 1}>What the plans give</td></tr>
              <tr style={{ borderTop: `1px solid ${HAIR}` }}><td className="px-3 py-2">Hospital limit</td>{cols.map(x => <td key={x.ins} className={cell}>{limit(x.plan?.ghs ?? null)}</td>)}</tr>
              <tr style={{ borderTop: `1px solid ${HAIR}` }}><td className="px-3 py-2">Ward</td>{cols.map(x => <td key={x.ins} className={cell}>{ward(x.plan?.ghs ?? null)}</td>)}</tr>
              <tr style={{ borderTop: `1px solid ${HAIR}` }}><td className="px-3 py-2">Co-insurance</td>{cols.map(x => <td key={x.ins} className={cell}>{x.plan?.ghs ? `${x.plan.ghs.coins}%` : '\u2014'}</td>)}</tr>
              <tr style={{ borderTop: `1px solid ${HAIR}` }}><td className="px-3 py-2">GP co-pay</td>{cols.map(x => <td key={x.ins} className={cell}>{x.plan?.gopcCopay == null ? '\u2014' : x.plan.gopcCopay === 0 ? 'None' : money(x.plan.gopcCopay, { dp: 0 })}</td>)}</tr>
              <tr style={{ borderTop: `1px solid ${HAIR}` }}><td className="px-3 py-2">Specialist limit</td>{cols.map(x => <td key={x.ins} className={cell}>{x.plan?.goscLimit != null ? money(x.plan.goscLimit, { dp: 0 }) : '\u2014'}</td>)}</tr>
              <tr style={{ borderTop: `1px solid ${HAIR}` }}><td className="px-3 py-2">Dental limit</td>{cols.map(x => <td key={x.ins} className={cell}>{x.plan?.gdLimit == null ? '\u2014' : x.plan.gdLimit < 100 ? 'Schedule of allowances' : money(x.plan.gdLimit, { dp: 0 })}</td>)}</tr>
            </>)}
          </tbody>
        </table>
      </div>
    </section>
  )
}
