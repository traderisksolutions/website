'use client'

/**
 * Employment Benefits 2.0, New quotation (Jarod's approved design, 20 Nov 2026): three steps.
 *
 * Step 1 · Pricing: Brochure pricing (priced now from the insurers' published rates) or Insurer
 * pricing (insurers price this census; their schedules are compared). The company in the middle;
 * under it the columns Census, Last year's policy and premium and, for Insurer pricing, Insurer
 * pricing schedules: each an Add box, the files added, and the files on the company's filed
 * threads. Code reads every file; a model reads only on a person's Read with AI or Read policy.
 *
 * Step 2 · Options for the client: Same tier or Lower tier, matched by rule (compare-cover.ts).
 * Choosing one sets every pick in Compare; copies keep theirs.
 *
 * Step 3 · Compare (EbCompare.tsx): a column per product, per insurer schedule and per copy, every
 * plan priced by code from the house workbook; Current only from a premium or debit note read.
 * Proposal under it (ProposalSection.tsx): Excel, Save quotation, Prepare proposal.
 *
 * Routes in: ?company=, ?thread=, ?hrLink= (the list HR submitted), ?quotation= (reopen).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Chip, Field, Segmented, Spinner } from '@/components/crm/primitives'
import { useConfirm } from '@/components/ui/confirm'
import { ChoiceCard } from '@/components/ui/choice-card'
import { Checkbox } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { Register, RegisterCell, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { SelectBox } from '@/components/ui/select-box'
import { CompanyField, type CompanyPick } from '@/components/group-benefits/CompanyField'
import { fmtDate } from '@/lib/format'
import type { Member } from '@/lib/gb-quote'
import type { SheetRead } from '@/lib/gb/census-parse'
import type { LastYear } from '@/lib/gb/last-year'
import type { CensusLife, EditState } from '@/lib/gb/eb-proposal'
import { censusCategories, currentFromLastYear, HOUSE_INSURERS, insurerOf, lastYearNet, MAX_CATEGORIES, TIERS, UNKNOWN_INSURER, type CensusCategory, type CoverKey, type Priced } from '@/lib/gb/eb-quote'
import { choosePlan, compareModel, tierPicks, type ColumnPicks, type EbColumn, type Tier } from '@/lib/gb/eb-compare'
import { scheduleSummary, type InsurerSchedule } from '@/lib/gb/insurer-schedule'
import { DocColumn, FileRow, type FoundFile } from './EbDocs'
import { EbTiers } from './EbTiers'
import { EbCompare } from './EbCompare'
import { ProposalSection } from './ProposalSection'
import { EbCensusReview, EbOptionalFiles } from './EbCensusReview'
import { EbRoutes } from './EbRoutes'
import { fmtMoney0 } from './eb-format'

type Mode = 'brochure' | 'insurer'
type Src = { name: string; upload?: File; attachmentId?: string }
type SchedFile = Src & { id: string; busy: boolean; error?: string; schedule?: InsurerSchedule }
type BrochureCol = Extract<EbColumn, { kind: 'brochure' | 'copy' }>
type Reopened = { quotation?: { id: string; company_id: string | null; company_name: string; version: number }; edit: EditState | null; census?: CensusLife[]; products: string[]; effectiveDate: string; basis: 'renewal' | 'new_business'; picks: Record<string, Record<string, Record<CoverKey, string>>> }
type Keep = { columns?: BrochureCol[]; legacy?: Reopened['picks'] }
type SchemeRead = { at: string | null; by: string | null }
type SchemeView = { plan_year: string; census: SchemeRead | null; last_year: SchemeRead | null }
type SchemeAnswer = {
  tables?: boolean; plan_year?: string | null; previous?: { plan_year: string; members: Member[] } | null
  scheme?: { plan_year: string; effective_date: string | null; basis: 'renewal' | 'new_business' | null; insurer: string | null; census: { file: string; members: Member[] } | null; census_read_at: string | null; census_read_by: string | null; last_year: LastYear | null; last_year_read_at: string | null; last_year_read_by: string | null } | null
}
const readBy = (r: SchemeRead | null | undefined) => r?.at ? `read ${fmtDate(r.at)}${r.by ? ` by ${r.by.split('@')[0]}` : ''}` : null

const nextMonthFirst = () => { const t = new Date(Date.now() + 8 * 3600_000); const y = t.getUTCMonth() === 11 ? t.getUTCFullYear() + 1 : t.getUTCFullYear(); return `${y}-${String((t.getUTCMonth() + 1) % 12 + 1).padStart(2, '0')}-01` }
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

/** A column's picks kept where the product still sells the plan; else the tier's pick. */
function validPicks(priced: Priced, product: string, picks: ColumnPicks | undefined, tier: Tier): ColumnPicks {
  const base = tierPicks(priced, product, tier)
  return Object.fromEntries(priced.categories.map(c => [c.name, Object.fromEntries(TIERS.map(t => {
    const v = picks?.[c.name]?.[t.key]
    const ok = v != null && (v === '' || c.products[product]?.[t.key]?.options.some(o => o.plan === v))
    return [t.key, ok ? v! : base[c.name][t.key]]
  })) as Record<CoverKey, string>]))
}

export function EbQuotation({ threadId, companyId = null, hrLinkId = null, quotationId = null }: { threadId: string | null; companyId?: string | null; hrLinkId?: string | null; quotationId?: string | null }) {
  const confirm = useConfirm()
  const [mode, setMode] = useState<Mode>('brochure')
  const [pick, setPick] = useState<CompanyPick>({ id: companyId, name: '' })
  const [sources, setSources] = useState<FoundFile[]>([])
  const [docs, setDocs] = useState<FoundFile[]>([])
  const [schedSources, setSchedSources] = useState<FoundFile[]>([])
  const [optional, setOptional] = useState<(FoundFile & { kind: string })[]>([])
  // The scheme file (docs/eb-v2.md P2): what was read for this client and plan year, and the year before.
  const [scheme, setScheme] = useState<SchemeView | null>(null)
  const [previous, setPrevious] = useState<{ plan_year: string; members: Member[] } | null>(null)
  const fromScheme = useRef<{ census: boolean; lastYear: boolean }>({ census: false, lastYear: false })
  const [threads, setThreads] = useState<number | null>(null)
  const [current, setCurrent] = useState('')
  // Census
  const [file, setFile] = useState<Src | null>(null)
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState<{ wrong: boolean } | null>(null)
  const [members, setMembers] = useState<Member[] | null>(null)
  const [reading, setReading] = useState(false)
  const [censusAi, setCensusAi] = useState(false)
  const [included, setIncluded] = useState<string[]>([])
  const [effDate, setEffDate] = useState(nextMonthFirst())
  const [basis, setBasis] = useState<'renewal' | 'new_business'>('renewal')
  // Last year's policy
  const [uploads, setUploads] = useState<File[]>([])
  const [docIds, setDocIds] = useState<string[]>([])
  const [readingPolicy, setReadingPolicy] = useState(false)
  const [lastYear, setLastYear] = useState<LastYear | null>(null)
  // Insurer pricing schedules
  const [schedules, setSchedules] = useState<SchedFile[]>([])
  // Prices
  const [priced, setPriced] = useState<Priced | null>(null)
  const [tier, setTier] = useState<Tier>('same')
  const [cols, setCols] = useState<BrochureCol[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [initialInclude, setInitialInclude] = useState<string[] | null>(null)
  const [autoPrice, setAutoPrice] = useState<Keep | null>(null)

  useEffect(() => {
    if (!threadId && !pick.id) return
    const q = new URLSearchParams(); if (threadId) q.set('thread', threadId); if (pick.id) q.set('company', pick.id)
    let cancelled = false
    fetch(`/api/group-benefits/census/sources?${q}`, { cache: 'no-store' }).then(r => r.json()).then((d: { sources?: FoundFile[]; documents?: FoundFile[]; schedules?: FoundFile[]; optional?: (FoundFile & { kind: string })[]; threads?: number; companyId?: string | null; companyName?: string | null; currentInsurer?: string | null }) => {
      if (cancelled) return
      setSources(d.sources ?? []); setDocs(d.documents ?? []); setSchedSources(d.schedules ?? []); setOptional(d.optional ?? []); setThreads(d.threads ?? null)
      if (d.companyName) setPick(p => p.name ? p : { id: d.companyId ?? null, name: d.companyName! })
      if (d.currentInsurer) setCurrent(c => c || insurerOf(d.currentInsurer))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [threadId, pick.id])

  const cats: CensusCategory[] = useMemo(() => members ? censusCategories(members) : [], [members])
  const chosen = cats.filter(c => included.includes(c.name))

  function clearCensus() { setFile(null); setMembers(null); setIncluded([]); setPriced(null); setCols([]); setNeedsPassword(null); setPassword(''); setCensusAi(false) }
  function clearPolicy() { setUploads([]); setDocIds([]); setLastYear(null); setPriced(null) }
  // Another company: nothing read for the last one stays.
  const lastCompany = useRef<string | null>(null)
  useEffect(() => {
    const key = pick.id ?? (pick.name.trim().toLowerCase() || null)
    if (lastCompany.current && key !== lastCompany.current) { clearCensus(); clearPolicy(); setSchedules([]); setSources([]); setDocs([]); setSchedSources([]); setOptional([]); setThreads(null); setCurrent(''); setError(null); setScheme(null); setPrevious(null) }
    lastCompany.current = key
  }, [pick.id, pick.name])

  // The client's scheme file: the newest plan year opens as it was read, unless a quotation, an
  // HR link or a read in this session already filled the page.
  useEffect(() => {
    if (!pick.id || quotationId || hrLinkId) return
    let cancelled = false
    fetch(`/api/eb/scheme?company=${pick.id}`, { cache: 'no-store' }).then(r => r.json()).then((d: SchemeAnswer) => {
      if (cancelled || !d.tables || !d.scheme) return
      const sc = d.scheme
      setScheme({ plan_year: sc.plan_year, census: sc.census ? { at: sc.census_read_at, by: sc.census_read_by } : null, last_year: sc.last_year ? { at: sc.last_year_read_at, by: sc.last_year_read_by } : null })
      setPrevious(d.previous ?? null)
      setMembers(m => {
        if (m || !sc.census?.members?.length) return m
        fromScheme.current.census = true
        setFile({ name: sc.census.file })
        setIncluded(censusCategories(sc.census.members).slice(0, MAX_CATEGORIES).map(c => c.name))
        if (sc.effective_date) setEffDate(sc.effective_date)
        if (sc.basis) setBasis(sc.basis)
        return sc.census.members
      })
      setLastYear(ly => {
        if (ly || !sc.last_year) return ly
        fromScheme.current.lastYear = true
        if (sc.insurer) setCurrent(c => c || sc.insurer!)
        return sc.last_year
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [pick.id, quotationId, hrLinkId])

  // The previous plan year follows the start date.
  useEffect(() => {
    if (!pick.id || !/^\d{4}-\d{2}-\d{2}$/.test(effDate)) return
    let cancelled = false
    fetch(`/api/eb/scheme?company=${pick.id}&effective=${effDate}`, { cache: 'no-store' }).then(r => r.json()).then((d: SchemeAnswer) => {
      if (!cancelled && d.tables) setPrevious(d.previous ?? null)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [pick.id, effDate])

  /** Keeps what was read in this session in the scheme file for the plan year being priced. */
  function keepInScheme() {
    if (!pick.id || !members) return
    const body: Record<string, unknown> = { company_id: pick.id, effective_date: effDate, basis, insurer: current || null }
    if (!fromScheme.current.census) body.census = { file: file?.name ?? 'Census', members }
    if (lastYear && !fromScheme.current.lastYear) {
      body.last_year = lastYear
      body.last_year_files = [...uploads.map(f => ({ name: f.name })), ...docIds.map(id => ({ name: docs.find(x => x.attachment_id === id)?.filename ?? 'Document', attachment_id: id }))]
    }
    void fetch('/api/eb/scheme', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).then((d: { scheme?: SchemeAnswer['scheme'] }) => {
      const sc = d.scheme
      if (!sc) return
      fromScheme.current = { census: !!sc.census, lastYear: !!sc.last_year }
      setScheme({ plan_year: sc.plan_year, census: sc.census ? { at: sc.census_read_at, by: sc.census_read_by } : null, last_year: sc.last_year ? { at: sc.last_year_read_at, by: sc.last_year_read_by } : null })
    }).catch(() => {})
  }

  /** A census read in full (an HR link's list, a reopened quotation): every category, the first four ticked. */
  function takeCensus(name: string, ms: Member[]) {
    const read = censusCategories(ms)
    setFile({ name }); setMembers(ms); setPriced(null); setCensusAi(false)
    setIncluded(read.slice(0, MAX_CATEGORIES).map(c => c.name))
  }

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

  // A kept quotation reopened (Edit quotation): its census, categories, insurer, last year's policy, columns and schedules, priced again.
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
      setPick({ id: d.quotation.company_id, name: d.quotation.company_name })
      setEffDate(d.effectiveDate); setBasis(d.basis)
      setCurrent(e?.current ?? '')
      setLastYear(e?.lastYear ?? null)
      setFile({ name: `Census on V${d.quotation.version}` })
      setMembers(ms)
      setIncluded(e?.included?.length ? e.included : Object.keys(d.picks))
      if (e?.mode) setMode(e.mode)
      if (e?.tier) setTier(e.tier)
      const kept = e?.columns ?? []
      setSchedules(kept.flatMap(c => c.kind === 'schedule' ? [{ id: c.id, name: c.schedule.file, busy: false, schedule: c.schedule }] : []))
      setInitialInclude(d.products)
      setSavedId(d.quotation.id)
      const brochure = kept.filter((c): c is BrochureCol => c.kind !== 'schedule')
      setAutoPrice(brochure.length ? { columns: brochure } : { legacy: d.picks })
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

  // ── Census ────────────────────────────────────────────────────────────────────────────────────
  async function readCensus(src: Src, pw?: string, ai = false) {
    setReading(true); setError(null); setFile(src); setPriced(null)
    try {
      const url = ai ? '/api/group-benefits/census/read-ai' : '/api/group-benefits/census/read'
      let res: Response
      if (src.upload) { const fd = new FormData(); fd.append('file', src.upload); if (pw) fd.append('password', pw); res = await fetch(url, { method: 'POST', body: fd }) }
      else res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachment_id: src.attachmentId, password: pw || undefined }) })
      const d = await res.json().catch(() => ({})) as { sheets?: SheetRead[]; needsPassword?: boolean; wrongPassword?: boolean; passwordHint?: string | null; readWithAi?: boolean; error?: string }
      if (d.needsPassword) { setNeedsPassword({ wrong: !!d.wrongPassword }); if (d.passwordHint && !pw) setPassword(d.passwordHint); return }
      if (!res.ok || !d.sheets) { setError(d.error ?? `The census could not be read (${res.status}).`); return }
      setNeedsPassword(null)
      const ms = d.sheets.flatMap(s => s.members)
      if (!ms.length) {
        if (d.readWithAi && !ai) { setCensusAi(true); return }
        setError('No people were read from this file. Check it is the census.'); return
      }
      setCensusAi(false)
      fromScheme.current.census = false
      setMembers(ms)
      setIncluded(censusCategories(ms).slice(0, MAX_CATEGORIES).map(c => c.name))
    } catch (e) { setError(e instanceof Error ? e.message : 'The census could not be read.') }
    finally { setReading(false) }
  }
  async function removeCensus() {
    if (!(await confirm({ title: `Remove ${file?.name ?? 'the census'}?`, body: 'The categories and premiums read from it go with it. The file stays where it came from.', action: 'Remove', danger: true }))) return
    clearCensus()
  }
  function toggle(name: string, on: boolean) {
    setPriced(null)
    setIncluded(cur => on ? (cur.length >= MAX_CATEGORIES ? cur : cats.filter(c => cur.includes(c.name) || c.name === name).map(c => c.name)) : cur.filter(n => n !== name))
  }

  // ── Last year's policy ────────────────────────────────────────────────────────────────────────
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
      fromScheme.current.lastYear = false
      setLastYear(ly); setPriced(null)
      if (ly.periodTo) { const n = new Date(`${ly.periodTo}T00:00:00Z`); n.setUTCDate(n.getUTCDate() + 1); setEffDate(n.toISOString().slice(0, 10)) }
      setBasis('renewal')
      // The insurer read: one of the five, else "Unknown: <the name read>". Never a guess.
      const named = insurerOf([ly.insurer, ly.product].filter(Boolean).join(' '))
      if (named) setCurrent(named)
    } catch (e) { setError(e instanceof Error ? e.message : "Last year's policy could not be read.") }
    finally { setReadingPolicy(false) }
  }
  async function removePolicy() {
    if (!(await confirm({ title: 'Remove last year’s policy?', body: 'The current cover and premium read from it go with it. The files stay where they came from.', action: 'Remove', danger: true }))) return
    clearPolicy()
  }
  async function removeUpload(i: number) {
    if (!(await confirm({ title: `Remove ${uploads[i]?.name ?? 'this file'}?`, body: 'It is taken off this quotation only.', action: 'Remove', danger: true }))) return
    setUploads(u => u.filter((_, j) => j !== i))
  }
  async function removeDoc(id: string, name: string) {
    if (!(await confirm({ title: `Remove ${name}?`, body: 'It is taken off this quotation only. The email keeps it.', action: 'Remove', danger: true }))) return
    setDocIds(d => d.filter(x => x !== id))
  }

  // ── Insurer pricing schedules ─────────────────────────────────────────────────────────────────
  async function readSchedule(s: SchedFile, ai = false) {
    setSchedules(cur => cur.map(x => x.id === s.id ? { ...x, busy: true, error: undefined } : x))
    try {
      let res: Response
      if (s.upload) { const fd = new FormData(); fd.append('file', s.upload); if (ai) fd.append('ai', '1'); res = await fetch('/api/eb/schedule/read', { method: 'POST', body: fd }) }
      else res = await fetch('/api/eb/schedule/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachment_id: s.attachmentId, ...(ai ? { ai: '1' } : {}) }) })
      const d = await res.json().catch(() => ({})) as { schedule?: InsurerSchedule; error?: string }
      setSchedules(cur => cur.map(x => x.id === s.id ? { ...x, busy: false, ...(res.ok && d.schedule ? { schedule: d.schedule } : { error: d.error ?? `Not read (${res.status}).` }) } : x))
    } catch (e) { setSchedules(cur => cur.map(x => x.id === s.id ? { ...x, busy: false, error: e instanceof Error ? e.message : 'Not read.' } : x)) }
  }
  function addSchedules(srcs: Src[]) {
    const fresh = srcs.slice(0, 10).map(s => ({ ...s, id: newId('sch'), busy: true }))
    setSchedules(cur => [...cur, ...fresh])
    for (const s of fresh) void readSchedule(s)
  }
  async function removeSchedule(s: SchedFile) {
    if (!(await confirm({ title: `Remove ${s.name}?`, body: 'Its column leaves Compare. The file stays where it came from.', action: 'Remove', danger: true }))) return
    setSchedules(cur => cur.filter(x => x.id !== s.id))
  }

  // ── Prices ────────────────────────────────────────────────────────────────────────────────────
  async function generate(keep?: Keep) {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/eb/price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        effective_date: effDate, basis, current_insurer: current.startsWith(UNKNOWN_INSURER) ? current.slice(UNKNOWN_INSURER.length) : current || null,
        last_year: lastYear, categories: chosen.map(c => ({ name: c.name, members: c.members, today: c.today })),
      }) })
      const d = await res.json().catch(() => ({})) as Priced & { error?: string }
      if (!res.ok || !d.categories) { setError(d.error ?? `The premiums were not worked out (${res.status}).`); return }
      setPriced(d)
      if (!keep) keepInScheme()
      const legacy = keep?.legacy
      const reopened = keep?.columns
      const brochures: BrochureCol[] = d.products.map(p => {
        const was = reopened?.find(c => c.kind === 'brochure' && c.product === p)
        const picks = was ? was.picks : legacy ? Object.fromEntries(Object.entries(legacy).map(([cat, byProduct]) => [cat, byProduct[p]])) as ColumnPicks : undefined
        return { id: was?.id ?? p, kind: 'brochure', product: p, copyOf: null, picks: validPicks(d, p, picks, tier) }
      })
      const copies = (reopened ?? cols).filter(c => c.kind === 'copy' && d.products.includes(c.product)).map(c => ({ ...c, picks: validPicks(d, c.product, c.picks, tier) }))
      setCols([...brochures, ...copies])
      requestAnimationFrame(() => document.getElementById('eb-options')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (e) { setError(e instanceof Error ? e.message : 'The premiums were not worked out.') }
    finally { setBusy(false) }
  }
  function chooseTier(t: Tier) {
    setTier(t)
    if (priced) setCols(cur => cur.map(c => c.kind === 'brochure' ? { ...c, picks: tierPicks(priced, c.product, t) } : c))
  }
  function choose(colId: string, category: string, key: CoverKey, plan: string) {
    if (!priced) return
    setCols(cur => cur.map(c => c.id === colId ? choosePlan(priced, c, category, key, plan) as BrochureCol : c))
  }
  function copyColumn(colId: string) {
    const src = cols.find(c => c.id === colId)
    if (!src) return
    setCols(cur => [...cur, { id: newId('copy'), kind: 'copy', product: src.product, copyOf: src.id, picks: JSON.parse(JSON.stringify(src.picks)) as ColumnPicks }])
  }
  async function removeColumn(colId: string) {
    if (!(await confirm({ title: 'Remove this copy?', body: 'The column and its plan choices go. The original stays.', action: 'Remove', danger: true }))) return
    setCols(cur => cur.filter(c => c.id !== colId))
  }

  // Brochure columns, then the insurers' schedules (Insurer pricing), then copies at the far right.
  const allCols: EbColumn[] = useMemo(() => [
    ...cols.filter(c => c.kind === 'brochure'),
    ...(mode === 'insurer' ? schedules.flatMap(s => s.schedule?.figures.length ? [{ id: s.id, kind: 'schedule' as const, schedule: s.schedule }] : []) : []),
    ...cols.filter(c => c.kind === 'copy'),
  ], [cols, schedules, mode])
  // Last year's premium is the Current column only when every category of the census is priced.
  const currentPremium = useMemo(() => currentFromLastYear(cats.length && chosen.length === cats.length ? lastYear : null), [lastYear, cats.length, chosen.length])
  const model = useMemo(() => priced ? compareModel(priced, allCols, currentPremium, tier) : null, [priced, allCols, currentPremium, tier])
  const editState = useMemo<EditState | null>(() => members ? { members, included, designs: {}, current, lastYear, mode, tier, columns: allCols } : null, [members, included, current, lastYear, mode, tier, allCols])

  const lyNet = lastYearNet(lastYear)
  const insurerOptions = [...HOUSE_INSURERS as readonly string[], ...(current.startsWith(UNKNOWN_INSURER) ? [current] : [])]
  const company = pick.name.trim()
  const unaged = priced?.notes.map(n => n.match(/^(\d+) (?:life has|lives have) no date of birth/)?.[1]).find(Boolean)

  const censusAdded = file ? [
    <FileRow key="census" name={file.name} meta={members ? [`${members.length} lives · ${cats.length} ${cats.length === 1 ? 'category' : 'categories'}`, fromScheme.current.census && scheme ? `Scheme file ${scheme.plan_year} · ${readBy(scheme.census) ?? 'read'}` : 'read'].join(' · ') : reading ? 'Reading every tab…' : censusAi ? 'No rows read by code' : needsPassword ? 'Password-protected' : undefined}>
      {censusAi && !members && <Btn size="xs" loading={reading} disabled={reading} onClick={() => void readCensus(file, undefined, true)}>Read with AI</Btn>}
      {(members || censusAi || needsPassword) && <Btn size="xs" level="tertiary" onClick={() => void removeCensus()}>Remove</Btn>}
    </FileRow>,
  ] : []
  const policyAdded = [
    ...uploads.map((f, i) => <FileRow key={`u${i}`} name={f.name} meta={`${Math.max(1, Math.round(f.size / 1024))} KB`}><Btn size="xs" level="tertiary" aria-label={`Remove ${f.name}`} onClick={() => void removeUpload(i)}>Remove</Btn></FileRow>),
    ...docIds.map(id => { const f = docs.find(x => x.attachment_id === id); const name = f?.filename ?? 'Document'; return <FileRow key={id} name={name} meta={f ? fmtDate(f.at) : undefined}><Btn size="xs" level="tertiary" aria-label={`Remove ${name}`} onClick={() => void removeDoc(id, name)}>Remove</Btn></FileRow> }),
  ]
  const scheduleAdded = schedules.map(s => (
    <FileRow key={s.id} name={s.name} meta={s.busy ? 'Reading…' : s.error ? s.error : s.schedule ? [s.schedule.insurer ?? 'Insurer not named', scheduleSummary(s.schedule)].join(' · ') : undefined}>
      {!s.busy && s.schedule && !s.schedule.figures.length && <Btn size="xs" onClick={() => void readSchedule(s, true)}>Read with AI</Btn>}
      {!s.busy && s.schedule && s.schedule.figures.some(f => f.status !== 'read') && s.schedule.readBy === 'code' && <Btn size="xs" level="tertiary" onClick={() => void readSchedule(s, true)}>Read with AI</Btn>}
      <Btn size="xs" level="tertiary" aria-label={`Remove ${s.name}`} onClick={() => void removeSchedule(s)}>Remove</Btn>
    </FileRow>
  ))

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4" aria-labelledby="eb-step1">
        <div>
          <div className="text-small font-semibold text-trs-muted">Step 1</div>
          <h2 id="eb-step1" className="m-0 text-title font-medium">Pricing</h2>
        </div>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2" role="group" aria-label="Pricing">
          <ChoiceCard pressed={mode === 'brochure'} onClick={() => setMode('brochure')} title="Brochure pricing" line="Priced now from the insurers’ published rates"
            aside={<>Census<br />Last year’s policy and premium</>} />
          <ChoiceCard pressed={mode === 'insurer'} onClick={() => setMode('insurer')} title="Insurer pricing" line="Insurers price this census; their schedules are compared"
            aside={<>Census<br />Last year’s policy and premium<br />Insurer pricing schedules</>} />
        </div>
        <div className="mx-auto mt-2 flex w-full max-w-xl flex-col items-center gap-1.5">
          <div className="w-full"><CompanyField value={pick} onChange={setPick} allowCreate listId="eb-company-options" /></div>
          {threads != null && <span className="text-small text-trs-muted">{`Files found in ${threads} filed ${threads === 1 ? 'thread' : 'threads'}`}</span>}
        </div>
        <div className={`grid grid-cols-1 gap-x-8 gap-y-8 ${mode === 'insurer' ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
          <DocColumn id="eb-census" title="Census" company={company}
            add={{ label: reading && file?.upload ? 'Reading every tab…' : 'Add census', types: '.xlsx · .xls · .xlsm · .csv · .pdf', accept: '.xlsx,.xls,.xlsm,.csv,.pdf', disabled: reading, onFiles: fs => void readCensus({ name: fs[0].name, upload: fs[0] }) }}
            added={censusAdded} found={sources} isAdded={f => file?.attachmentId === f.attachment_id && !!members}
            busyId={reading && file?.attachmentId ? file.attachmentId : null} onAddFound={f => void readCensus({ name: f.filename, attachmentId: f.attachment_id })} />
          <DocColumn id="eb-policy" title="Last year’s policy and premium" company={company}
            add={{ label: 'Add policy documents', types: 'Schedule · debit note · renewal notice · .pdf · .png · .jpg · .xlsx', accept: '.pdf,.png,.jpg,.jpeg,.xlsx', multiple: true, disabled: readingPolicy, onFiles: fs => setUploads(u => [...u, ...fs].slice(0, 12)) }}
            added={policyAdded} found={docs.slice(0, 10)} isAdded={f => docIds.includes(f.attachment_id)}
            onAddFound={f => setDocIds(d => d.includes(f.attachment_id) ? d : [...d, f.attachment_id].slice(0, 12))} />
          {mode === 'insurer' && (
            <DocColumn id="eb-schedules" title="Insurer pricing schedules" company={company}
              add={{ label: 'Add insurer schedules', types: 'One file per insurer · .xlsx · .xls · .csv · .pdf', accept: '.xlsx,.xls,.csv,.pdf', multiple: true, onFiles: fs => addSchedules(fs.map(f => ({ name: f.name, upload: f }))) }}
              added={scheduleAdded} found={schedSources} isAdded={f => schedules.some(s => s.attachmentId === f.attachment_id)}
              onAddFound={f => addSchedules([{ name: f.filename, attachmentId: f.attachment_id }])} />
          )}
        </div>

        <EbOptionalFiles files={optional} />

        {needsPassword && file && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label={needsPassword.wrong ? 'That password does not open the file' : 'This file is password-protected'}>
              <Input id="eb-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
            </Field>
            <Btn onClick={() => void readCensus(file, password)} loading={reading}>Open</Btn>
          </div>
        )}
        {(uploads.length > 0 || docIds.length > 0) && !lastYear && (
          <div><Btn loading={readingPolicy} disabled={readingPolicy} onClick={() => void readPolicy()}>{readingPolicy ? `Reading ${uploads.length + docIds.length} ${uploads.length + docIds.length === 1 ? 'document' : 'documents'}…` : 'Read policy'}</Btn></div>
        )}
        {lastYear && (
          <div className="flex flex-col gap-1 text-body">
            <div className="flex flex-wrap items-center gap-3"><span className="font-medium">{[lastYear.insurer, lastYear.product].filter(Boolean).join(' · ') || 'Insurer not stated'}</span><Btn size="xs" level="tertiary" onClick={() => void removePolicy()}>Remove policy read</Btn></div>
            <div className="text-trs-muted">{[fromScheme.current.lastYear && scheme ? `Scheme file ${scheme.plan_year} · ${readBy(scheme.last_year) ?? 'read'}` : null, lastYear.policyNumber && `Policy ${lastYear.policyNumber}`, lastYear.periodFrom && lastYear.periodTo && `${fmtDate(lastYear.periodFrom)} to ${fmtDate(lastYear.periodTo)}`, lyNet != null ? `${fmtMoney0(lyNet)} a year, net of GST` : 'No premium read'].filter(Boolean).join(' · ')}</div>
            {lastYear.conflicts.map(c => <div key={c} className="text-trs-warn">{c}</div>)}
          </div>
        )}
        {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}

        {members && (
          <>
            <Register label="Census" minWidth={760}>
              <RegisterHead>
                {['Census category', 'Employees', 'Spouses', 'Children', 'Lives', 'Plan on the census', 'In this quotation'].map((h, i) => <RegisterTh key={h} first={i === 0} last={i === 6}>{h}</RegisterTh>)}
              </RegisterHead>
              <tbody>
                {cats.map(c => {
                  const on = included.includes(c.name)
                  return (
                    <RegisterRow key={c.name}>
                      <RegisterCell first primary={c.name} />
                      <RegisterCell>{c.employees}</RegisterCell>
                      <RegisterCell>{c.spouses}</RegisterCell>
                      <RegisterCell>{c.children}</RegisterCell>
                      <RegisterCell>{c.lives}</RegisterCell>
                      <RegisterCell><span className={c.plan ? 'text-trs-ink' : 'text-trs-subtle'}>{c.plan ?? 'Not on the census'}</span></RegisterCell>
                      <RegisterCell last><Checkbox checked={on} disabled={!on && included.length >= MAX_CATEGORIES} onChange={v => toggle(c.name, v)} label={`Include ${c.name}`} /></RegisterCell>
                    </RegisterRow>
                  )
                })}
                <RegisterRow className="row-total">
                  <RegisterCell first primary="Total" />
                  {(['employees', 'spouses', 'children', 'lives'] as const).map(k => <RegisterCell key={k}>{cats.reduce((a, c) => a + c[k], 0)}</RegisterCell>)}
                  <RegisterCell /><RegisterCell last>{`${included.length} of ${MAX_CATEGORIES}`}</RegisterCell>
                </RegisterRow>
              </tbody>
            </Register>
            <p className="m-0 text-small text-trs-muted">{chosen.reduce((a, c) => a + c.employees, 0)} employees in this quotation · spouses and children not counted as headcount</p>
            <EbCensusReview members={members} effectiveDate={effDate} previous={previous} />
            {chosen.length > 0 && <EbRoutes members={chosen.flatMap(c => c.members)} effectiveDate={effDate} warnings={priced?.warnings} />}
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Policy start date"><Input id="eb-start" type="date" value={effDate} onChange={e => { setEffDate(e.target.value); setPriced(null) }} /></Field>
              <Field label="Basis"><Segmented size="sm" label="Basis" value={basis} onChange={v => { setBasis(v); setPriced(null) }} options={[{ value: 'renewal', label: 'Renewal' }, { value: 'new_business', label: 'New business' }]} /></Field>
              <Field label="Current insurer">
                <SelectBox id="eb-current" label="Current insurer" size="md" value={current} onChange={v => { setCurrent(v); setPriced(null) }} options={[{ value: '', label: 'Not known' }, ...insurerOptions.map(i => ({ value: i, label: i }))]} />
              </Field>
            </div>
          </>
        )}
        <div className="flex justify-end">
          <Btn level="primary" loading={busy} disabled={busy || !members || !chosen.length} onClick={() => void generate()}>{busy ? 'Pricing every product…' : 'Generate prices'}</Btn>
        </div>
      </section>

      {busy && !priced && <Spinner label="Pricing every product…" />}

      {priced && (
        <section id="eb-options" className="flex flex-col gap-4" aria-labelledby="eb-step2">
          <div>
            <div className="text-small font-semibold text-trs-muted">Step 2</div>
            <h2 id="eb-step2" className="m-0 text-title font-medium">Options for the client</h2>
          </div>
          <EbTiers priced={priced} tier={tier} onTier={chooseTier} lastYearRead={!!lastYear} />
        </section>
      )}

      {priced && model && members && editState && (
        <section className="flex flex-col gap-4" aria-labelledby="eb-step3">
          <div>
            <div className="text-small font-semibold text-trs-muted">Step 3</div>
            <h2 id="eb-step3" className="m-0 text-title font-medium">Compare</h2>
            <p className="m-0 mt-1 text-small text-trs-muted">{`${model.employees} employees · ${priced.categories.reduce((a, c) => a + c.lives, 0)} lives${unaged ? ` · ${unaged} without an age, not priced` : ''} · S$ a year, net of GST · ${priced.workbook.name}`}</p>
          </div>
          {mode === 'insurer' && !allCols.some(c => c.kind === 'schedule') && <Chip tone="amber">No insurer schedule read yet</Chip>}
          <EbCompare model={model} onChoose={choose} onCopy={copyColumn} onRemove={id => void removeColumn(id)} />
          <ProposalSection model={model} cols={allCols} members={members} company={pick.name} companyId={pick.id} threadId={threadId} effectiveDate={effDate} basis={basis}
            workbook={priced.workbook?.name ?? null} savedId={savedId} onSaved={setSavedId} initialInclude={initialInclude} edit={editState} />
        </section>
      )}
    </div>
  )
}
