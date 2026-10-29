'use client'

/**
 * Plan builder: one requirement per employee category sets the plan at every insurer; the prices
 * update as the broker changes it. Tier A is always priced; Tier B (Cigna) only when included.
 * Any single plan can be changed by hand. Save writes the plans and prices onto this quotation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Btn, Chip, Segmented, inputCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh } from '@/components/ui/register'
import { COVER_LABEL, DEFAULT_REQUIREMENT, type CategoryInput, type CoverKey, type GridCell, type Requirement } from '@/lib/gb/ladder'
import type { BuilderInsurer, BuilderTable } from '@/lib/gb/builder'

type CensusMember = { name: string; category: string; relationship: string; dob: string | null; occupation_class: string | null; work_pass?: string | null }
type Quotation = { id: string; company_name: string | null; effective_date: string | null; basis: string | null; census: CensusMember[]; requirement: { categories?: CategoryInput[]; employee_categories?: Record<string, string>; budget?: number | null; tier_b?: boolean } | null }
type Priced = { insurers: BuilderInsurer[]; grids: Record<string, Record<string, GridCell[]>>; tables: BuilderTable[]; employees: number; dependants: number }

const INK = '#0f1412', MUTED = '#4a5550', SOFT = '#7a847f', RED = '#a1242f', GREEN = '#1f6b3e'
const money = (n: number, d = 0) => n.toLocaleString('en-SG', { minimumFractionDigits: d, maximumFractionDigits: d })
const isDep = (r: string) => /spouse|child|dependa/i.test(r)
const baseCategory = (c: string) => c.replace(/ · (dependants|foreign workers)$/, '')
const SHORT: Record<string, string> = { rcc: 'Raffles Health', income: 'Income', qbe: 'QBE', singlife: 'Singlife', aia: 'AIA', cigna: 'Cigna' }
const PRODUCT: Record<string, string> = { rcc: 'RCC Enhanced III', income: 'FlexCare', qbe: 'Steadfast MCare+', singlife: 'MyBenefits Plus', aia: 'Flexi Vital Care Plus', cigna: 'Care Connect 1.0' }
const COVERS: CoverKey[] = ['GHS', 'EMM', 'GOPC', 'GOSC', 'GD', 'GPA', 'GTL', 'GCI']

function ageLast(dob: string | null, eff: string): number | null {
  const m = dob ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dob) : null
  const e = /^(\d{4})-(\d{2})-(\d{2})/.exec(eff)
  if (!m || !e) return null
  let a = +e[1] - +m[1]
  if (+e[2] < +m[2] || (+e[2] === +m[2] && +e[3] < +m[3])) a--
  return a
}

/** Requirement controls. Values are strings for the segmented control; null and 0 are 'none'. */
type Ctl = { key: keyof Requirement | 'htype' | 'bed'; label: string; options: [string, string][] }
const GROUPS: { title: string; controls: Ctl[] }[] = [
  { title: 'Hospital', controls: [
    { key: 'htype', label: 'Type', options: [['none', 'None'], ['G', 'Govt'], ['P', 'Private']] },
    { key: 'bed', label: 'Room', options: [['4', '4-bed'], ['2', '2-bed'], ['1', '1-bed']] },
    { key: 'wardLevel', label: 'Limit', options: [['entry', 'Entry'], ['top', 'Top']] },
    { key: 'gmm', label: 'Major medical', options: [['false', 'None'], ['true', 'Add']] },
  ] },
  { title: 'Outpatient', controls: [
    { key: 'gp', label: 'GP', options: [['none', 'None'], ['nil', '$0'], ['copay', 'Co-pay']] },
    { key: 'sp', label: 'Specialist', options: [['none', 'None'], ['entry', 'Entry'], ['top', 'Top']] },
    { key: 'dental', label: 'Dental', options: [['none', 'None'], ['entry', 'Entry'], ['top', 'Top']] },
  ] },
  { title: 'Sum assured, employees', controls: [
    { key: 'pa', label: 'Accident', options: [['0', 'None'], ['100000', '$100k'], ['250000', '$250k'], ['500000', '$500k']] },
    { key: 'gtl', label: 'Term life', options: [['0', 'None'], ['100000', '$100k'], ['200000', '$200k'], ['500000', '$500k']] },
    { key: 'gci', label: 'Critical illness', options: [['0', 'None'], ['50000', '$50k'], ['100000', '$100k']] },
  ] },
  { title: 'Dependants', controls: [
    { key: 'deps', label: 'Spouse, children', options: [['medical', 'Medical'], ['none', 'None']] },
  ] },
]

function getVal(r: Requirement, key: Ctl['key']): string {
  if (key === 'htype') return r.ward ? r.ward[0] : 'none'
  if (key === 'bed') return r.ward ? r.ward[1] : '1'
  const v = r[key as keyof Requirement]
  if (v === null || v === undefined) return key === 'pa' || key === 'gtl' || key === 'gci' ? '0' : 'none'
  return String(v)
}
function setVal(r: Requirement, key: Ctl['key'], v: string): Requirement {
  const n = { ...r }
  if (key === 'htype') { n.ward = v === 'none' ? null : (`${v}${v === 'G' && (r.ward?.[1] ?? '1') === '2' ? '1' : r.ward?.[1] ?? '1'}` as Requirement['ward']); return n }
  if (key === 'bed') { const t = r.ward?.[0] ?? 'P'; n.ward = (`${t}${t === 'G' && v === '2' ? '1' : v}`) as Requirement['ward']; return n }
  if (key === 'pa' || key === 'gtl' || key === 'gci') { n[key] = +v || null; return n }
  if (key === 'gmm') { n.gmm = v === 'true'; return n }
  if (key === 'deps') { n.deps = v === 'none' ? 'none' : 'medical'; return n }
  ;(n as Record<string, unknown>)[key] = v === 'none' ? null : v
  return n
}

export default function PlanBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [q, setQ] = useState<Quotation | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cats, setCats] = useState<CategoryInput[]>([])
  const [active, setActive] = useState(0)
  const [catOf, setCatOf] = useState<Record<number, string>>({})
  const [eff, setEff] = useState('')
  const [basis, setBasis] = useState<'new_business' | 'renewal'>('new_business')
  const [tierB, setTierB] = useState(false)
  const [budget, setBudget] = useState('')
  const [priced, setPriced] = useState<Priced | null>(null)
  const [pricing, setPricing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/group-benefits/quote/${id}`, { cache: 'no-store' }).then(r => r.json()).then((d: { quotation?: Quotation; error?: string }) => {
      if (!d.quotation) { setLoadError(d.error ?? 'Quotation not found'); return }
      const quote = d.quotation
      setQ(quote)
      setEff(quote.effective_date ?? new Date().toISOString().slice(0, 10))
      setBasis(quote.basis === 'renewal' ? 'renewal' : 'new_business')
      const req = quote.requirement
      setTierB(!!req?.tier_b)
      setBudget(req?.budget ? String(req.budget) : '')
      const census = quote.census ?? []
      const names = [...new Set(census.filter(m => !isDep(m.relationship)).map(m => baseCategory(m.category || 'Staff')))]
      const categories = req?.categories?.length ? req.categories : [{ name: names.length === 1 ? names[0] : 'All employees', requirement: { ...DEFAULT_REQUIREMENT }, overrides: {} }]
      setCats(categories)
      const assign: Record<number, string> = {}
      census.forEach((m, i) => {
        if (isDep(m.relationship)) return
        const saved = req?.employee_categories?.[String(i)]
        const base = baseCategory(m.category || '')
        assign[i] = saved && categories.some(c => c.name === saved) ? saved : categories.some(c => c.name === base) ? base : categories[0].name
      })
      setCatOf(assign)
    }).catch(e => setLoadError(e instanceof Error ? e.message : 'Could not load'))
  }, [id])

  /** The census with each life's category: employees by assignment, dependants by their employee's. */
  const members = useMemo(() => {
    if (!q) return []
    let current = cats[0]?.name ?? 'Staff'
    return (q.census ?? []).map((m, i) => {
      if (!isDep(m.relationship)) current = catOf[i] ?? cats[0]?.name ?? 'Staff'
      return { name: m.name, category: current, relationship: m.relationship, dob: m.dob, occupation_class: m.occupation_class ?? '1', work_pass: m.work_pass ?? null }
    })
  }, [q, cats, catOf])

  const body = useCallback((action: 'price' | 'save') => JSON.stringify({
    action, quotation_id: id, members, categories: cats, effective_date: eff, basis, tier_b: tierB,
    budget: +budget || null, employee_categories: Object.fromEntries(Object.entries(catOf).map(([k, v]) => [k, v])),
  }), [id, members, cats, eff, basis, tierB, budget, catOf])

  // Live prices, a moment after the last change.
  const seq = useRef(0)
  useEffect(() => {
    if (!q || !members.length || !cats.length || !eff) return
    const n = ++seq.current
    const t = setTimeout(async () => {
      setPricing(true)
      try {
        const res = await fetch('/api/group-benefits/builder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body('price') })
        const d = await res.json()
        if (n !== seq.current) return
        if (!res.ok) { setError(d.error ?? `Pricing failed (${res.status})`); return }
        setError(null); setPriced(d)
      } catch (e) { if (n === seq.current) setError(e instanceof Error ? e.message : 'Pricing failed') }
      finally { if (n === seq.current) setPricing(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, members, cats, eff, basis, tierB, body])

  async function save() {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/group-benefits/builder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body('save') })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? `Save failed (${res.status})`); return }
      router.push(`/pricing-matrix/quote/${id}`)
    } finally { setSaving(false) }
  }

  const cat = cats[active]
  const updateCat = (patch: Partial<CategoryInput>) => setCats(cs => cs.map((c, i) => (i === active ? { ...c, ...patch } : c)))
  const setReq = (key: Ctl['key'], v: string) => cat && updateCat({ requirement: setVal(cat.requirement, key, v), overrides: {} })
  const addCategory = () => {
    const name = cats.some(c => c.name === 'Management') ? `Category ${cats.length + 1}` : 'Management'
    setCats(cs => [...cs, { name, requirement: { ...(cat?.requirement ?? DEFAULT_REQUIREMENT) }, overrides: {} }])
    setActive(cats.length)
  }
  const removeCategory = () => {
    if (cats.length < 2 || !cat) return
    const fallback = cats.find((_, i) => i !== active)!.name
    setCatOf(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v === cat.name ? fallback : v])))
    setCats(cs => cs.filter((_, i) => i !== active)); setActive(0)
  }
  const renameCategory = (name: string) => {
    if (!cat) return
    const old = cat.name
    updateCat({ name })
    setCatOf(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v === old ? name : v])))
  }

  if (loadError) return <div className="px-8 py-10 text-[14px]" style={{ color: RED }}>{loadError}</div>
  if (!q || !cat) return <div className="px-8 py-10 text-[14px]" style={{ color: MUTED }}>Loading…</div>

  const employees = (q.census ?? []).map((m, i) => ({ m, i })).filter(x => !isDep(x.m.relationship))
  const budgetN = +budget || null
  const ranked = [...(priced?.insurers ?? [])].sort((a, b) => a.total - b.total)
  const lowest = ranked[0]?.total ?? 0
  const ref = budgetN ?? lowest
  const max = Math.max(ref, ...ranked.map(r => r.total)) * 1.05 || 1
  const tableOf = (rid: string) => priced?.tables.find(t => t.id === rid)
  const gridFor = (rid: string) => priced?.grids[rid]?.[cat.name] ?? []
  const shownCovers = COVERS.filter(c => ranked.some(r => gridFor(r.rate_table_id).some(x => x.cover === c)))

  return (
    <div className="px-6 md:px-8 py-6 max-w-[1320px] mx-auto">
      <Link href={`/pricing-matrix/quote/${id}`} className="inline-flex items-center gap-1.5 text-[13px] no-underline hover:underline" style={{ color: MUTED }}><ArrowLeft size={14} /> Quotation</Link>
      <div className="flex items-end justify-between gap-4 flex-wrap mt-3 mb-5">
        <div>
          <h1 className="m-0 text-[30px] font-medium tracking-[-0.02em]">{q.company_name || 'Untitled quote'}</h1>
          <p className="m-0 mt-1 text-[13.5px]" style={{ color: MUTED }}>{priced ? `${priced.employees} employees · ${priced.dependants} dependants` : `${q.census.length} lives`}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Segmented value={basis} onChange={v => setBasis(v)} options={[{ value: 'new_business', label: 'New business' }, { value: 'renewal', label: 'Renewal' }]} />
          <label className="flex items-center gap-2 text-[13px]" style={{ color: MUTED }}>Effective <input type="date" value={eff} onChange={e => setEff(e.target.value)} className={inputCls + ' !w-[150px]'} /></label>
          <label className="flex items-center gap-2 text-[13px]" style={{ color: MUTED }}>Budget S$ / yr <input type="number" min={0} step={1000} value={budget} placeholder="Not stated" onChange={e => setBudget(e.target.value)} className={inputCls + ' !w-[130px]'} /></label>
          <Btn level="primary" onClick={() => void save()} loading={saving} disabled={saving || !priced}>Save quotation</Btn>
        </div>
      </div>

      {error && <p className="m-0 mb-4 text-[13.5px]" style={{ color: RED }}>{error}</p>}

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Segmented value={String(active)} onChange={v => setActive(+v)} options={cats.map((c, i) => ({ value: String(i), label: c.name, count: Object.values(catOf).filter(x => x === c.name).length }))} />
        {cats.length < 6 && <Btn level="tertiary" onClick={addCategory}><Plus size={14} /> Add category</Btn>}
        <label className="inline-flex items-center gap-2 ml-auto text-[13px]" style={{ color: MUTED }}>
          <input type="checkbox" checked={tierB} onChange={e => setTierB(e.target.checked)} /> Include Tier B (Cigna)
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
        <section className="min-w-0">
          <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 mb-2">
            <label htmlFor="cat-name" className="text-[13px]" style={{ color: MUTED }}>Category</label>
            <div className="flex gap-2">
              <input id="cat-name" value={cat.name} onChange={e => renameCategory(e.target.value)} className={inputCls} />
              {cats.length > 1 && <Btn level="tertiary" onClick={removeCategory} aria-label="Remove category"><Trash2 size={14} /></Btn>}
            </div>
          </div>
          {GROUPS.map(g => (
            <div key={g.title}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] pt-4 pb-1.5" style={{ color: GREEN }}>{g.title}</div>
              {g.controls.filter(c => !(['bed', 'wardLevel', 'gmm'].includes(c.key) && !cat.requirement.ward)).map(c => (
                <div key={c.key} className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 py-1">
                  <span className="text-[13px]" style={{ color: MUTED }}>{c.label}</span>
                  <Segmented className="!grid w-full grid-flow-col auto-cols-fr" value={getVal(cat.requirement, c.key)} onChange={v => setReq(c.key, v)}
                    options={c.options.filter(([v]) => !(c.key === 'bed' && v === '2' && cat.requirement.ward?.[0] === 'G')).map(([value, label]) => ({ value, label }))} />
                </div>
              ))}
            </div>
          ))}
        </section>

        <section className="min-w-0 flex flex-col gap-5">
          <Register label="Prices" minWidth={760}>
            <RegisterHead>
              <RegisterTh first>Insurer</RegisterTh>
              <RegisterTh align="right">Total S$ / yr</RegisterTh>
              <RegisterTh align="right">Per employee / mo</RegisterTh>
              <RegisterTh>{budgetN ? 'Against budget' : 'Against lowest'}</RegisterTh>
              <RegisterTh last>Notes</RegisterTh>
            </RegisterHead>
            <tbody>
              {!priced && <tr><td colSpan={5} className="px-4 py-6 text-[13.5px]" style={{ color: MUTED }}>{pricing ? 'Pricing…' : 'No prices yet'}</td></tr>}
              {ranked.map(r => {
                const over = r.total - ref
                const notes = [
                  ...(r.group_factor !== 1 ? [`Group factor ×${r.group_factor} on medical`] : []),
                  ...gridFor(r.rate_table_id).flatMap(c => (c.none ? [`${COVER_LABEL[c.cover]}: ${c.none}`] : c.note ? [`${COVER_LABEL[c.cover]}: ${c.note}`] : [])),
                  ...r.underwriting.group,
                  ...(r.underwriting.declarations.length ? [`Health declaration: ${r.underwriting.declarations.length} ${r.underwriting.declarations.length === 1 ? 'life' : 'lives'}`] : []),
                  ...[...new Set(r.gaps.map(g => g.note))].map(n => `${r.gaps.filter(g => g.note === n).length} not priced: ${n}`),
                ]
                return (
                  <tr key={r.rate_table_id} className="align-top" style={{ borderTop: '1px solid #e6e8e4' }}>
                    <td className="sticky left-0 bg-white pl-4 pr-[10px] py-2 whitespace-nowrap">
                      <div className="text-[13.5px] font-medium" style={{ color: INK }}>{SHORT[r.insurer]} {r.tier === 'B' && <Chip tone="amber">Tier B</Chip>}</div>
                      <div className="text-[12px]" style={{ color: SOFT }}>{PRODUCT[r.insurer]}</div>
                    </td>
                    <td className="px-[10px] py-2 text-right tabular-nums">
                      <div className="text-[13.5px] font-medium" style={{ color: INK }}>{money(r.total, 2)}</div>
                      <div className="text-[12px] whitespace-nowrap" style={{ color: SOFT }}>GST {money(r.gst, 2)}</div>
                    </td>
                    <td className="px-[10px] py-2 text-right tabular-nums text-[13.5px]">{priced!.employees ? money(r.total / priced!.employees / 12) : '—'}</td>
                    <td className="px-[10px] py-2 min-w-[150px]">
                      <div className="relative h-2 rounded-full my-1.5" style={{ background: '#f1f0ec' }}>
                        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, r.total / max * 100)}%`, background: budgetN && over > 0 ? RED : '#1f4e3a' }} />
                        <i className="absolute -top-1 -bottom-1 w-[2px]" style={{ left: `${Math.min(100, ref / max * 100)}%`, background: INK }} />
                      </div>
                      <div className="text-[12px]" style={{ color: budgetN ? (over > 0 ? RED : GREEN) : over > 0 ? MUTED : GREEN }}>
                        {budgetN ? (over > 0 ? `${money(over)} over` : `${money(-over)} under`) : over > 0.005 ? `+${money(over)} (+${Math.round(over / lowest * 100)}%)` : 'Lowest'}
                      </div>
                    </td>
                    <td className="px-[10px] pr-4 py-2 text-[12.5px] min-w-[240px]" style={{ color: MUTED }}>
                      {notes.length ? notes.map((n, i) => <div key={i}>{n}</div>) : <span style={{ color: SOFT }}>Meets the requirement</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Register>

          <div>
            <h2 className="m-0 mb-2 text-[15px] font-medium">Plans priced for {cat.name}</h2>
            <Register label="Plans" minWidth={900}>
              <RegisterHead>
                <RegisterTh first>Cover</RegisterTh>
                {ranked.map((r, i) => <RegisterTh key={r.rate_table_id} last={i === ranked.length - 1}>{SHORT[r.insurer]}</RegisterTh>)}
              </RegisterHead>
              <tbody>
                {shownCovers.map(cover => (
                  <tr key={cover} style={{ borderTop: '1px solid #e6e8e4' }} className="align-top">
                    <th scope="row" className="sticky left-0 bg-[#faf9f6] pl-4 pr-[10px] py-2 text-left text-[13px] font-medium whitespace-nowrap">{COVER_LABEL[cover]}</th>
                    {ranked.map(r => {
                      const cell = gridFor(r.rate_table_id).find(c => c.cover === cover)
                      const t = tableOf(r.rate_table_id)
                      const options = cell?.product ? t?.products.find(p => p.code === cell.product)?.plans ?? [] : []
                      const key = `${r.rate_table_id}|${cover}`
                      return (
                        <td key={r.rate_table_id} className="px-[10px] py-2 min-w-[170px]">
                          {!cell ? <span className="text-[12.5px]" style={{ color: SOFT }}>—</span>
                            : !cell.product ? <span className="text-[12.5px]" style={{ color: SOFT }}>{cell.none}</span>
                            : <>
                              <select aria-label={`${SHORT[r.insurer]} ${COVER_LABEL[cover]}`} value={cell.plan ?? ''} className={inputCls + ' !h-8 !text-[13px] !px-2'}
                                onChange={e => updateCat({ overrides: { ...(cat.overrides ?? {}), [key]: e.target.value } })}>
                                <option value="">None</option>
                                {options.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                              {(cell.note || cell.none) && <div className="text-[12px] mt-1" style={{ color: cell.note === 'Changed by broker' ? GREEN : '#8a5a00' }}>{cell.note ?? cell.none}</div>}
                            </>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </Register>
          </div>

          <div>
            <h2 className="m-0 mb-2 text-[15px] font-medium">Employees</h2>
            <Register label="Employees" minWidth={640}>
              <RegisterHead>
                <RegisterTh first>Name</RegisterTh>
                <RegisterTh align="right">Age</RegisterTh>
                <RegisterTh>Dependants</RegisterTh>
                <RegisterTh>Work pass</RegisterTh>
                <RegisterTh last>Category</RegisterTh>
              </RegisterHead>
              <tbody>
                {employees.map(({ m, i }) => {
                  const deps: CensusMember[] = []
                  for (let j = i + 1; j < q.census.length && isDep(q.census[j].relationship); j++) deps.push(q.census[j])
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #e6e8e4' }}>
                      <td className="sticky left-0 bg-white pl-4 pr-[10px] py-1.5 text-[13.5px]">{m.name}</td>
                      <td className="px-[10px] py-1.5 text-right tabular-nums text-[13.5px]">{ageLast(m.dob, eff) ?? '—'}</td>
                      <td className="px-[10px] py-1.5 text-[13px]" style={{ color: deps.length ? INK : SOFT }}>{deps.length ? deps.map(d => `${/spouse/i.test(d.relationship) ? 'Spouse' : 'Child'} ${ageLast(d.dob, eff) ?? '?'}`).join(', ') : 'None'}</td>
                      <td className="px-[10px] py-1.5 text-[13px]" style={{ color: m.work_pass ? INK : SOFT }}>{m.work_pass || '—'}</td>
                      <td className="px-[10px] pr-4 py-1.5">
                        {cats.length > 1
                          ? <select aria-label={`Category for ${m.name}`} value={catOf[i] ?? cats[0].name} onChange={e => setCatOf(c => ({ ...c, [i]: e.target.value }))} className={inputCls + ' !h-8 !text-[13px] !w-[180px]'}>
                              {cats.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                            </select>
                          : <span className="text-[13px]" style={{ color: MUTED }}>{cats[0].name}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Register>
          </div>

          {ranked.some(r => r.underwriting.declarations.length) && (
            <div>
              <h2 className="m-0 mb-2 text-[15px] font-medium">Health declarations</h2>
              <Register label="Health declarations" minWidth={640}>
                <RegisterHead><RegisterTh first>Insurer</RegisterTh><RegisterTh>Life</RegisterTh><RegisterTh last>Reason</RegisterTh></RegisterHead>
                <tbody>
                  {ranked.flatMap(r => r.underwriting.declarations.map((d, k) => (
                    <tr key={`${r.rate_table_id}-${k}`} style={{ borderTop: '1px solid #e6e8e4' }}>
                      <td className="sticky left-0 bg-white pl-4 pr-[10px] py-1.5 text-[13px]">{SHORT[r.insurer]}</td>
                      <td className="px-[10px] py-1.5 text-[13px]">{d.member}</td>
                      <td className="px-[10px] pr-4 py-1.5 text-[13px]" style={{ color: MUTED }}>{d.reason}</td>
                    </tr>
                  )))}
                </tbody>
              </Register>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
