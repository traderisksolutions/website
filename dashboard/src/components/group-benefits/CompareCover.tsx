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
 * Plan rules (Employment Benefits › Plan rules, src/lib/gb/plan-pairs.ts) hold plans that go together.
 * The client report is this page as a PDF (src/lib/gb/compare-report.ts): downloaded, sent on
 * WhatsApp as a signed link, or put on the client thread as an email draft with it attached.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { Btn, Segmented, Spinner } from '@/components/crm/primitives'
import { fmtDate, money } from '@/lib/format'
import { amountOf, changeOf, coverWords, hospitalParts, type Change } from '@/lib/gb/compare-words'
import { allowedPlans, applyRules, permutations, ruleFor } from '@/lib/gb/plan-pairs'
import type { CompareData, Picks } from '@/lib/gb/compare-cover'

const COVERS = ['Hospital & Surgical', 'Major Medical', 'Outpatient GP', 'Outpatient Specialist', 'Dental', 'Personal Accident']
const INK = '#0f1412', MUTED = '#4a5550', SUBTLE = '#8c958f', LINE = '#e6e8e4', FIELD = '#f2f3ef', TODAY = '#f3f7f4', UP = '#1d6b3f', DOWN = '#a3361f'
type Data = CompareData & { company: string | null }
const TODAY_COL = '__today__'
/** The insurer's own member file, for placement (src/app/api/group-benefits/quote/[id]/insurer-form). */
const ENROLMENT: Record<string, 'income' | 'rcc'> = { 'Income FlexCare': 'income', 'RCC Enhanced III': 'rcc' }

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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<Record<string, Picks> | null>(null)
  const [sending, setSending] = useState<'pdf' | 'whatsapp' | 'email' | null>(null)
  const [sent, setSent] = useState<{ text: string; href?: string } | null>(null)

  /** Choices not yet saved go first, so the report is what is on screen. */
  async function flush() {
    if (!pending.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const next = pending.current; pending.current = null
    await fetch(`/api/group-benefits/quote/${id}/compare`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ picks: next }) }).catch(() => {})
  }

  async function report(action: 'pdf' | 'whatsapp' | 'email') {
    setSending(action); setError(null); setSent(null)
    // Opened inside the click, so the browser does not block it; pointed at WhatsApp once the link exists.
    const tab = action === 'whatsapp' ? window.open('', '_blank') : null
    try {
      await flush()
      if (action === 'pdf') { window.location.href = `/api/group-benefits/quote/${id}/compare/report-pdf?download=1`; return }
      const res = await fetch(`/api/group-benefits/quote/${id}/compare/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const d = await res.json().catch(() => ({})) as { waUrl?: string; phone?: string | null; href?: string; to?: string; error?: string }
      if (!res.ok) { tab?.close(); setError(d.error ?? `The report was not sent (${res.status}).`); return }
      if (action === 'whatsapp' && d.waUrl) { if (tab) tab.location.href = d.waUrl; else window.open(d.waUrl, '_blank'); setSent({ text: d.phone ? `WhatsApp opened to +${d.phone} with the report link. Press send there.` : 'WhatsApp opened with the report link. Choose the chat and press send.' }) }
      if (action === 'email') setSent({ text: `Draft to ${d.to} with the report attached, on the client thread.`, href: d.href })
    } catch (e) { tab?.close(); setError(e instanceof Error ? e.message : 'The report was not sent.') }
    finally { setSending(null) }
  }

  const load = useCallback(() => fetch(`/api/group-benefits/quote/${id}/compare`, { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({})) as Data & { error?: string }
    if (!r.ok) { setError(d.error ?? `Compare could not load (${r.status})`); return }
    setData(d); setPicks(d.picks); setCat(c => d.categories.some(x => x.key === c) ? c : d.categories[0]?.key ?? '')
  }).catch(e => setError(e instanceof Error ? e.message : 'Compare could not load')), [id])
  useEffect(() => { void load() }, [load])

  const chooseMany = useCallback((product: string, patch: Record<string, string>) => {
    setPicks(prev => {
      const mine = applyRules(data?.rules ?? [], product, { ...prev[product]?.[cat], ...patch }, data?.options[product] ?? {})
      const next = { ...prev, [product]: { ...prev[product], [cat]: mine } }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      pending.current = next
      saveTimer.current = setTimeout(() => { pending.current = null; void fetch(`/api/group-benefits/quote/${id}/compare`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ picks: next }) }) }, 600)
      return next
    })
  }, [cat, id, data])
  const choose = useCallback((product: string, cover: string, plan: string) => chooseMany(product, { [cover]: plan }), [chooseMany])

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

  if (error && !data) return (
    <Shell company={null} id={id}>
      <p className="m-0 text-[14px]" style={{ color: DOWN }} role="alert">{error}</p>
      {/no census/i.test(error) && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={`/pricing-matrix/quote/${id}/edit`} data-same-tab className="inline-flex items-center h-9 px-4 rounded-[7px] text-[14px] font-medium no-underline" style={{ background: '#132c1c', color: 'white' }}>Add the census</Link>
          <Link href={`/pricing-matrix?tab=hrlinks&send=1&quote=${id}`} data-same-tab className="inline-flex items-center h-9 px-4 rounded-[7px] text-[14px] no-underline" style={{ border: `1px solid ${LINE}`, color: INK }}>Send HR a link</Link>
        </div>
      )}
    </Shell>
  )
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
      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Client report">
        <span className="text-[13px] mr-1" style={{ color: MUTED }}>Client report</span>
        <Btn size="sm" level="secondary" loading={sending === 'pdf'} disabled={!!sending} onClick={() => void report('pdf')}>Download PDF</Btn>
        <Btn size="sm" level="secondary" loading={sending === 'whatsapp'} disabled={!!sending} onClick={() => void report('whatsapp')}>Send on WhatsApp</Btn>
        <Btn size="sm" level="secondary" loading={sending === 'email'} disabled={!!sending} onClick={() => void report('email')}>Send by email</Btn>
        {sent && <span className="text-[13px]" style={{ color: INK }} role="status">{sent.text}{sent.href && <> <Link href={sent.href} className="underline" style={{ color: INK }}>Open draft</Link></>}</span>}
      </div>
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
                  {col === TODAY_COL ? <TodayPolicy data={data} id={id} />
                    : d == null ? null : Math.abs(d) < 1 ? <div className="text-[12.5px]" style={{ color: SUBTLE }}>same as today</div>
                    : <div className="text-[12.5px] font-medium tabular-nums" style={{ color: d > 0 ? DOWN : UP }}>{d > 0 ? '+' : '−'}{Math.abs(d / (todayTotal || 1) * 100).toFixed(1)}% · {signed(d)}</div>}
                  {data.categories.length > 1 && <div className="mt-1 text-[11.5px] tabular-nums" style={{ color: SUBTLE }}>{data.categories.map(c => { const ct = total(col, c.key); return ct != null ? <div key={c.key}>{c.name} {money(ct, { dp: 0 })}</div> : null })}</div>}
                  {col !== TODAY_COL && (
                    <div className="mt-2">
                      {drafted[col] ? <Link href={drafted[col]} className="text-[12.5px] underline" style={{ color: INK }}>Open draft</Link>
                        : <Btn size="xs" level="secondary" loading={drafting === col} disabled={!!drafting} onClick={() => draft(col)}>Draft email</Btn>}
                      {ENROLMENT[col] && <a href={`/api/group-benefits/quote/${id}/insurer-form?insurer=${ENROLMENT[col]}`} className="block mt-1.5 text-[12px] underline" style={{ color: MUTED }}>Enrolment file</a>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

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
                      const included = rule?.premium === 'included'
                      const priceText = (o: string) => { const op = data.prices[cat]?.[p]?.[cover]?.[o]; return included ? `in ${rule!.tiedTo} premium` : op != null ? `${money(op, { dp: 0 })}${tp != null ? ` (${signed(op - tp)})` : ''}` : 'not priced' }
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
                          <div className="text-[13px] font-medium tabular-nums">{plan ? (included ? `In ${rule!.tiedTo} premium` : pr != null ? money(pr, { dp: 0 }) : 'not priced') : '—'}
                            {!included && pr != null && tp != null && <span className="ml-2" style={{ color: pr - tp > 0 ? DOWN : UP }}>{signed(pr - tp)}</span>}
                            {!included && pr != null && tp ? <Tag c={{ text: `${pr >= tp ? '+' : '−'}${Math.abs(Math.round((pr - tp) / tp * 100))}%`, tone: pr > tp ? 'down' : pr < tp ? 'up' : 'same' }} /> : null}
                          </div>
                          {plan && <div className="text-[11.5px]" style={{ color: SUBTLE }}>{plan}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {cover === 'Hospital & Surgical' && <HospitalOptions data={data} cat={cat} picks={picks} todayPremium={(cv: string) => price(TODAY_COL, cat, cv)} onUse={chooseMany} />}
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

/** Today's source: last year's policy and its documents, and the way to the quotation's documents. */
function TodayPolicy({ data, id }: { data: Data; id: string }) {
  const t = data.today, pol = t.policy
  return (
    <div className="mt-0.5 flex flex-col gap-1 text-[12.5px]" style={{ color: SUBTLE }}>
      <div>{t.source === 'last_year' ? `last year${pol?.gstRemoved ? ', 9% GST taken off' : ''}` : t.source === 'renewal' ? 'renewal, same plans' : ''}</div>
      {pol?.policyNumber && <div>Policy {pol.policyNumber}{pol.periodFrom && pol.periodTo ? ` · ${fmtDate(pol.periodFrom)} to ${fmtDate(pol.periodTo)}` : ''}</div>}
      {pol?.sumMatches === false && <div style={{ color: DOWN }}>Cover premiums do not add up to the total</div>}
      {pol?.documents.map(d => d.href
        ? <a key={d.file} href={d.href} target="_blank" rel="noreferrer" className="underline truncate" style={{ color: INK }} title={d.file}>{d.file}</a>
        : <span key={d.file} className="truncate" title={`${d.file}: read, not kept`}>{d.file}</span>)}
      <div className="mt-1"><Link href={`/pricing-matrix/quote/${id}/edit`} data-same-tab className="text-[12.5px] underline" style={{ color: INK }}>{pol ? 'Census and policy' : "Add last year's policy"}</Link></div>
    </div>
  )
}

/**
 * Every hospital plan at one insurer with each way its tied covers go with it (Income's major
 * medical inside plans 2 to 5; RCC's and Singlife's as an optional rider on the same plan), priced
 * for the category and sorted by premium. Use sets the hospital plan and the riders together.
 */
function HospitalOptions({ data, cat, picks, todayPremium, onUse }: { data: Data; cat: string; picks: Record<string, Picks>; todayPremium: (cover: string) => number | null; onUse: (product: string, patch: Record<string, string>) => void }) {
  const H = 'Hospital & Surgical'
  const [p, setP] = useState<string>(data.products[0])
  const tied = data.rules.filter(r => r.product === p && r.tiedTo === H)
  const rows = permutations(data.rules, p, H, data.options[p] ?? {}).map(o => {
    const parts = [H, ...tied.map(r => r.cover)].map(cv => o[cv] ? data.prices[cat]?.[p]?.[cv]?.[o[cv]] ?? null : 0)
    const premium = parts.some(x => x == null) ? null : parts.reduce<number>((a, b) => a + (b ?? 0), 0)
    const base = [H, ...tied.map(r => r.cover)].reduce<number | null>((a, cv) => { const v = todayPremium(cv); return a == null && v == null ? null : (a ?? 0) + (v ?? 0) }, null)
    return { o, premium, delta: premium != null && base != null && base > 0 ? premium - base : null }
  }).sort((a, b) => (a.premium ?? Infinity) - (b.premium ?? Infinity))
  const now = picks[p]?.[cat] ?? {}
  const isNow = (o: Record<string, string>) => Object.keys(o).every(k => (now[k] ?? '') === o[k])
  const words = (cv: string, plan: string) => coverWords(cv, plan, data.benefits[`${p}|${cv}|${plan}`] ?? {})
  return (
    <div className="py-4" style={{ borderBottom: `1px solid ${LINE}` }}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h3 className="m-0 text-[15px] font-medium">Hospital options · {rows.length}</h3>
        <Segmented size="xs" label="Insurer" value={p} onChange={setP} options={data.products.map(x => ({ value: x, label: x }))} />
      </div>
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-white"><tr className="text-left text-[12px]" style={{ color: SUBTLE }}>
            <th className="py-1.5 pr-3 font-normal">Ward</th><th className="py-1.5 pr-3 font-normal">Limit</th>
            {tied.map(r => <th key={r.cover} className="py-1.5 pr-3 font-normal">{r.cover}</th>)}
            <th className="py-1.5 pr-3 font-normal text-right">Premium</th><th className="py-1.5 pr-3 font-normal text-right">Against today</th><th />
          </tr></thead>
          <tbody>
            {rows.map(({ o, premium, delta }) => {
              const h = hospitalParts(data.benefits[`${p}|${H}|${o[H]}`] ?? {})
              const on = isNow(o)
              return (
                <tr key={JSON.stringify(o)} style={{ borderTop: `1px solid ${LINE}`, background: on ? TODAY : undefined }}>
                  <td className="py-1.5 pr-3">{h.ward || o[H]}</td>
                  <td className="py-1.5 pr-3">{h.limit}</td>
                  {tied.map(r => <td key={r.cover} className="py-1.5 pr-3">{o[r.cover] ? `${words(r.cover, o[r.cover])}${r.premium === 'included' ? ' (in hospital premium)' : ''}` : 'None'}</td>)}
                  <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{premium != null ? money(premium, { dp: 0 }) : 'not priced'}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums" style={{ color: delta == null ? SUBTLE : delta > 0 ? DOWN : UP }}>{delta != null ? signed(delta) : '—'}</td>
                  <td className="py-1.5 text-right">{on ? <span className="text-[12px]" style={{ color: MUTED }}>Chosen</span> : <Btn size="xs" level="tertiary" onClick={() => onUse(p, o)}>Use</Btn>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
