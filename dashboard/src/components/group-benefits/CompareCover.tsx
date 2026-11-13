'use client'

/**
 * Compare cover (Jarod, 13 Nov 2026, after apple.com/iphone/compare): today's plan, then the five
 * products in fixed columns. Each cover is chosen by what it pays and what it costs against today;
 * every benefit row from the brochures follows, each tagged with its change against today. The
 * header (product, total, change) stays pinned. Prices come with the page: a change of choice adds
 * stored prices, nothing is recomputed. Choices save to the quotation; Draft email writes the
 * client email for one product from them.
 *
 * Today is last year's policy (Ernest, 13 Nov 2026): added here, kept in Drive and linked, its cover
 * as rows and its premium as the base. A hospital plan is chosen in two steps, ward then limit.
 * Plan rules from Settings (src/lib/gb/plan-pairs.ts) hold plans that go together.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { Btn, Segmented, Spinner } from '@/components/crm/primitives'
import { fmtDate, money } from '@/lib/format'
import { amountOf, changeOf, coverWords, hospitalParts, type Change } from '@/lib/gb/compare-words'
import { allowedPlans, applyRules, ruleFor } from '@/lib/gb/plan-pairs'
import type { CompareData, Picks } from '@/lib/gb/compare-cover'

const COVERS = ['Hospital & Surgical', 'Major Medical', 'Outpatient GP', 'Outpatient Specialist', 'Dental', 'Personal Accident']
const INK = '#0f1412', MUTED = '#4a5550', SUBTLE = '#8c958f', LINE = '#e6e8e4', FIELD = '#f2f3ef', TODAY = '#f3f7f4', UP = '#1d6b3f', DOWN = '#a3361f'
type Data = CompareData & { company: string | null }
const TODAY_COL = '__today__'

function Tag({ c }: { c: Change | null }) {
  if (!c) return null
  return <span className="ml-2 inline-block rounded-[6px] px-1.5 text-[11.5px] font-medium tabular-nums" style={{ background: FIELD, color: c.tone === 'up' ? UP : c.tone === 'down' ? DOWN : SUBTLE }}>{c.text}</span>
}
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${money(Math.abs(n), { dp: 0 })}`

export function CompareCover({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picks, setPicks] = useState<Record<string, Picks>>({})
  const [cat, setCat] = useState<string>('')
  const [drafting, setDrafting] = useState<string | null>(null)
  const [drafted, setDrafted] = useState<Record<string, string>>({})
  const [shown, setShown] = useState<{ product: string; subject: string; body: string; note?: string } | null>(null)
  const [reading, setReading] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(() => fetch(`/api/group-benefits/quote/${id}/compare`, { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({})) as Data & { error?: string }
    if (!r.ok) { setError(d.error ?? `Compare could not load (${r.status})`); return }
    setData(d); setPicks(d.picks); setCat(c => d.categories.some(x => x.key === c) ? c : d.categories[0]?.key ?? '')
  }).catch(e => setError(e instanceof Error ? e.message : 'Compare could not load')), [id])
  useEffect(() => { void load() }, [load])

  async function addPolicy(files: FileList | null) {
    if (!files?.length) return
    setReading(true); setError(null)
    try {
      const fd = new FormData()
      for (const f of Array.from(files)) fd.append('files', f)
      const res = await fetch(`/api/group-benefits/quote/${id}/last-year`, { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { setError(d.error ?? (res.status === 413 ? 'The files are over 4 MB together. Add them one at a time.' : `Last year's policy could not be read (${res.status}).`)); return }
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : "Last year's policy could not be read.") }
    finally { setReading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const choose = useCallback((product: string, cover: string, plan: string) => {
    setPicks(prev => {
      const mine = applyRules(data?.rules ?? [], product, { ...prev[product]?.[cat], [cover]: plan }, data?.options[product] ?? {})
      const next = { ...prev, [product]: { ...prev[product], [cat]: mine } }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => { void fetch(`/api/group-benefits/quote/${id}/compare`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ picks: next }) }) }, 600)
      return next
    })
  }, [cat, id, data])

  const cols = useMemo(() => data ? [TODAY_COL, ...data.products] : [], [data])
  const pickOf = useCallback((col: string, c: string, cover: string) => !data ? '' : col === TODAY_COL ? data.today.picks[c]?.[cover] ?? '' : picks[col]?.[c]?.[cover] ?? '', [data, picks])
  const productOfCol = (col: string) => col === TODAY_COL ? data?.today.product ?? null : col
  const price = useCallback((col: string, c: string, cover: string): number | null => {
    if (col === TODAY_COL) return data?.today.premiums[c]?.[cover] ?? null
    const p = productOfCol(col); const plan = pickOf(col, c, cover)
    if (!data || !p || !plan) return null
    return data.prices[c]?.[p]?.[cover]?.[plan] ?? null
  }, [data, pickOf]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = useCallback((col: string, onlyCat?: string) => {
    if (!data) return null
    if (col === TODAY_COL) return onlyCat ? (data.categories.length === 1 ? data.today.total : null) : data.today.total
    let t = 0
    for (const c of data.categories) { if (onlyCat && c.key !== onlyCat) continue; for (const cv of COVERS) t += price(col, c.key, cv) ?? 0 }
    return t
  }, [data, price])

  async function draft(product: string) {
    setDrafting(product)
    try {
      const res = await fetch(`/api/group-benefits/quote/${id}/compare/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product, picks }) })
      const d = await res.json().catch(() => ({})) as { href?: string | null; subject?: string; body?: string; note?: string; error?: string }
      if (!res.ok || !d.body) { setError(d.error ?? `The draft was not written (${res.status})`); return }
      if (d.href) setDrafted(x => ({ ...x, [product]: d.href! }))
      setShown({ product, subject: d.subject ?? '', body: d.body, note: d.href ? 'Saved as a draft on the client thread.' : d.note ?? 'No client thread on this quotation: copy the email.' })
    } finally { setDrafting(null) }
  }

  if (error && !data) return <Shell company={null} id={id}><p className="m-0 text-[14px]" style={{ color: DOWN }} role="alert">{error}</p></Shell>
  if (!data) return <Shell company={null} id={id}><Spinner label="Pricing every plan…" /></Shell>

  const todayTotal = total(TODAY_COL)
  const product = (col: string) => productOfCol(col)
  const benefitsFor = (col: string, cover: string) => { if (col === TODAY_COL) return data.today.benefits[cat]?.[cover] ?? {}; const p = product(col); const plan = pickOf(col, cat, cover); return p && plan ? data.benefits[`${p}|${cover}|${plan}`] ?? {} : {} }
  const grid = 'grid grid-cols-6 gap-4'

  return (
    <Shell company={data.company} id={id}>
      <p className="m-0 mb-5 text-[13.5px]" style={{ color: MUTED }}>
        {data.lives} lives · {data.employees} employees · {data.basis === 'renewal' ? 'renewal' : 'new business'} from {data.effectiveDate}{data.leftOut ? ` · ${data.leftOut} foreign-worker lives not in this comparison` : ''}
      </p>
      {error && <p className="m-0 mb-3 text-[13px]" style={{ color: DOWN }} role="alert">{error}</p>}
      <div className="overflow-x-auto xl:overflow-x-visible">
        <div className="min-w-[1180px]">
          <div className={`${grid} sticky z-20 bg-white pt-2 pb-3`} style={{ top: 'var(--top-nav-h, 0px)', borderBottom: `1px solid ${LINE}`, boxShadow: '0 8px 12px -12px rgba(0,0,0,.25)' }}>
            {cols.map(col => {
              const t = total(col), d = t != null && todayTotal != null && col !== TODAY_COL ? t - todayTotal : null
              return (
                <div key={col} className="min-w-0">
                  <div className="rounded-[12px] px-3 py-2.5 text-[14px] font-semibold leading-tight" style={{ border: `1px solid ${LINE}`, background: col === TODAY_COL ? TODAY : 'white' }}>
                    {col === TODAY_COL ? <>Today<div className="text-[12px] font-normal" style={{ color: MUTED }}>{data.today.label === 'Today' ? <>&nbsp;</> : data.today.label}</div></> : <>{col}<div className="text-[12px] font-normal">&nbsp;</div></>}
                  </div>
                  <div className="mt-2.5 text-[21px] font-medium tabular-nums">{t != null ? money(t, { dp: 0 }) : '—'}</div>
                  <div className="text-[12px]" style={{ color: SUBTLE }}>{t != null ? `a year, net of GST · ${money(t / Math.max(1, data.lives), { dp: 0 })} a life` : col === TODAY_COL ? 'no premium on file' : ''}</div>
                  {col === TODAY_COL ? <TodayPolicy data={data} reading={reading} onAdd={() => fileRef.current?.click()} />
                    : d == null ? null : Math.abs(d) < 1 ? <div className="text-[12.5px]" style={{ color: SUBTLE }}>same as today</div>
                    : <div className="text-[12.5px] font-medium tabular-nums" style={{ color: d > 0 ? DOWN : UP }}>{d > 0 ? '+' : '−'}{Math.abs(d / (todayTotal || 1) * 100).toFixed(1)}% · {signed(d)}</div>}
                  {data.categories.length > 1 && <div className="mt-1 text-[11.5px] tabular-nums" style={{ color: SUBTLE }}>{data.categories.map(c => { const ct = total(col, c.key); return ct != null ? <div key={c.key}>{c.name} {money(ct, { dp: 0 })}</div> : null })}</div>}
                  {col !== TODAY_COL && (
                    <div className="mt-2">
                      {drafted[col] ? <Link href={drafted[col]} className="text-[12.5px] underline" style={{ color: INK }}>Open draft</Link>
                        : <Btn size="xs" level="secondary" loading={drafting === col} disabled={!!drafting} onClick={() => draft(col)}>Draft email</Btn>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <input ref={fileRef} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.xlsx,.xls,.xlsm,.csv" aria-label="Last year's policy files" onChange={e => void addPolicy(e.target.files)} />
          {shown && (
            <section className="mt-5 rounded-[12px] p-4" style={{ border: `1px solid ${LINE}` }} aria-label={`Email for ${shown.product}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="m-0 text-[15px] font-semibold">{shown.subject}</h2>
                <div className="flex gap-2">
                  <Btn size="xs" level="secondary" onClick={() => { void navigator.clipboard?.writeText(`${shown.subject}\n\n${shown.body}`).catch(() => {}) }}>Copy</Btn>
                  <Btn size="xs" level="secondary" onClick={() => setShown(null)}>Close</Btn>
                </div>
              </div>
              <p className="m-0 mt-1 text-[12.5px]" style={{ color: MUTED }}>{shown.note}</p>
              <pre className="m-0 mt-3 whitespace-pre-wrap text-[13.5px] font-sans" style={{ color: INK }}>{shown.body}</pre>
            </section>
          )}

          {data.categories.length > 1 && (
            <div className="mt-5"><Segmented size="sm" label="Category" value={cat} onChange={setCat} options={data.categories.map(c => ({ value: c.key, label: `${c.name} · ${c.lives}` }))} /></div>
          )}

          {COVERS.map(cover => {
            const ids = Object.keys(data.labels).filter(k => data.labels[k][0] === cover)
            const today = benefitsFor(TODAY_COL, cover)
            const payer = (label: string) => /co-?pay|co-?insur/i.test(label)
            return (
              <section key={cover} className="mt-9">
                <h2 className="m-0 pb-2.5 text-[22px] font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>{cover}</h2>
                <div className="py-3.5" style={{ borderBottom: `1px solid ${LINE}` }}>
                  <div className="mb-1.5 text-[12px]" style={{ color: SUBTLE }}>Cover chosen</div>
                  <div className={grid}>
                    {cols.map(col => {
                      const pr = price(col, cat, cover); const tp = price(TODAY_COL, cat, cover)
                      if (col === TODAY_COL) {
                        const tb = benefitsFor(TODAY_COL, cover)
                        return (
                          <div key={col} className="min-w-0">
                            <div className="text-[13px]" style={{ color: INK }}>{Object.keys(tb).length ? coverWords(cover, 'today', tb) : 'None'}</div>
                            <div className="text-[13px] font-medium tabular-nums">{pr != null ? money(pr, { dp: 0 }) : '—'}</div>
                          </div>
                        )
                      }
                      const p = col; const plan = pickOf(col, cat, cover)
                      const opts = data.options[p]?.[cover] ?? []
                      if (!opts.length) return <div key={col} className="min-w-0 text-[13px]" style={{ color: SUBTLE }}>Not sold</div>
                      const rule = ruleFor(data.rules, p, cover)
                      const allowed = rule ? allowedPlans(rule, pickOf(col, cat, rule.tiedTo), opts) : opts
                      const b = (o: string) => data.benefits[`${p}|${cover}|${o}`] ?? {}
                      const priceText = (o: string) => { const op = data.prices[cat]?.[p]?.[cover]?.[o]; return op != null ? `${money(op, { dp: 0 })}${tp != null ? ` (${signed(op - tp)})` : ''}` : 'not priced' }
                      return (
                        <div key={col} className="min-w-0">
                          {cover === 'Hospital & Surgical' ? <HospitalPicker col={col} plan={plan} opts={opts} b={b} priceText={priceText} onChange={v => choose(col, cover, v)} />
                            : (
                              <select id={`pick-${col}-${cover}`} aria-label={`${cover} at ${col}`} value={plan} disabled={!!rule && allowed.length <= 1 && rule.required} onChange={e => choose(col, cover, e.target.value)}
                                className="w-full rounded-[9px] border-0 px-2.5 py-2 text-[12.5px] font-medium cursor-pointer disabled:cursor-default" style={{ background: FIELD, color: INK }}>
                                {(!rule || !rule.required || !allowed.length) && <option value="">None</option>}
                                {allowed.map(o => <option key={o} value={o}>{coverWords(cover, o, b(o))} · {priceText(o)}</option>)}
                              </select>
                            )}
                          {rule && <div className="mt-1 text-[11.5px]" style={{ color: SUBTLE }}>Tied to {rule.tiedTo}{rule.match === 'same_plan' ? ', same plan' : ''}</div>}
                          <div className="mt-2 text-[13px]" style={{ color: INK }}>{coverWords(cover, plan, b(plan))}</div>
                          <div className="text-[13px] font-medium tabular-nums">{plan ? (pr != null ? money(pr, { dp: 0 }) : 'not priced') : '—'}
                            {pr != null && tp != null && <span className="ml-2" style={{ color: pr - tp > 0 ? DOWN : UP }}>{signed(pr - tp)}</span>}
                            {pr != null && tp ? <Tag c={{ text: `${pr >= tp ? '+' : '−'}${Math.abs(Math.round((pr - tp) / tp * 100))}%`, tone: pr > tp ? 'down' : pr < tp ? 'up' : 'same' }} /> : null}
                          </div>
                          {plan && <div className="text-[11.5px]" style={{ color: SUBTLE }}>{plan}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {ids.map(bid => {
                  const vals = cols.map(col => benefitsFor(col, cover)[bid] ?? '—')
                  if (vals.every(v => v === '—')) return null
                  const label = data.labels[bid][1]
                  return (
                    <div key={bid} className="py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
                      <div className="mb-1 text-[12px]" style={{ color: SUBTLE }}>{label}</div>
                      <div className={grid}>
                        {vals.map((v, k) => <div key={cols[k]} className="min-w-0 text-[13.5px]">{v.replace(/(^|[^S])\$/g, '$1S$')}{k > 0 && today[bid] !== undefined ? <Tag c={changeOf(v, vals[0], payer(label))} /> : null}</div>)}
                      </div>
                    </div>
                  )
                })}
              </section>
            )
          })}
          {data.notes.length > 0 && <ul className="mt-8 pl-5 text-[12.5px]" style={{ color: MUTED }}>{data.notes.map(n => <li key={n}>{n}</li>)}</ul>}
          <p className="mt-3 text-[12px]" style={{ color: SUBTLE }}>Rates and benefits: {data.workbook.name}, read {data.workbook.readAt.slice(0, 10)}.</p>
        </div>
      </div>
    </Shell>
  )
}

/** Today's source: last year's policy, its documents, and the button that adds or replaces it. */
function TodayPolicy({ data, reading, onAdd }: { data: Data; reading: boolean; onAdd: () => void }) {
  const t = data.today, pol = t.policy
  return (
    <div className="mt-0.5 flex flex-col gap-1 text-[12.5px]" style={{ color: SUBTLE }}>
      <div>{t.source === 'last_year' ? `last year${pol?.gstRemoved ? ', 9% GST taken off' : ''}` : t.source === 'renewal' ? 'renewal, same plans' : ''}</div>
      {pol?.policyNumber && <div>Policy {pol.policyNumber}{pol.periodFrom && pol.periodTo ? ` · ${fmtDate(pol.periodFrom)} to ${fmtDate(pol.periodTo)}` : ''}</div>}
      {pol?.sumMatches === false && <div style={{ color: DOWN }}>Cover premiums do not add up to the total</div>}
      {pol?.documents.map(d => d.href
        ? <a key={d.file} href={d.href} target="_blank" rel="noreferrer" className="underline truncate" style={{ color: INK }} title={d.file}>{d.file}</a>
        : <span key={d.file} className="truncate" title={`${d.file}: read, not kept`}>{d.file}</span>)}
      <div className="mt-1">
        {reading ? <Spinner label="Reading the policy…" /> : <Btn size="xs" level="secondary" onClick={onAdd}>{pol ? 'Replace policy' : "Add last year's policy"}</Btn>}
      </div>
    </div>
  )
}

/** A hospital plan in two steps: the ward, then the limit within it. */
function HospitalPicker({ col, plan, opts, b, priceText, onChange }: { col: string; plan: string; opts: string[]; b: (o: string) => Record<string, string>; priceText: (o: string) => string; onChange: (plan: string) => void }) {
  const wardOf = (o: string) => hospitalParts(b(o)).ward || o
  const limitOf = (o: string) => hospitalParts(b(o)).limit || o
  const wards = [...new Set(opts.map(wardOf))]
  const ward = plan ? wardOf(plan) : ''
  const inWard = opts.filter(o => wardOf(o) === ward)
  const pickWard = (w: string) => {
    if (!w) { onChange(''); return }
    const cands = opts.filter(o => wardOf(o) === w)
    // The same limit in the new ward, else the nearest one.
    const limit = (o: string) => amountOf(b(o)['ghs.annual_limit']) ?? 0
    const gap = (o: string) => plan ? Math.abs(Math.log((Math.min(limit(o), 1e7) + 1) / (Math.min(limit(plan), 1e7) + 1))) : 0
    const same = cands.find(o => limitOf(o) === limitOf(plan))
    const near = [...cands].sort((x, y) => gap(x) - gap(y))[0]
    onChange(same ?? near ?? cands[0])
  }
  const cls = 'w-full rounded-[9px] border-0 px-2.5 py-2 text-[12.5px] font-medium cursor-pointer disabled:cursor-default'
  return (
    <div className="flex flex-col gap-1.5">
      <select id={`ward-${col}`} aria-label={`Ward at ${col}`} value={ward} onChange={e => pickWard(e.target.value)} className={cls} style={{ background: FIELD, color: INK }}>
        <option value="">None</option>
        {wards.map(w => <option key={w} value={w}>{w}</option>)}
      </select>
      <select id={`limit-${col}`} aria-label={`Limit at ${col}`} value={plan} disabled={!ward} onChange={e => onChange(e.target.value)} className={cls} style={{ background: FIELD, color: INK }}>
        {!ward && <option value="">—</option>}
        {inWard.map(o => <option key={o} value={o}>{limitOf(o)} · {priceText(o)}</option>)}
      </select>
    </div>
  )
}

function Shell({ company, id, children }: { company: string | null; id: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1560px] px-6 sm:px-10 pt-8 pb-20">
        <Breadcrumbs className="mb-4" current={{ label: `${company ?? 'Quotation'} · compare`, href: `/pricing-matrix/quote/${id}/compare` }} fallback={{ label: 'Employment Benefits', href: '/pricing-matrix' }} />
        <div className="flex items-end justify-between gap-4 flex-wrap mb-2">
          <h1 className="m-0 text-[32px] font-medium tracking-[-0.02em]">{company ?? 'Compare cover'}</h1>
          <div className="flex items-center gap-4">
            <Link href={`/pricing-matrix/quote/${id}/analysis`} data-same-tab className="text-[13px] underline" style={{ color: MUTED }}>One change at a time</Link>
            <Link href={`/pricing-matrix/quote/${id}/plans`} data-same-tab className="inline-flex items-center h-9 px-4 rounded-[7px] text-[14px] font-medium no-underline" style={{ background: '#132c1c', color: 'white' }}>Ask insurers</Link>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
