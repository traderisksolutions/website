'use client'

/**
 * Employment Benefits quotation (Jarod, 17 Nov 2026): one page, three steps.
 *
 * Census: the client's spreadsheet from the thread (or uploaded), read in full; employees counted
 * apart from spouses and children, by the census category column. Up to four categories are priced.
 *
 * Cover design: categories down, covers across, the category column fixed. Each cell opens on one
 * tier below what the category holds today (read from the census plan), today itself second, any
 * other tier from the list.
 *
 * Premiums: one table per category, most senior first, then a total. Every product priced from the
 * house workbook (src/lib/gb/eb-quote.ts); each cover's heading carries its premium; each product's
 * plan can be changed per cover, plan rules applied. The first two columns stay in place.
 */
import { useEffect, useMemo, useState } from 'react'
import { Btn, Field, inputCls, Segmented, Spinner } from '@/components/crm/primitives'
import { CompanyField, type CompanyPick } from '@/components/group-benefits/CompanyField'
import { fmtDate } from '@/lib/format'
import type { Member } from '@/lib/gb-quote'
import type { SheetRead } from '@/lib/gb/census-parse'
import { applyRules } from '@/lib/gb/plan-pairs'
import { categoryTotal, censusCategories, lowerTier, MAX_CATEGORIES, startDesign, TIERS, type CensusCategory, type CoverKey, type Design, type Priced, type PricedCategory } from '@/lib/gb/eb-quote'

type Source = { attachment_id: string; filename: string; at: string; subject: string | null }
type Picks = Record<string, Record<string, Record<CoverKey, string>>>   // category → product → cover → plan

const INK = '#0f1412', MUTED = '#4a5550', SUBTLE = '#8c958f', LINE = '#e6e8e4', LINE2 = '#d5d9d4', BAND = '#f0f2ee', FIELD = '#f1f2ee', GREEN = '#132c1c', SOFT = '#edf7e8', TODAY = '#f3f7f4', UP = '#1d6b3f', DOWN = '#a3361f'
const INSURERS = ['', 'QBE (Steadfast MCare+)', 'Raffles Health (RCC Enhanced III)', 'Income (FlexCare)', 'Singlife (MyBenefits Plus)', 'AIA (Flexi Vital Care Plus)', 'Other insurer']
const NOT_KNOWN = 'Not on the census'
const f0 = (n: number) => Math.round(n).toLocaleString('en-SG')
const nextMonthFirst = () => { const t = new Date(Date.now() + 8 * 3600_000); const y = t.getUTCMonth() === 11 ? t.getUTCFullYear() + 1 : t.getUTCFullYear(); return `${y}-${String((t.getUTCMonth() + 1) % 12 + 1).padStart(2, '0')}-01` }

function Against({ v, today }: { v: number | null; today: number | null }) {
  if (v == null || today == null) return <span style={{ color: SUBTLE }}>—</span>
  const d = Math.round(v - today)
  if (d === 0) return <span style={{ color: SUBTLE }}>Same premium</span>
  return <span style={{ color: d < 0 ? UP : DOWN }}>S${f0(Math.abs(d))} {d < 0 ? 'less' : 'more'}</span>
}

export function EbQuotation({ threadId }: { threadId: string | null }) {
  const [pick, setPick] = useState<CompanyPick>({ id: null, name: '' })
  const [sources, setSources] = useState<Source[]>([])
  const [current, setCurrent] = useState('')
  const [file, setFile] = useState<{ name: string; upload?: File; attachmentId?: string } | null>(null)
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState<{ wrong: boolean } | null>(null)
  const [members, setMembers] = useState<Member[] | null>(null)
  const [reading, setReading] = useState(false)
  const [included, setIncluded] = useState<string[]>([])
  const [designs, setDesigns] = useState<Record<string, Design>>({})
  const [effDate, setEffDate] = useState(nextMonthFirst())
  const [basis, setBasis] = useState<'renewal' | 'new_business'>('renewal')
  const [priced, setPriced] = useState<Priced | null>(null)
  const [picks, setPicks] = useState<Picks>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!threadId && !pick.id) return
    const q = new URLSearchParams(); if (threadId) q.set('thread', threadId); if (pick.id) q.set('company', pick.id)
    let cancelled = false
    fetch(`/api/group-benefits/census/sources?${q}`, { cache: 'no-store' }).then(r => r.json()).then((d: { sources?: Source[]; companyId?: string | null; companyName?: string | null; currentInsurer?: string | null }) => {
      if (cancelled) return
      setSources(d.sources ?? [])
      if (d.companyName) setPick(p => p.name ? p : { id: d.companyId ?? null, name: d.companyName! })
      if (d.currentInsurer) setCurrent(c => c || INSURERS.find(i => i && i.toLowerCase().includes(d.currentInsurer!.toLowerCase().split(' ')[0])) || 'Other insurer')
    }).catch(() => {})
    return () => { cancelled = true }
  }, [threadId, pick.id])

  const cats: CensusCategory[] = useMemo(() => members ? censusCategories(members) : [], [members])
  const chosen = cats.filter(c => included.includes(c.name))

  async function readCensus(src: { name: string; upload?: File; attachmentId?: string }, pw?: string) {
    setReading(true); setError(null); setFile(src); setPriced(null)
    try {
      let res: Response
      if (src.upload) { const fd = new FormData(); fd.append('file', src.upload); if (pw) fd.append('password', pw); res = await fetch('/api/group-benefits/census/read', { method: 'POST', body: fd }) }
      else res = await fetch('/api/group-benefits/census/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachment_id: src.attachmentId, password: pw || undefined }) })
      const d = await res.json().catch(() => ({})) as { sheets?: SheetRead[]; needsPassword?: boolean; wrongPassword?: boolean; passwordHint?: string | null; error?: string }
      if (d.needsPassword) { setNeedsPassword({ wrong: !!d.wrongPassword }); if (d.passwordHint && !pw) setPassword(d.passwordHint); return }
      if (!res.ok || !d.sheets) { setError(d.error ?? `The census could not be read (${res.status}).`); return }
      setNeedsPassword(null)
      const ms = d.sheets.flatMap(s => s.members)
      if (!ms.length) { setError('No people were read from this file. Check it is the census.'); return }
      const read = censusCategories(ms)
      setMembers(ms)
      setIncluded(read.slice(0, MAX_CATEGORIES).map(c => c.name))
      setDesigns(Object.fromEntries(read.map(c => [c.name, startDesign(c.today)])))
    } catch (e) { setError(e instanceof Error ? e.message : 'The census could not be read.') }
    finally { setReading(false) }
  }

  function toggle(name: string, on: boolean) {
    setPriced(null)
    setIncluded(cur => on ? (cur.length >= MAX_CATEGORIES ? cur : cats.filter(c => cur.includes(c.name) || c.name === name).map(c => c.name)) : cur.filter(n => n !== name))
  }
  function setTier(cat: string, key: CoverKey, tier: number) { setPriced(null); setDesigns(d => ({ ...d, [cat]: { ...d[cat], [key]: tier } })) }

  async function generate() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/eb/price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        effective_date: effDate, basis, current_insurer: current && current !== 'Other insurer' ? current : null,
        categories: chosen.map(c => ({ name: c.name, members: c.members, design: designs[c.name], today: c.today })),
      }) })
      const d = await res.json().catch(() => ({})) as Priced & { error?: string }
      if (!res.ok || !d.categories) { setError(d.error ?? `The premiums were not worked out (${res.status}).`); return }
      setPriced(d)
      setPicks(Object.fromEntries(d.categories.map(c => [c.name, Object.fromEntries(d.products.map(p => [p, Object.fromEntries(TIERS.map(t => [t.key, c.products[p][t.key].pick]))]))])) as Picks)
      requestAnimationFrame(() => document.getElementById('eb-premiums')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (e) { setError(e instanceof Error ? e.message : 'The premiums were not worked out.') }
    finally { setBusy(false) }
  }

  function choose(cat: PricedCategory, product: string, key: CoverKey, plan: string) {
    if (!priced) return
    setPicks(cur => {
      const byCover = Object.fromEntries(TIERS.map(t => [t.cover, t.key === key ? plan : cur[cat.name][product][t.key]]))
      const options = Object.fromEntries(TIERS.map(t => [t.cover, cat.products[product][t.key].options.map(o => o.plan)]))
      const ruled = applyRules(priced.rules, product, byCover, options)
      return { ...cur, [cat.name]: { ...cur[cat.name], [product]: Object.fromEntries(TIERS.map(t => [t.key, ruled[t.cover] ?? ''])) as Record<CoverKey, string> } }
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <ol className="m-0 p-0 list-none flex flex-wrap gap-1.5" aria-label="Steps">
        {['Census', 'Cover design', 'Premiums'].map((s, i) => {
          const at = priced ? 2 : members ? 1 : 0
          return <li key={s}><span className="inline-flex items-center h-7 px-3 rounded-full text-[12.5px]" aria-current={i === at ? 'step' : undefined} style={{ background: i === at ? GREEN : i < at ? SOFT : FIELD, color: i === at ? 'white' : i < at ? GREEN : MUTED }}>{s}</span></li>
        })}
      </ol>

      <section className="flex flex-col gap-4" aria-labelledby="eb-census">
        <h2 id="eb-census" className="m-0 text-[17px] font-semibold">Census</h2>
        <div className="max-w-[560px]"><CompanyField value={pick} onChange={setPick} allowCreate listId="eb-company-options" /></div>
        <div className="flex flex-col gap-2 max-w-[760px]">
          {sources.length > 0 && <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Spreadsheets on {pick.name ? `${pick.name}'s` : 'this thread’s'} emails</p>}
          {sources.slice(0, 8).map(s => (
            <div key={s.attachment_id} className="flex items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-[13.5px]" style={{ border: `1px solid ${LINE}` }}>
              <span className="min-w-0"><span className="block truncate">{s.filename}</span><span className="block text-[12px]" style={{ color: MUTED }}>{fmtDate(s.at)}{s.subject ? ` · ${s.subject}` : ''}</span></span>
              <Btn size="sm" level={file?.attachmentId === s.attachment_id ? 'primary' : 'secondary'} loading={reading && file?.attachmentId === s.attachment_id} disabled={reading} onClick={() => void readCensus({ name: s.filename, attachmentId: s.attachment_id })}>{file?.attachmentId === s.attachment_id && members ? 'Read' : 'Use'}</Btn>
            </div>
          ))}
          <label htmlFor="eb-upload" className="flex items-center justify-center gap-2 rounded-[10px] px-4 py-4 cursor-pointer text-[13.5px]" style={{ background: FIELD, color: MUTED }}>
            {reading && file?.upload ? 'Reading every tab…' : 'Upload a census · .xlsx .xls .xlsm .csv'}
            <input id="eb-upload" type="file" accept=".xlsx,.xls,.xlsm,.csv" className="sr-only" disabled={reading} onChange={e => { const x = e.target.files?.[0]; if (x) void readCensus({ name: x.name, upload: x }); e.target.value = '' }} />
          </label>
          {needsPassword && file && (
            <div className="flex items-end gap-2 flex-wrap">
              <Field label={needsPassword.wrong ? 'That password does not open the file' : 'This file is password-protected'}>
                <input id="eb-password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="Password" />
              </Field>
              <Btn level="primary" onClick={() => void readCensus(file, password)} loading={reading}>Open</Btn>
            </div>
          )}
        </div>
        {error && <p className="m-0 text-[13.5px]" style={{ color: DOWN }} role="alert">{error}</p>}

        {members && (
          <div className="overflow-x-auto rounded-[10px]" style={{ border: `1px solid ${LINE}` }}>
            <table className="w-full text-[13.5px]" style={{ borderCollapse: 'collapse', minWidth: 760 }} aria-label="Census">
              <thead><tr style={{ background: BAND, color: MUTED }} className="text-[12px]">
                {['Census category', 'Employees', 'Spouses', 'Children', 'Lives', 'Plan on the census', 'In this quotation'].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i === 0 ? 'text-left sticky left-0' : 'text-center'}`} style={i === 0 ? { background: BAND } : undefined}>{h}</th>)}
              </tr></thead>
              <tbody>
                {cats.map((c, i) => {
                  const on = included.includes(c.name)
                  return (
                    <tr key={c.name} style={{ borderTop: `1px solid ${LINE}`, background: i % 2 ? '#f9faf8' : 'white' }}>
                      <td className="px-3 py-2 text-left sticky left-0 font-medium" style={{ background: i % 2 ? '#f9faf8' : 'white' }}>{c.name}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{c.employees}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{c.spouses}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{c.children}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{c.lives}</td>
                      <td className="px-3 py-2 text-center" style={{ color: c.plan ? INK : SUBTLE }}>{c.plan ?? 'Not on the census'}</td>
                      <td className="px-3 py-2 text-center"><input id={`eb-inc-${i}`} type="checkbox" checked={on} disabled={!on && included.length >= MAX_CATEGORIES} onChange={e => toggle(c.name, e.target.checked)} aria-label={`Include ${c.name}`} /></td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: `1px solid ${LINE2}` }} className="font-semibold">
                  <td className="px-3 py-2 text-left sticky left-0 bg-white">Total</td>
                  {(['employees', 'spouses', 'children', 'lives'] as const).map(k => <td key={k} className="px-3 py-2 text-center tabular-nums">{cats.reduce((a, c) => a + c[k], 0)}</td>)}
                  <td /><td className="px-3 py-2 text-center">{included.length} of {MAX_CATEGORIES}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {members && <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>{chosen.reduce((a, c) => a + c.employees, 0)} employees in this quotation · spouses and children not counted as headcount</p>}
      </section>

      {members && chosen.length > 0 && (
        <section className="flex flex-col gap-4" aria-labelledby="eb-design">
          <h2 id="eb-design" className="m-0 text-[17px] font-semibold">Cover design</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <Field label="Policy start date"><input id="eb-start" type="date" value={effDate} onChange={e => { setEffDate(e.target.value); setPriced(null) }} className={inputCls} /></Field>
            <Field label="Basis"><Segmented size="sm" label="Basis" value={basis} onChange={v => { setBasis(v); setPriced(null) }} options={[{ value: 'renewal', label: 'Renewal' }, { value: 'new_business', label: 'New business' }]} /></Field>
            <Field label="Current insurer">
              <select id="eb-current" value={current} onChange={e => { setCurrent(e.target.value); setPriced(null) }} className={inputCls}>
                {INSURERS.map(i => <option key={i} value={i}>{i || 'Not known'}</option>)}
              </select>
            </Field>
          </div>
          <div className="overflow-x-auto rounded-[10px]" style={{ border: `1px solid ${LINE}` }}>
            <table className="text-[13px]" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 1400, width: '100%' }} aria-label="Cover by category">
              <thead><tr>
                <th className="sticky left-0 z-10 px-3 py-2 text-left font-semibold" style={{ background: BAND, width: 200, minWidth: 200, boxShadow: `inset -2px 0 0 ${GREEN}` }}>Category</th>
                {TIERS.map(t => <th key={t.key} className="px-3 py-2 text-left font-semibold" style={{ background: BAND, minWidth: t.key === 'hs' ? 260 : 180 }}>{t.label}</th>)}
              </tr></thead>
              <tbody>
                {chosen.map(c => (
                  <tr key={c.name}>
                    <td className="sticky left-0 z-10 px-3 py-3 align-top bg-white" style={{ borderTop: `1px solid ${LINE}`, boxShadow: `inset -2px 0 0 ${GREEN}` }}>
                      <div className="font-semibold text-[14px]">{c.name}</div>
                      <div className="text-[12px]" style={{ color: MUTED }}>{c.employees} employees{c.plan ? ` · today ${c.plan}` : ''}</div>
                    </td>
                    {TIERS.map(t => {
                      const today = c.today[t.key], cur = designs[c.name]?.[t.key] ?? 0
                      const lo = today != null ? lowerTier(t.key, today) : null
                      const choices: { tier: number; label: string }[] = today == null ? [] : lo === today ? [{ tier: today, label: 'Same' }] : [{ tier: lo!, label: 'Lower' }, { tier: today, label: 'Same' }]
                      const other = !choices.some(x => x.tier === cur)
                      return (
                        <td key={t.key} className="px-3 py-3 align-top" style={{ borderTop: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}` }}>
                          {choices.map(x => {
                            const on = cur === x.tier
                            return (
                              <button key={x.label} type="button" aria-pressed={on} onClick={() => setTier(c.name, t.key, x.tier)}
                                className="flex items-baseline gap-2 w-full text-left mb-1 px-2 py-1 rounded-[7px] text-[12.5px] font-semibold cursor-pointer"
                                style={{ border: `1px solid ${on ? GREEN : LINE2}`, background: on ? SOFT : 'white', color: on ? GREEN : INK }}>
                                <span className="font-normal text-[11px] shrink-0 w-10" style={{ color: on ? GREEN : MUTED }}>{x.label}</span>{t.tiers[x.tier].words}
                              </button>
                            )
                          })}
                          <select id={`eb-${c.name}-${t.key}`} aria-label={`${t.label}, ${c.name}`} value={other ? String(cur) : ''} onChange={e => e.target.value !== '' && setTier(c.name, t.key, Number(e.target.value))}
                            className="w-full h-[26px] rounded-[7px] border-0 px-2 text-[12px] cursor-pointer" style={{ background: FIELD, color: other ? INK : MUTED, fontWeight: other ? 600 : 400, boxShadow: other && choices.length ? `inset 0 0 0 2px ${GREEN}` : undefined }}>
                            <option value="">{today == null ? 'Not on the census · choose' : 'Other tier'}</option>
                            {t.tiers.map((x, i) => <option key={x.words} value={i}>{x.words}</option>)}
                          </select>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div><Btn level="primary" loading={busy} disabled={busy} onClick={() => void generate()}>{busy ? 'Pricing every product…' : 'Generate premium'}</Btn></div>
        </section>
      )}

      {busy && !priced && <Spinner label="Pricing every product…" />}
      {priced && <Premiums priced={priced} picks={picks} onChoose={choose} />}
    </div>
  )
}

function Premiums({ priced, picks, onChoose }: { priced: Priced; picks: Picks; onChoose: (c: PricedCategory, product: string, key: CoverKey, plan: string) => void }) {
  const C1 = 190, C2 = 210
  const head = (
    <thead><tr className="text-[12px]" style={{ color: MUTED }}>
      <th className="sticky left-0 z-20 px-3 py-2 text-left font-medium" style={{ background: BAND, width: C1, minWidth: C1 }} />
      <th className="sticky z-20 px-3 py-2 font-medium" style={{ left: C1, background: BAND, width: C2, minWidth: C2, boxShadow: `1px 0 0 ${LINE2}` }}>Today</th>
      {priced.products.map(p => <th key={p} className="px-3 py-2 font-medium" style={{ background: BAND, minWidth: 290 }}>{p}</th>)}
    </tr></thead>
  )
  const sticky = (bg: string) => ({ c1: { position: 'sticky' as const, left: 0, zIndex: 10, background: bg, width: C1, minWidth: C1 }, c2: { position: 'sticky' as const, left: C1, zIndex: 10, background: bg === 'white' ? TODAY : bg, width: C2, minWidth: C2, boxShadow: `1px 0 0 ${LINE2}` } })
  // Today's total only when every cover's plan today is known; a part-known total would understate it.
  const todayOf = (c: PricedCategory) => TIERS.some(t => c.today.words[t.key] === NOT_KNOWN) ? null : TIERS.reduce((a, t) => a + (c.today.premium[t.key] ?? 0), 0)
  const grand = priced.products.map(p => priced.categories.reduce((a, c) => a + categoryTotal(c, p, picks[c.name]?.[p] ?? ({} as Record<CoverKey, string>)), 0))
  const todays = priced.categories.map(todayOf)
  const grandToday = todays.some(x => x == null) ? null : todays.reduce<number>((a, b) => a + (b ?? 0), 0)
  const lives = priced.categories.reduce((a, c) => a + c.lives, 0)
  const table = 'w-full text-[13px] tabular-nums'
  const tstyle = { borderCollapse: 'separate' as const, borderSpacing: 0, minWidth: 1860 }
  return (
    <section id="eb-premiums" className="flex flex-col gap-6" aria-labelledby="eb-prem-h">
      <div className="flex flex-col gap-1">
        <h2 id="eb-prem-h" className="m-0 text-[17px] font-semibold">Premiums</h2>
        <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>{priced.categories.length} {priced.categories.length === 1 ? 'category' : 'categories'} · {lives} lives · S$ a year, net of GST · rates from {priced.workbook.name}, read {fmtDate(priced.workbook.readAt)}</p>
      </div>
      {priced.categories.map(c => {
        const tot = priced.products.map(p => categoryTotal(c, p, picks[c.name]?.[p] ?? ({} as Record<CoverKey, string>)))
        const today = todayOf(c)
        return (
          <div key={c.name} className="flex flex-col gap-2">
            <h3 className="m-0 text-[16px] font-semibold">{c.name} <span className="text-[13px] font-normal" style={{ color: MUTED }}>· {c.employees} employees · {c.lives} lives</span></h3>
            <div className="overflow-x-auto rounded-[10px]" style={{ border: `1px solid ${LINE}` }}>
              <table className={table} style={tstyle} aria-label={`Premiums, ${c.name}`}>
                {head}
                <tbody>
                  {TIERS.map(t => {
                    const rows = priced.products.map(p => { const pc = c.products[p][t.key], plan = picks[c.name]?.[p]?.[t.key] ?? ''; return { pc, plan, opt: pc.options.find(o => o.plan === plan) ?? null } })
                    const tp = c.today.premium[t.key]
                    if (rows.every(r => !r.plan) && !tp) return null
                    const band = sticky('#f4f6f2'), plain = sticky('white')
                    return [
                      <tr key={`${t.key}h`} className="font-semibold text-[13.5px]" style={{ background: '#f4f6f2' }}>
                        <td className="px-3 py-2 text-left" style={{ ...band.c1, borderTop: `1px solid ${LINE2}` }}>{t.label}</td>
                        <td className="px-3 py-2 text-center" style={{ ...band.c2, background: '#eaf1ec', borderTop: `1px solid ${LINE2}` }}>{tp != null ? f0(tp) : '—'}</td>
                        {rows.map((r, i) => <td key={i} className="px-3 py-2 text-center" style={{ borderTop: `1px solid ${LINE2}` }}>{!r.plan ? '—' : r.opt?.premium == null ? 'Not priced' : r.pc.locked ? 'In hospital premium' : f0(r.opt.premium)}</td>)}
                      </tr>,
                      <tr key={`${t.key}c`}>
                        <td className="px-3 py-1.5 pl-6 text-left text-[12.5px]" style={{ ...plain.c1, color: MUTED, borderTop: `1px solid ${LINE}` }}>Cover</td>
                        <td className="px-3 py-1.5 text-center text-[12.5px]" style={{ ...plain.c2, borderTop: `1px solid ${LINE}` }}>{c.today.words[t.key]}</td>
                        {rows.map((r, i) => {
                          const p = priced.products[i]
                          return (
                            <td key={p} className="px-3 py-1.5 text-center" style={{ borderTop: `1px solid ${LINE}` }}>
                              {r.pc.locked ? <span className="text-[12.5px]" style={{ color: MUTED }}>{r.opt?.words ?? 'None'} · with hospital plan</span> : (
                                <select id={`eb-p-${c.name}-${i}-${t.key}`} aria-label={`${t.label} at ${p}, ${c.name}`} value={r.plan} onChange={e => onChoose(c, p, t.key, e.target.value)}
                                  className="w-full h-7 rounded-[7px] border-0 px-1.5 text-[12px] cursor-pointer text-center" style={{ background: FIELD, color: INK, textAlignLast: 'center' }}>
                                  <option value="">None</option>
                                  {r.pc.options.map(o => <option key={o.plan} value={o.plan}>{o.words}{o.premium == null ? ' · not priced' : ` · S$${f0(o.premium)}`}</option>)}
                                </select>
                              )}
                            </td>
                          )
                        })}
                      </tr>,
                      <tr key={`${t.key}a`}>
                        <td className="px-3 py-1.5 pl-6 text-left text-[12.5px]" style={{ ...plain.c1, color: MUTED, borderTop: `1px solid ${LINE}` }}>Against today</td>
                        <td className="px-3 py-1.5 text-center" style={{ ...plain.c2, color: SUBTLE, borderTop: `1px solid ${LINE}` }}>—</td>
                        {rows.map((r, i) => <td key={i} className="px-3 py-1.5 text-center text-[12.5px]" style={{ borderTop: `1px solid ${LINE}` }}><Against v={r.plan ? r.opt?.premium ?? null : 0} today={tp} /></td>)}
                      </tr>,
                    ]
                  })}
                  <SubRows label={`${c.name} · premium a year`} today={today} totals={tot} lives={c.lives} sticky={sticky('white')} />
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[16px] font-semibold">Total <span className="text-[13px] font-normal" style={{ color: MUTED }}>· {priced.categories.length} {priced.categories.length === 1 ? 'category' : 'categories'} · {lives} lives</span></h3>
        <div className="overflow-x-auto rounded-[10px]" style={{ border: `1px solid ${LINE}` }}>
          <table className={table} style={tstyle} aria-label="Total premium">
            {head}
            <tbody>
              {priced.categories.map((c, ci) => (
                <tr key={c.name}>
                  <td className="px-3 py-2 text-left" style={{ ...sticky('white').c1, borderTop: `1px solid ${LINE}` }}>{c.name}</td>
                  <td className="px-3 py-2 text-center" style={{ ...sticky('white').c2, borderTop: `1px solid ${LINE}` }}>{todays[ci] != null ? f0(todays[ci]!) : '—'}</td>
                  {priced.products.map(p => <td key={p} className="px-3 py-2 text-center" style={{ borderTop: `1px solid ${LINE}` }}>{f0(categoryTotal(c, p, picks[c.name]?.[p] ?? ({} as Record<CoverKey, string>)))}</td>)}
                </tr>
              ))}
              <SubRows label="Premium a year" today={grandToday} totals={grand} lives={lives} sticky={sticky('white')} />
            </tbody>
          </table>
        </div>
      </div>
      {priced.notes.length > 0 && <ul className="m-0 pl-5 text-[12.5px] flex flex-col gap-1" style={{ color: MUTED }}>{priced.notes.map(n => <li key={n}>{n}</li>)}</ul>}
    </section>
  )
}

function SubRows({ label, today, totals, lives, sticky }: { label: string; today: number | null; totals: number[]; lives: number; sticky: { c1: React.CSSProperties; c2: React.CSSProperties } }) {
  const line = `2px solid ${INK}`
  return (
    <>
      <tr className="font-bold text-[14px]">
        <td className="px-3 py-2 text-left" style={{ ...sticky.c1, borderTop: line }}>{label}</td>
        <td className="px-3 py-2 text-center" style={{ ...sticky.c2, borderTop: line }}>{today != null ? f0(today) : '—'}</td>
        {totals.map((v, i) => <td key={i} className="px-3 py-2 text-center" style={{ borderTop: line }}>{f0(v)}</td>)}
      </tr>
      <tr className="text-[12.5px]">
        <td className="px-3 py-1.5 pl-6 text-left" style={{ ...sticky.c1, color: MUTED, borderTop: `1px solid ${LINE}` }}>Against today</td>
        <td className="px-3 py-1.5 text-center" style={{ ...sticky.c2, color: SUBTLE, borderTop: `1px solid ${LINE}` }}>—</td>
        {totals.map((v, i) => <td key={i} className="px-3 py-1.5 text-center" style={{ borderTop: `1px solid ${LINE}` }}><Against v={v} today={today} />{today ? <div className="text-[11px]" style={{ color: SUBTLE }}>{v === today ? '' : `${Math.abs((v - today) / today * 100).toFixed(1)}%`}</div> : null}</td>)}
      </tr>
      <tr className="text-[12.5px]">
        <td className="px-3 py-1.5 pl-6 text-left" style={{ ...sticky.c1, color: MUTED, borderTop: `1px solid ${LINE}` }}>A life</td>
        <td className="px-3 py-1.5 text-center" style={{ ...sticky.c2, borderTop: `1px solid ${LINE}` }}>{today != null && lives ? f0(today / lives) : '—'}</td>
        {totals.map((v, i) => <td key={i} className="px-3 py-1.5 text-center" style={{ borderTop: `1px solid ${LINE}` }}>{lives ? f0(v / lives) : '—'}</td>)}
      </tr>
    </>
  )
}
