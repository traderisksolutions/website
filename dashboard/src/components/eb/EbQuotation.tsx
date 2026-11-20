'use client'

/**
 * Employment Benefits quotation (Jarod, 17 Nov 2026): one page, three steps.
 *
 * Documents: the census (from the thread or uploaded) and last year's policy side by side, as on
 * New quotation. The census gives the categories: employees counted apart from spouses and children,
 * up to four priced. Last year's policy, read on a person's press, sets today's cover per category
 * and today's premium for the whole quotation.
 *
 * Cover design: categories down, covers across, the category column fixed. Each cell opens on one
 * tier below what the category holds today (read from the census plan), today itself second, any
 * other tier from the list.
 *
 * Premiums: one table per category, most senior first, then a total. Every product priced from the
 * house workbook (src/lib/gb/eb-quote.ts); each cover's heading carries its premium; each product's
 * plan can be changed per cover, plan rules applied. The first two columns (row, Current) stay in
 * place; under 834px only the first. Differences read as plain signed figures ("−S$1,200").
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Chip, Field, inputCls, Segmented, Spinner } from '@/components/crm/primitives'
import { tableFrame } from '@/components/cases/shared'
import { useConfirm } from '@/components/ui/confirm'
import { CompanyField, type CompanyPick } from '@/components/group-benefits/CompanyField'
import { fmtDate } from '@/lib/format'
import type { Member } from '@/lib/gb-quote'
import type { SheetRead } from '@/lib/gb/census-parse'
import type { LastYear } from '@/lib/gb/last-year'
import { applyRules } from '@/lib/gb/plan-pairs'
import { ProposalSection } from './ProposalSection'
import type { CensusLife, EditState } from '@/lib/gb/eb-proposal'
import { categoryTotal, censusCategories, HOUSE_INSURERS, insurerOf, lastYearNet, lowerTier, MAX_CATEGORIES, startDesign, TIERS, todayFromLastYear, UNKNOWN_INSURER, type CensusCategory, type CoverKey, type Design, type Priced, type PricedCategory } from '@/lib/gb/eb-quote'

type Source = { attachment_id: string; filename: string; at: string; subject: string | null }
type Picks = Record<string, Record<string, Record<CoverKey, string>>>   // category → product → cover → plan
type Reopened = { quotation?: { id: string; company_id: string | null; company_name: string; version: number }; edit: EditState | null; census?: CensusLife[]; products: string[]; effectiveDate: string; basis: 'renewal' | 'new_business'; picks: Picks }

const INK = '#0f1412', MUTED = '#4a5550', SUBTLE = '#8c958f', FIELD = '#f1f2ee', GREEN = '#132c1c', SOFT = '#edf7e8', DOWN = '#a3361f', LINE2 = '#d5d9d4'
const NOT_KNOWN = 'Not on the census'
const f0 = (n: number) => Math.round(n).toLocaleString('en-SG')
const nextMonthFirst = () => { const t = new Date(Date.now() + 8 * 3600_000); const y = t.getUTCMonth() === 11 ? t.getUTCFullYear() + 1 : t.getUTCFullYear(); return `${y}-${String((t.getUTCMonth() + 1) % 12 + 1).padStart(2, '0')}-01` }
/** A difference as plain text with its sign: "−S$1,200", "+S$800", "S$0". */
const signed = (d: number) => { const r = Math.round(d); return r === 0 ? 'S$0' : `${r < 0 ? '−' : '+'}S$${f0(Math.abs(r))}` }
/** Why a cell shows Not priced, for its tooltip. */
const notPricedWhy = (product: string, cover: string) => product === 'AIA Flexi Vital Care Plus' && cover === 'Personal Accident' ? 'AIA personal accident: the rate rule is not confirmed.' : 'No rate in the house workbook for this plan and these ages.'

function FileRow({ name, meta, action }: { name: string; meta?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-body">
      <span className="min-w-0"><span className="block truncate text-trs-ink" >{name}</span>{meta && <span className="block text-small" style={{ color: MUTED }}>{meta}</span>}</span>
      {action}
    </div>
  )
}

function Drop({ id, label, accept, multiple, disabled, onFiles }: { id: string; label: string; accept: string; multiple?: boolean; disabled?: boolean; onFiles: (f: File[]) => void }) {
  return (
    <label htmlFor={id} className="flex flex-col items-center justify-center gap-1.5 rounded px-4 py-6 cursor-pointer text-center" style={{ background: FIELD, color: MUTED }}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const fs = [...e.dataTransfer.files]; if (fs.length) onFiles(multiple ? fs : fs.slice(0, 1)) }}>
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-heading leading-none" style={{ background: GREEN, color: 'white' }}>+</span>
      <span className="text-body text-trs-ink" >{label}</span>
      <span className="text-small">{accept.split(',').join(' · ')}</span>
      <input id={id} type="file" accept={accept} multiple={multiple} className="sr-only" disabled={disabled} onChange={e => { const fs = [...(e.target.files ?? [])]; if (fs.length) onFiles(fs); e.target.value = '' }} />
    </label>
  )
}

function Against({ v, current }: { v: number | null; current: number | null }) {
  if (v == null || current == null) return <span style={{ color: SUBTLE }}>—</span>
  return <span>{signed(v - current)}</span>
}

export function EbQuotation({ threadId, companyId = null, hrLinkId = null, quotationId = null }: { threadId: string | null; companyId?: string | null; hrLinkId?: string | null; quotationId?: string | null }) {
  // ?company=<id> (the company page's New quotation): the name and its files arrive with the sources.
  const confirm = useConfirm()
  const [pick, setPick] = useState<CompanyPick>({ id: companyId, name: '' })
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
  const [docs, setDocs] = useState<Source[]>([])
  const [uploads, setUploads] = useState<File[]>([])
  const [docIds, setDocIds] = useState<string[]>([])
  const [readingPolicy, setReadingPolicy] = useState(false)
  const [lastYear, setLastYear] = useState<LastYear | null>(null)
  // The kept quotation this page saves to: the reopened one, or the one Save quotation kept. Saving again updates it in place.
  const [savedId, setSavedId] = useState<string | null>(null)
  const [initialInclude, setInitialInclude] = useState<string[] | null>(null)
  const [autoPrice, setAutoPrice] = useState<Picks | null>(null)
  const keepDesigns = useRef(false)

  useEffect(() => {
    if (!threadId && !pick.id) return
    const q = new URLSearchParams(); if (threadId) q.set('thread', threadId); if (pick.id) q.set('company', pick.id)
    let cancelled = false
    fetch(`/api/group-benefits/census/sources?${q}`, { cache: 'no-store' }).then(r => r.json()).then((d: { sources?: Source[]; documents?: Source[]; companyId?: string | null; companyName?: string | null; currentInsurer?: string | null }) => {
      if (cancelled) return
      setSources(d.sources ?? []); setDocs(d.documents ?? [])
      if (d.companyName) setPick(p => p.name ? p : { id: d.companyId ?? null, name: d.companyName! })
      if (d.currentInsurer) setCurrent(c => c || insurerOf(d.currentInsurer))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [threadId, pick.id])

  const cats: CensusCategory[] = useMemo(() => members ? censusCategories(members) : [], [members])
  const chosen = cats.filter(c => included.includes(c.name))
  // Today: the census plan, overlaid by last year's policy where it was read.
  const todayFor = (c: CensusCategory): Partial<Design> => ({ ...c.today, ...lyToday[c.name] })

  function clearCensus() { setFile(null); setMembers(null); setIncluded([]); setDesigns({}); setPriced(null); setPicks({}); setNeedsPassword(null); setPassword('') }
  function clearPolicy() { setUploads([]); setDocIds([]); setLastYear(null); setPriced(null) }
  // Another company: nothing read for the last one stays.
  const lastCompany = useRef<string | null>(null)
  useEffect(() => {
    const key = pick.id ?? (pick.name.trim().toLowerCase() || null)
    if (lastCompany.current && key !== lastCompany.current) { clearCensus(); clearPolicy(); setSources([]); setDocs([]); setCurrent(''); setError(null) }
    lastCompany.current = key
  }, [pick.id, pick.name])
  const lyNet = lastYearNet(lastYear)
  // Last year's policy laid over the census: today's cover per category.
  const lyToday = useMemo(() => (lastYear && cats.length ? todayFromLastYear(lastYear, cats.map(c => c.name)) : {}), [lastYear, cats])

  // A new read of last year's policy restarts the design from it; a reopened quotation keeps its own.
  useEffect(() => {
    if (keepDesigns.current) { keepDesigns.current = false; return }
    if (!lastYear || !cats.length) return
    setDesigns(d => ({ ...d, ...Object.fromEntries(cats.filter(c => lyToday[c.name]).map(c => [c.name, startDesign({ ...c.today, ...lyToday[c.name] })])) }))
    setPriced(null)
  }, [lastYear, cats, lyToday])

  // An HR link: the census is the list HR submitted on it.
  useEffect(() => {
    if (!hrLinkId) return
    let cancelled = false
    fetch(`/api/group-benefits/hr-links/${hrLinkId}/census`, { cache: 'no-store' })
      .then(async r => ({ ok: r.ok, status: r.status, d: await r.json().catch(() => ({})) as { census?: Member[]; company?: { id: string | null; name: string | null }; effective_date?: string | null; reference?: string; error?: string } }))
      .then(({ ok, status, d }) => {
        if (cancelled) return
        if (!ok || !d.census?.length) { setError(d.error ?? `The list from the HR link could not be loaded (${status}).`); return }
        if (d.company?.name) setPick(p => (p.name ? p : { id: d.company!.id ?? null, name: d.company!.name! }))
        if (d.effective_date) setEffDate(d.effective_date.slice(0, 10))
        takeCensus(`HR link ${d.reference ?? ''}`.trim(), d.census)
      }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'The list from the HR link could not be loaded.') })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrLinkId])

  // A kept quotation reopened (Edit quotation): its census, categories, design, insurers and last year's policy, then priced again.
  useEffect(() => {
    if (!quotationId) return
    let cancelled = false
    fetch(`/api/eb/quotations/${quotationId}?edit=1`, { cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({})) as Reopened & { error?: string }
      if (cancelled) return
      if (!r.ok || !d.quotation) { setError(d.error ?? `The quotation could not be opened (${r.status}).`); return }
      const e = d.edit
      const ms: Member[] = e?.members ?? (d.census ?? []).map(m => ({ name: m.name, category: m.category, relationship: m.relationship, dob: m.dob, age: m.age, occupation_class: m.occupation }))
      if (!ms.length) { setError('This quotation has no census to reopen.'); return }
      const read = censusCategories(ms)
      keepDesigns.current = !!e?.lastYear
      setPick({ id: d.quotation.company_id, name: d.quotation.company_name })
      setEffDate(d.effectiveDate); setBasis(d.basis)
      setCurrent(e?.current ?? '')
      setLastYear(e?.lastYear ?? null)
      setFile({ name: `Census on V${d.quotation.version}` })
      setMembers(ms)
      setIncluded(e?.included?.length ? e.included : Object.keys(d.picks))
      setDesigns(Object.fromEntries(read.map(c => [c.name, { ...startDesign(c.today), ...(e?.designs?.[c.name] ?? {}) }])))
      setInitialInclude(d.products)
      setSavedId(d.quotation.id)
      setAutoPrice(d.picks)
    }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'The quotation could not be opened.') })
    return () => { cancelled = true }
  }, [quotationId])

  useEffect(() => {
    if (!autoPrice || !members || !chosen.length) return
    const keep = autoPrice
    setAutoPrice(null)
    void generate(keep)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrice, members, chosen.length])

  // What a kept quotation needs to be reopened here.
  const editState = useMemo<EditState | null>(() => members ? { members, included, designs: Object.fromEntries(included.map(n => [n, designs[n] ?? {}])), current, lastYear } : null, [members, included, designs, current, lastYear])

  /** A census read in full (an HR link's list): every category, the first four ticked. */
  function takeCensus(name: string, ms: Member[]) {
    const read = censusCategories(ms)
    setFile({ name }); setMembers(ms); setPriced(null)
    setIncluded(read.slice(0, MAX_CATEGORIES).map(c => c.name))
    setDesigns(Object.fromEntries(read.map(c => [c.name, startDesign(c.today)])))
  }

  async function readPolicy() {
    setReadingPolicy(true); setError(null)
    try {
      const fd = new FormData()
      for (const f of uploads) fd.append('files', f)
      for (const id of docIds) fd.append('attachment_ids', id)
      const res = await fetch('/api/group-benefits/last-year/read', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({})) as { read?: LastYear; error?: string }
      if (!res.ok || !d.read) { setError(d.error ?? `Last year's policy could not be read (${res.status}).`); return }
      const ly = d.read
      setLastYear(ly)
      if (ly.periodTo) { const n = new Date(`${ly.periodTo}T00:00:00Z`); n.setUTCDate(n.getUTCDate() + 1); setEffDate(n.toISOString().slice(0, 10)) }
      setBasis('renewal')
      // The insurer read: one of the five, else "Unknown: <the name read>". Never a guess.
      const named = insurerOf([ly.insurer, ly.product].filter(Boolean).join(' '))
      if (named) setCurrent(named)
    } catch (e) { setError(e instanceof Error ? e.message : "Last year's policy could not be read.") }
    finally { setReadingPolicy(false) }
  }

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

  async function generate(keep?: Picks) {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/eb/price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        effective_date: effDate, basis, current_insurer: current.startsWith(UNKNOWN_INSURER) ? current.slice(UNKNOWN_INSURER.length) : current || null,
        categories: chosen.map(c => ({ name: c.name, members: c.members, design: designs[c.name], today: todayFor(c) })),
      }) })
      const d = await res.json().catch(() => ({})) as Priced & { error?: string }
      if (!res.ok || !d.categories) { setError(d.error ?? `The premiums were not worked out (${res.status}).`); return }
      setPriced(d)
      // A reopened quotation keeps the plans it was saved with, where the product still sells them.
      const kept = (c: PricedCategory, p: string, k: CoverKey) => { const v = keep?.[c.name]?.[p]?.[k]; return v != null && (v === '' || c.products[p][k].options.some(o => o.plan === v)) ? v : c.products[p][k].pick }
      setPicks(Object.fromEntries(d.categories.map(c => [c.name, Object.fromEntries(d.products.map(p => [p, Object.fromEntries(TIERS.map(t => [t.key, kept(c, p, t.key)]))]))])) as Picks)
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

  async function removeCensus() {
    if (!(await confirm({ title: `Remove ${file?.name ?? 'the census'}?`, body: 'The categories, design and premiums read from it go with it. The file stays where it came from.', action: 'Remove', danger: true }))) return
    clearCensus()
  }
  async function removePolicy() {
    if (!(await confirm({ title: 'Remove last year’s policy?', body: 'The current cover and premium read from it go with it. The files stay where they came from.', action: 'Remove', danger: true }))) return
    clearPolicy()
  }
  async function removeUpload(i: number) {
    if (!(await confirm({ title: `Remove ${uploads[i]?.name ?? 'this file'}?`, body: 'It is taken off this quotation only.', action: 'Remove', danger: true }))) return
    setUploads(u => u.filter((_, j) => j !== i))
  }
  const insurerOptions = [...HOUSE_INSURERS as readonly string[], ...(current.startsWith(UNKNOWN_INSURER) ? [current] : [])]

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-label="Documents">
        <div className="max-w-[560px]"><CompanyField value={pick} onChange={setPick} allowCreate listId="eb-company-options" /></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8">
          <section className="flex flex-col gap-3 min-w-0" aria-labelledby="eb-census">
            <h2 id="eb-census" className="m-0 text-body font-medium">Census</h2>
            <Drop id="eb-upload" label={reading && file?.upload ? 'Reading every tab…' : 'Add census'} accept=".xlsx,.xls,.xlsm,.csv" disabled={reading} onFiles={fs => void readCensus({ name: fs[0].name, upload: fs[0] })} />
            {file && members && <FileRow name={file.name} meta={`${members.length} lives`} action={<span className="flex items-center gap-2"><Chip>Read</Chip><Btn size="xs" level="tertiary" onClick={() => void removeCensus()}>Remove</Btn></span>} />}
            {needsPassword && file && (
              <div className="flex items-end gap-2 flex-wrap">
                <Field label={needsPassword.wrong ? 'That password does not open the file' : 'This file is password-protected'}>
                  <input id="eb-password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="Password" />
                </Field>
                <Btn onClick={() => void readCensus(file, password)} loading={reading}>Open</Btn>
              </div>
            )}
            {sources.length > 0 && <p className="m-0 text-small" style={{ color: MUTED }}>On {pick.name ? `${pick.name}'s` : 'this thread’s'} emails</p>}
            {sources.slice(0, 8).map(s => {
              const on = file?.attachmentId === s.attachment_id
              return <FileRow key={s.attachment_id} name={s.filename} meta={`${fmtDate(s.at)}${s.subject ? ` · ${s.subject}` : ''}`}
                action={<Btn size="xs" aria-pressed={on} loading={reading && on} disabled={reading} onClick={() => void readCensus({ name: s.filename, attachmentId: s.attachment_id })}>{on && members ? 'Added' : 'Add'}</Btn>} />
            })}
          </section>
          <section className="flex flex-col gap-3 min-w-0" aria-labelledby="eb-policy">
            <h2 id="eb-policy" className="m-0 text-body font-medium">Last year&apos;s policy and premium</h2>
            <Drop id="eb-policy-files" label="Add policy documents" accept=".pdf,.png,.jpg,.jpeg,.xlsx" multiple disabled={readingPolicy} onFiles={fs => setUploads(u => [...u, ...fs].slice(0, 12))} />
            {uploads.map((f, i) => <FileRow key={`${f.name}-${i}`} name={f.name} meta={`${Math.max(1, Math.round(f.size / 1024))} KB`} action={<Btn size="xs" level="tertiary" aria-label={`Remove ${f.name}`} onClick={() => void removeUpload(i)}>Remove</Btn>} />)}
            {docs.length > 0 && <p className="m-0 text-small" style={{ color: MUTED }}>On {pick.name ? `${pick.name}'s` : 'this thread’s'} emails</p>}
            {docs.slice(0, 10).map(s => { const on = docIds.includes(s.attachment_id); return (
              <FileRow key={s.attachment_id} name={s.filename} meta={`${fmtDate(s.at)}${s.subject ? ` · ${s.subject}` : ''}`}
                action={<Btn size="xs" aria-pressed={on} disabled={readingPolicy} onClick={() => setDocIds(d => on ? d.filter(x => x !== s.attachment_id) : [...d, s.attachment_id])}>{on ? 'Added' : 'Add'}</Btn>} />
            ) })}
            {(uploads.length > 0 || docIds.length > 0) && (
              <div><Btn loading={readingPolicy} disabled={readingPolicy} onClick={() => void readPolicy()}>{readingPolicy ? `Reading ${uploads.length + docIds.length} ${uploads.length + docIds.length === 1 ? 'document' : 'documents'}…` : 'Read policy'}</Btn></div>
            )}
            {lastYear && (
              <div className="flex flex-col gap-1 text-body">
                <div className="flex items-center justify-between gap-3"><span className="font-medium">{[lastYear.insurer, lastYear.product].filter(Boolean).join(' · ') || 'Insurer not stated'}</span><Btn size="xs" level="tertiary" onClick={() => void removePolicy()}>Remove</Btn></div>
                <div style={{ color: MUTED }}>{[lastYear.policyNumber && `Policy ${lastYear.policyNumber}`, lastYear.periodFrom && lastYear.periodTo && `${fmtDate(lastYear.periodFrom)} to ${fmtDate(lastYear.periodTo)}`, lyNet != null && `S$${f0(lyNet)} a year, net of GST`].filter(Boolean).join(' · ')}</div>
                <div style={{ color: MUTED }}>{Object.keys(lyToday).length ? `Current cover set for ${Object.keys(lyToday).length} of ${cats.length} ${cats.length === 1 ? 'category' : 'categories'}` : cats.length ? 'No census category matched the policy categories' : 'Add the census to set the current cover'}</div>
                {lastYear.conflicts.map(c => <div key={c} className="text-trs-warn">{c}</div>)}
              </div>
            )}
          </section>
        </div>
        {error && <p className="m-0 text-body" style={{ color: DOWN }} role="alert">{error}</p>}

        {members && (
          <div className={tableFrame}>
            <table className="trs-table" style={{ minWidth: 760 }} aria-label="Census">
              <thead><tr>
                {['Census category', 'Employees', 'Spouses', 'Children', 'Lives', 'Plan on the census', 'In this quotation'].map((h, i) => <th key={h} className={i === 0 ? 'sticky left-0 z-10 bg-white' : undefined}>{h}</th>)}
              </tr></thead>
              <tbody>
                {cats.map((c, i) => {
                  const on = included.includes(c.name)
                  return (
                    <tr key={c.name}>
                      <td className="sticky left-0 bg-white font-medium">{c.name}</td>
                      <td>{c.employees}</td>
                      <td>{c.spouses}</td>
                      <td>{c.children}</td>
                      <td>{c.lives}</td>
                      <td style={{ color: c.plan ? INK : SUBTLE }}>{c.plan ?? 'Not on the census'}</td>
                      <td><input id={`eb-inc-${i}`} type="checkbox" checked={on} disabled={!on && included.length >= MAX_CATEGORIES} onChange={e => toggle(c.name, e.target.checked)} aria-label={`Include ${c.name}`} className="h-4 w-4 accent-[#132c1c] cursor-pointer" /></td>
                    </tr>
                  )
                })}
                <tr className="row-total">
                  <td className="sticky left-0 bg-white">Total</td>
                  {(['employees', 'spouses', 'children', 'lives'] as const).map(k => <td key={k}>{cats.reduce((a, c) => a + c[k], 0)}</td>)}
                  <td /><td>{included.length} of {MAX_CATEGORIES}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {members && <p className="m-0 text-small" style={{ color: MUTED }}>{chosen.reduce((a, c) => a + c.employees, 0)} employees in this quotation · spouses and children not counted as headcount</p>}
      </section>

      {members && chosen.length > 0 && (
        <section className="flex flex-col gap-4" aria-labelledby="eb-design">
          <h2 id="eb-design" className="m-0 text-heading font-semibold">Cover design</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <Field label="Policy start date"><input id="eb-start" type="date" value={effDate} onChange={e => { setEffDate(e.target.value); setPriced(null) }} className={inputCls} /></Field>
            <Field label="Basis"><Segmented size="sm" label="Basis" value={basis} onChange={v => { setBasis(v); setPriced(null) }} options={[{ value: 'renewal', label: 'Renewal' }, { value: 'new_business', label: 'New business' }]} /></Field>
            <Field label="Current insurer">
              <select id="eb-current" value={current} onChange={e => { setCurrent(e.target.value); setPriced(null) }} className={inputCls}>
                <option value="">Not known</option>
                {insurerOptions.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>
          </div>
          <div className={tableFrame}>
            <table className="trs-table" style={{ minWidth: 1400 }} aria-label="Cover by category">
              <thead><tr>
                <th className="sticky left-0 z-10 bg-white" style={{ width: 200, minWidth: 200 }}>Category</th>
                {TIERS.map(t => <th key={t.key} style={{ minWidth: t.key === 'hs' ? 260 : 180 }}>{t.label}</th>)}
              </tr></thead>
              <tbody>
                {chosen.map(c => (
                  <tr key={c.name}>
                    <td className="sticky left-0 z-10 bg-white align-top">
                      <div className="font-semibold text-body">{c.name}</div>
                      <div className="text-small" style={{ color: MUTED }}>{c.employees} employees{c.plan ? ` · current ${c.plan}` : ''}</div>
                    </td>
                    {TIERS.map(t => {
                      const now = todayFor(c)[t.key], cur = designs[c.name]?.[t.key] ?? 0
                      const lo = now != null ? lowerTier(t.key, now) : null
                      const choices: { tier: number; label: string }[] = now == null ? [] : lo === now ? [{ tier: now, label: 'Same' }] : [{ tier: lo!, label: 'Lower' }, { tier: now, label: 'Same' }]
                      const other = !choices.some(x => x.tier === cur)
                      return (
                        <td key={t.key} className="align-top text-left pt-2.5 pb-2.5">
                          {choices.map(x => {
                            const on = cur === x.tier
                            return (
                              <button key={x.label} type="button" aria-pressed={on} onClick={() => setTier(c.name, t.key, x.tier)}
                                className="flex items-baseline gap-2 w-full text-left mb-1 px-2 py-1 rounded text-small font-semibold cursor-pointer"
                                style={{ border: `1px solid ${on ? GREEN : LINE2}`, background: on ? SOFT : 'white', color: on ? GREEN : INK }}>
                                <span className="font-normal text-small shrink-0 w-10" style={{ color: on ? GREEN : MUTED }}>{x.label}</span>{t.tiers[x.tier].words}
                              </button>
                            )
                          })}
                          <select id={`eb-${c.name}-${t.key}`} aria-label={`${t.label}, ${c.name}`} value={other ? String(cur) : ''} onChange={e => e.target.value !== '' && setTier(c.name, t.key, Number(e.target.value))}
                            className="w-full h-[26px] rounded border-0 px-2 text-small cursor-pointer" style={{ background: FIELD, color: other ? INK : MUTED, fontWeight: other ? 600 : 400, boxShadow: other && choices.length ? `inset 0 0 0 2px ${GREEN}` : undefined }}>
                            <option value="">{now == null ? 'Not on the census · choose' : 'Other tier'}</option>
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
      {priced && <Premiums priced={priced} picks={picks} onChoose={choose} lastYearTotal={chosen.length === cats.length ? lyNet : null} />}
      {priced && members && <ProposalSection priced={priced} picks={picks} members={members} company={pick.name} companyId={pick.id} threadId={threadId} effectiveDate={effDate} basis={basis}
        savedId={savedId} onSaved={setSavedId} initialInclude={initialInclude}
        edit={editState!} />}
    </div>
  )
}

/** Premium tables: the first two columns (row label, Current) stay in place; on a phone only the first. */
const FREEZE_CSS = `.eb-prem .eb-c1{position:sticky;left:0;z-index:10;background:#fff}.eb-prem .eb-c2{position:sticky;left:var(--eb-c1);z-index:10;background:#fff;box-shadow:inset -1px 0 0 #d5d9d4}@media (max-width:833px){.eb-prem .eb-c2{position:static;box-shadow:none}}`

function Premiums({ priced, picks, onChoose, lastYearTotal }: { priced: Priced; picks: Picks; onChoose: (c: PricedCategory, product: string, key: CoverKey, plan: string) => void; lastYearTotal: number | null }) {
  const C1 = 190, C2 = 210
  const head = (
    <thead><tr>
      <th className="eb-c1" style={{ width: C1, minWidth: C1, zIndex: 20 }} />
      <th className="eb-c2" style={{ width: C2, minWidth: C2, zIndex: 20 }}>Current</th>
      {priced.products.map(p => <th key={p} style={{ minWidth: 290 }}>{p}</th>)}
    </tr></thead>
  )
  // The current total only when every cover's current plan is known; a part-known total would understate it.
  const currentOf = (c: PricedCategory) => TIERS.some(t => c.today.words[t.key] === NOT_KNOWN) ? null : TIERS.reduce((a, t) => a + (c.today.premium[t.key] ?? 0), 0)
  const grand = priced.products.map(p => priced.categories.reduce((a, c) => a + categoryTotal(c, p, picks[c.name]?.[p] ?? ({} as Record<CoverKey, string>)), 0))
  const currents = priced.categories.map(currentOf)
  // Last year's policy is the current premium for the whole quotation when it was read and every category is priced.
  const grandCurrent = lastYearTotal ?? (currents.some(x => x == null) ? null : currents.reduce<number>((a, b) => a + (b ?? 0), 0))
  const lives = priced.categories.reduce((a, c) => a + c.lives, 0)
  const unaged = priced.notes.map(n => n.match(/^(\d+) (?:life has|lives have) no date of birth/)?.[1]).find(Boolean)
  const frame = `${tableFrame} eb-prem`
  const vars = { ['--eb-c1' as string]: `${C1}px` } as React.CSSProperties
  const tstyle = { minWidth: 1860 }
  return (
    <section id="eb-premiums" className="flex flex-col gap-6" aria-labelledby="eb-prem-h">
      <style>{FREEZE_CSS}</style>
      <div className="flex flex-col gap-1">
        <h2 id="eb-prem-h" className="m-0 text-heading font-semibold">Premiums</h2>
        <p className="m-0 text-small" style={{ color: MUTED }}>{priced.categories.length} {priced.categories.length === 1 ? 'category' : 'categories'} · {lives} lives{unaged ? ` · ${unaged} without an age, not priced` : ''} · S$ a year, net of GST · rates from {priced.workbook.name}, read {fmtDate(priced.workbook.readAt)}</p>
      </div>
      {priced.categories.map(c => {
        const tot = priced.products.map(p => categoryTotal(c, p, picks[c.name]?.[p] ?? ({} as Record<CoverKey, string>)))
        const cur = currentOf(c)
        return (
          <div key={c.name} className="flex flex-col gap-2">
            <h3 className="m-0 text-heading font-semibold">{c.name} <span className="text-body font-normal" style={{ color: MUTED }}>· {c.employees} employees · {c.lives} lives</span></h3>
            <div className={frame} style={vars}>
              <table className="trs-table" style={tstyle} aria-label={`Premiums, ${c.name}`}>
                {head}
                <tbody>
                  {TIERS.map(t => {
                    const rows = priced.products.map(p => { const pc = c.products[p][t.key], plan = picks[c.name]?.[p]?.[t.key] ?? ''; return { pc, plan, opt: pc.options.find(o => o.plan === plan) ?? null } })
                    const tp = c.today.premium[t.key]
                    if (rows.every(r => !r.plan) && !tp) return null
                    return [
                      <tr key={`${t.key}h`} className="font-semibold">
                        <td className="eb-c1">{t.label}</td>
                        <td className="eb-c2">{tp != null ? f0(tp) : '—'}</td>
                        {rows.map((r, i) => <td key={i} title={r.plan && r.opt?.premium == null ? notPricedWhy(priced.products[i], t.cover) : undefined}>{!r.plan ? '—' : r.pc.locked ? 'In hospital premium' : r.opt?.premium == null ? 'Not priced' : f0(r.opt.premium)}</td>)}
                      </tr>,
                      <tr key={`${t.key}c`}>
                        <td className="eb-c1 pl-6 text-small" style={{ color: MUTED }}>Cover</td>
                        <td className="eb-c2 text-small">{c.today.words[t.key]}</td>
                        {rows.map((r, i) => {
                          const p = priced.products[i]
                          return (
                            <td key={p}>
                              {r.pc.locked ? <span className="text-small" style={{ color: MUTED }}>{r.opt?.words ?? 'None'} · with hospital plan</span> : (
                                <select id={`eb-p-${c.name}-${i}-${t.key}`} aria-label={`${t.label} at ${p}, ${c.name}`} value={r.plan} onChange={e => onChoose(c, p, t.key, e.target.value)}
                                  className="w-full h-7 rounded border-0 px-1.5 text-small cursor-pointer text-center" style={{ background: FIELD, color: INK, textAlignLast: 'center' }}>
                                  <option value="">None</option>
                                  {r.pc.options.map(o => <option key={o.plan} value={o.plan}>{o.words}{o.premium == null ? ' · not priced' : ` · S$${f0(o.premium)}`}</option>)}
                                </select>
                              )}
                            </td>
                          )
                        })}
                      </tr>,
                      <tr key={`${t.key}a`}>
                        <td className="eb-c1 pl-6 text-small" style={{ color: MUTED }}>Against current</td>
                        <td className="eb-c2" style={{ color: SUBTLE }}>—</td>
                        {rows.map((r, i) => <td key={i} className="text-small"><Against v={r.plan ? r.opt?.premium ?? null : 0} current={tp} /></td>)}
                      </tr>,
                    ]
                  })}
                  <SubRows label={`${c.name} · premium a year`} current={cur} totals={tot} lives={c.lives} />
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-heading font-semibold">Total <span className="text-body font-normal" style={{ color: MUTED }}>· {priced.categories.length} {priced.categories.length === 1 ? 'category' : 'categories'} · {lives} lives</span></h3>
        <div className={frame} style={vars}>
          <table className="trs-table" style={tstyle} aria-label="Total premium">
            {head}
            <tbody>
              {priced.categories.map((c, ci) => (
                <tr key={c.name}>
                  <td className="eb-c1">{c.name}</td>
                  <td className="eb-c2">{currents[ci] != null ? f0(currents[ci]!) : '—'}</td>
                  {priced.products.map(p => <td key={p}>{f0(categoryTotal(c, p, picks[c.name]?.[p] ?? ({} as Record<CoverKey, string>)))}</td>)}
                </tr>
              ))}
              <SubRows label="Premium a year" current={grandCurrent} totals={grand} lives={lives} />
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function SubRows({ label, current, totals, lives }: { label: string; current: number | null; totals: number[]; lives: number }) {
  return (
    <>
      <tr className="row-total">
        <td className="eb-c1">{label}</td>
        <td className="eb-c2">{current != null ? f0(current) : '—'}</td>
        {totals.map((v, i) => <td key={i}>{f0(v)}</td>)}
      </tr>
      <tr className="text-small">
        <td className="eb-c1 pl-6" style={{ color: MUTED }}>Against current</td>
        <td className="eb-c2" style={{ color: SUBTLE }}>—</td>
        {totals.map((v, i) => <td key={i}><Against v={v} current={current} />{current && Math.round(v) !== Math.round(current) ? <div className="text-small" style={{ color: MUTED }}>{`${v < current ? '−' : '+'}${Math.abs((v - current) / current * 100).toFixed(1)}%`}</div> : null}</td>)}
      </tr>
      <tr className="text-small">
        <td className="eb-c1 pl-6" style={{ color: MUTED }}>Per person</td>
        <td className="eb-c2">{current != null && lives ? f0(current / lives) : '—'}</td>
        {totals.map((v, i) => <td key={i}>{lives ? f0(v / lives) : '—'}</td>)}
      </tr>
    </>
  )
}
