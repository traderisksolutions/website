'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { UploadCloud, Loader2, ArrowRight, ArrowLeft, Download, Reply, Sparkles, Trash2, Plus, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { plainToHtml } from '@/components/RichEditor'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { BenefitComparison } from '@/components/group-benefits/BenefitComparison'
import type { Comparison } from '@/lib/gb/compare'
import { toIsoDate } from '@/lib/dates/dob'

// ── Types mirrored from the API ────────────────────────────────────────────────
type Member = { name: string; category: string; relationship: string; dob?: string | null; age?: number | null; occupation_class?: string | null }
type Plan   = { rate_table_id: string; product_code: string; plan_code: string; plan_name: string | null; hospital_type: string | null; beds: string | null }
type Avail  = { rate_table_id: string; insurer_id: string | null; insurer_name: string; product_title: string; age_basis: string; plan_year: number | null; member_types: string[]; plans: Plan[] }
type InsurerResult = { rate_table_id: string; insurer_id: string | null; insurer_name: string; by_product: Record<string, number>; subtotal: number; gst: number; total: number; missing: number }
type Line = { member_index: number; member_name: string; category: string; relationship: string; age: number | null; insurer_name: string; product_code: string; plan_code: string | null; premium: number | null; note: string | null }
/** Quotes compared before 2 Oct 2026 hold generated prose rather than a comparison. */
const isComparison = (a: unknown): a is Comparison =>
  !!a && typeof a === 'object' && Array.isArray((a as Comparison).groups) && Array.isArray((a as Comparison).premium)

const TEMPLATE ='name,category,relationship,dob,age,occupation_class\nJane Tan,Manager,self,1985-04-12,,1\nJohn Tan,Manager,spouse,1987-09-01,,\nBaby Tan,Manager,child,,3,\n'
const money = (n: number) => n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' })

// Minimal CSV parse (name,category,relationship,dob,age).
function parseCensus(text: string): Member[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const header = lines[0].toLowerCase().split(',').map(h => h.trim())
  const col = (n: string) => header.indexOf(n)
  const ci = { name: col('name'), cat: col('category'), rel: col('relationship'), dob: col('dob'), age: col('age'),
    cls: [col('occupation_class'), col('occupation class'), col('class')].find(i => i >= 0) ?? -1 }
  // Dependents (spouse/child) with a blank category inherit the most recent employee's
  // category, so the census can list a family as: employee row, then dependent rows.
  let lastSelfCategory = 'Default'
  return lines.slice(1).map(l => {
    const c = l.split(',').map(x => x.trim())
    const ageRaw = ci.age >= 0 ? c[ci.age] : ''
    const rel = (ci.rel >= 0 ? c[ci.rel] : 'self').toLowerCase() || 'self'
    let category = (ci.cat >= 0 ? c[ci.cat] : '') || ''
    if (rel === 'self') { if (category) lastSelfCategory = category; else category = lastSelfCategory }
    else if (!category) category = lastSelfCategory
    return {
      name: (ci.name >= 0 ? c[ci.name] : '') || 'Member',
      category: category || 'Default',
      relationship: rel,
      // Stored as YYYY-MM-DD, read day-first (Singapore order) at the moment of import, so the
      // saved census can never be read in the wrong order later. A date that cannot be read is
      // dropped and the age column kept; with neither, the line shows as unpriced.
      dob: ci.dob >= 0 && c[ci.dob] ? toIsoDate(c[ci.dob]) : null,
      age: ageRaw && isFinite(Number(ageRaw)) ? Number(ageRaw) : null,
      occupation_class: ci.cls >= 0 && c[ci.cls] ? c[ci.cls] : null,
    }
  }).filter(m => m.name)
}

export function NewQuoteWizard({ onSaved, initialMembers, initialCompany, onDraftReply }: {
  onSaved?: () => void
  initialMembers?: Member[]
  initialCompany?: string
  onDraftReply?: (body: string) => void
}) {
  const [step, setStep] = useState(0)
  const [members, setMembers] = useState<Member[]>([])

  // Seed from a census extracted elsewhere (the Engagement "GB Quote" tab). Stay on step 0
  // so the broker can review/fix the extracted rows before quoting.
  useEffect(() => {
    if (initialMembers && initialMembers.length) setMembers(initialMembers)
  }, [initialMembers])
  useEffect(() => { if (initialCompany) setCompany(initialCompany) }, [initialCompany])
  const [company, setCompany] = useState('')
  const [effDate, setEffDate] = useState(new Date().toISOString().slice(0, 10))
  const [gst, setGst] = useState(9)
  const [basis, setBasis] = useState<'new_business' | 'renewal'>('new_business')
  const [avail, setAvail] = useState<Avail[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  // categoryMap[rate_table_id][product_title][category] = plan_code
  const [map, setMap] = useState<Record<string, Record<string, Record<string, string>>>>({})
  // What the client wants per product (e.g. "GHS: private hospital, 1-bed") — Phase 6b plan
  // matching applies one target across every category for that product; the broker can still
  // override any individual cell afterward.
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [matchingProduct, setMatchingProduct] = useState<string | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ per_insurer: InsurerResult[]; lines: Line[]; quotation_id?: string | null } | null>(null)
  const [quotationId, setQuotationId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Comparison | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const categories = useMemo(() => Array.from(new Set(members.filter(m => m.name.trim()).map(m => m.category))), [members])
  function editMember(i: number, patch: Partial<Member>) { setMembers(prev => prev.map((m, j) => (j === i ? { ...m, ...patch } : m))) }
  const entryKey = (t: Avail) => `${t.rate_table_id}::${t.product_title}`

  function downloadTemplate() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }))
    a.download = 'census-template.csv'; a.click()
  }

  async function loadAvailable() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/group-benefits/quote/available', { cache: 'no-store' })
      const rows: Avail[] = res.ok ? await res.json() : []
      setAvail(rows)
      if (rows.length === 0) setError('No approved pricing yet. Upload + approve an insurer PDF under Rate Tables first.')
      setStep(2)
    } finally { setBusy(false) }
  }

  function toggleEntry(t: Avail) {
    const key = entryKey(t)
    setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
    // Seed default mapping: first plan for every category.
    setMap(prev => {
      const next = { ...prev }
      if (!next[t.rate_table_id]) next[t.rate_table_id] = {}
      if (!next[t.rate_table_id][t.product_title]) {
        const firstPlan = t.plans[0]?.plan_code ?? ''
        next[t.rate_table_id] = { ...next[t.rate_table_id], [t.product_title]: Object.fromEntries(categories.map(c => [c, firstPlan])) }
      }
      return next
    })
  }

  function setPlan(tableId: string, title: string, category: string, plan: string) {
    setMap(prev => ({ ...prev, [tableId]: { ...prev[tableId], [title]: { ...(prev[tableId]?.[title] ?? {}), [category]: plan } } }))
  }

  // Applies the AI's suggested plan_code (per insurer, for this product) across every category
  // mapped to that product — same as picking each one manually, just pre-filled.
  async function suggestPlans(productTitle: string) {
    const target = targets[productTitle]?.trim()
    if (!target) return
    setMatchingProduct(productTitle); setMatchError(null)
    try {
      const selected = avail.filter(t => selectedKeys.has(entryKey(t)))
      const entries = selected.map(t => ({ rate_table_id: t.rate_table_id, insurer_name: t.insurer_name, product_title: t.product_title, plans: t.plans }))
      const res = await fetch('/api/group-benefits/quote/suggest-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productTitle, target, entries }),
      })
      const d = await res.json()
      if (!res.ok) { setMatchError(d.error ?? 'Plan matching failed'); return }
      const suggestions: { rate_table_id: string; plan_code: string }[] = d.suggestions ?? []
      if (suggestions.length === 0) { setMatchError('No matching plans found for that requirement'); return }
      setMap(prev => {
        const next = { ...prev }
        for (const s of suggestions) {
          const forCats = Object.fromEntries(categories.map(c => [c, s.plan_code]))
          next[s.rate_table_id] = { ...next[s.rate_table_id], [productTitle]: { ...(next[s.rate_table_id]?.[productTitle] ?? {}), ...forCats } }
        }
        return next
      })
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : 'Plan matching failed')
    } finally { setMatchingProduct(null) }
  }

  async function compute() {
    setBusy(true); setError(null)
    try {
      const selected = avail.filter(t => selectedKeys.has(entryKey(t)))
      const products = Array.from(new Set(selected.map(t => t.product_title)))
      const rate_table_ids = Array.from(new Set(selected.map(t => t.rate_table_id)))
      const res = await fetch('/api/group-benefits/quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: company, effective_date: effDate, gst_rate: gst / 100, basis, products, rate_table_ids, category_map: map, census: members.filter(m => m.name.trim()) }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Compute failed'); return }
      setResult(d); setQuotationId(d.quotation_id ?? null); setAnalysis(null); setStep(4); onSaved?.()
    } finally { setBusy(false) }
  }

  async function compareBenefits() {
    if (!quotationId) return
    setAnalyzing(true); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/quote/${quotationId}/compare-benefits`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const d = await res.json()
      if (res.ok && d.comparison) setAnalysis(d.comparison as Comparison); else setError(d.error ?? 'Comparison failed')
    } finally { setAnalyzing(false) }
  }

  function buildReplySummary(list: { insurer_name: string; subtotal: number; gst: number; total: number; by_product: Record<string, number> }[]): string {
    const out: string[] = []
    out.push(`Please find our group insurance premium comparison${company ? ` for ${company}` : ''}${effDate ? ` (policy effective ${effDate})` : ''}:`)
    out.push('')
    list.forEach((r, i) => {
      out.push(`${i + 1}. ${r.insurer_name} — ${money(r.total)} / year (incl. GST)`)
      const prod = Object.entries(r.by_product).map(([p, v]) => `${p}: ${money(v)}`).join(', ')
      if (prod) out.push(`   ${prod} (ex-GST ${money(r.subtotal)})`)
    })
    out.push('')
    const prods = Array.from(new Set(list.flatMap(r => Object.keys(r.by_product))))
    out.push(`Covering ${members.length} member(s) across ${prods.join(', ')}. Premiums exclude prevailing GST unless otherwise stated.`)
    if (isComparison(analysis)) {
      const differing = analysis.groups.flatMap(g => g.rows.filter(r => r.differs))
      if (differing.length) {
        out.push('')
        out.push('Where the options differ:')
        for (const r of differing.slice(0, 12)) {
          const cells = r.cells.map(c => {
            const o = analysis.options.find(x => x.key === c.optionKey)
            const v = c.absent ? 'not stated' : (c.text?.trim() || '—')
            return `${o?.insurerName ?? c.optionKey} ${v}`
          }).join('; ')
          out.push(`- ${r.benefit.name}: ${cells}`)
        }
        if (differing.length > 12) out.push(`- and ${differing.length - 12} further line(s), in the attached comparison`)
      }
    }
    return out.join('\n')
  }

  // Group per-table results by insurer (by directory id, falling back to name) so an
  // insurer's GHS + GOS tables roll up into one column even across separate uploads.
  const byInsurer = useMemo(() => {
    if (!result) return []
    const m = new Map<string, { insurer_name: string; subtotal: number; gst: number; total: number; missing: number; by_product: Record<string, number> }>()
    for (const r of result.per_insurer) {
      const key = r.insurer_id ?? `name:${r.insurer_name}`
      const e = m.get(key) ?? { insurer_name: r.insurer_name, subtotal: 0, gst: 0, total: 0, missing: 0, by_product: {} }
      e.subtotal += r.subtotal; e.gst += r.gst; e.total += r.total; e.missing += r.missing
      for (const [p, v] of Object.entries(r.by_product)) e.by_product[p] = (e.by_product[p] ?? 0) + v
      m.set(key, e)
    }
    return Array.from(m.values()).sort((a, b) => a.total - b.total)
  }, [result])

  const stepTitles = ['Census', 'Setup', 'Insurer products', 'Map plans', 'Comparison']
  const inp = 'text-[13px] border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25'

  return (
    <div className="flex flex-col gap-5">
      {/* Stepper */}
      <div className="flex items-center gap-2 text-[11.5px]">
        {stepTitles.map((s, i) => (
          <React.Fragment key={s}>
            <span className={cn('text-[13.5px]', i === step ? 'font-medium text-[#202124]' : 'text-[#5f6368]')}>{i + 1}. {s}</span>
            {i < stepTitles.length - 1 && <span className="text-muted-foreground/30">›</span>}
          </React.Fragment>
        ))}
      </div>
      {error && <p className="text-[12.5px] text-[#c5221f]">{error}</p>}

      {/* Step 0 — census */}
      {step === 0 && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-8 cursor-pointer hover:border-[#9aa0a6]">
            <UploadCloud size={22} className="text-muted-foreground/50" />
            <span className="text-[12.5px] font-medium">Upload census CSV</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) setMembers(parseCensus(await f.text())) }} />
          </label>
          <div className="flex items-center justify-between">
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#202124] hover:underline"><Download size={12} /> Download template</button>
          </div>
          {members.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden text-[11.5px]">
              <div className="px-3 py-1.5 bg-muted/40 font-semibold text-muted-foreground/70 flex items-center justify-between">
                <span>{members.length} members · {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} ({categories.join(', ')})</span>
                <span className="text-[10px] font-normal text-muted-foreground/50">Review &amp; fix before quoting</span>
              </div>
              <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr_0.6fr_24px] gap-1 px-2 py-1 text-[11.5px] font-medium text-muted-foreground/50">
                <span>Name</span><span>Category</span><span>Relation</span><span>DOB / age</span><span>Class</span><span />
              </div>
              <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                {members.map((m, i) => (
                  <div key={i} className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr_0.6fr_24px] gap-1 px-2 py-1 items-center">
                    <input value={m.name} onChange={e => editMember(i, { name: e.target.value })} className="text-[11.5px] px-1.5 py-0.5 rounded border border-transparent hover:border-border focus:border-[#202124] focus:outline-none bg-transparent" />
                    <input value={m.category} onChange={e => editMember(i, { category: e.target.value })} className="text-[11.5px] px-1.5 py-0.5 rounded border border-transparent hover:border-border focus:border-[#202124] focus:outline-none bg-transparent" />
                    <select value={m.relationship} onChange={e => editMember(i, { relationship: e.target.value })} className="text-[11px] px-1 py-0.5 rounded border border-transparent hover:border-border focus:border-[#202124] focus:outline-none bg-transparent">
                      <option value="self">self</option><option value="spouse">spouse</option><option value="child">child</option>
                    </select>
                    <input value={m.dob ?? (m.age != null ? String(m.age) : '')} placeholder="DD/MM/YYYY or age"
                      onChange={e => { const v = e.target.value.trim(); editMember(i, /^\d{1,3}$/.test(v) && Number(v) <= 120 ? { dob: null, age: Number(v) } : { dob: v || null, age: null }) }}
                      className="text-[11.5px] px-1.5 py-0.5 rounded border border-transparent hover:border-border focus:border-[#202124] focus:outline-none bg-transparent" />
                    <input value={m.occupation_class ?? ''} placeholder="—" title="Occupation class (1–4)"
                      onChange={e => editMember(i, { occupation_class: e.target.value.trim() || null })}
                      className="text-[11.5px] px-1.5 py-0.5 rounded border border-transparent hover:border-border focus:border-[#202124] focus:outline-none bg-transparent" />
                    <button onClick={() => setMembers(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground/30 hover:text-[#c5221f]"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => setMembers(prev => [...prev, { name: '', category: categories[0] ?? 'Default', relationship: 'self', dob: null, age: null, occupation_class: null }])}
                className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] text-[#202124] hover:bg-[#f1f3f4] border-t border-border/60"><Plus size={12} /> Add member</button>
            </div>
          )}
          <Nav next={() => setStep(1)} nextLabel="Setup" nextDisabled={members.filter(m => m.name.trim()).length === 0} />

          {/* Expected CSV format — shown as a mock table so the headers are unambiguous. */}
          <div className="mt-6">
            <h3 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em] leading-tight" style={{ color: '#202124' }}>Expected CSV format</h3>
            <Register label="Expected CSV format" minWidth={640}>
              <RegisterHead>
                <RegisterTh first width={200}>name</RegisterTh>
                <RegisterTh>category</RegisterTh>
                <RegisterTh>relationship</RegisterTh>
                <RegisterTh>dob</RegisterTh>
                <RegisterTh align="right">age</RegisterTh>
                <RegisterTh last align="right">occupation_class</RegisterTh>
              </RegisterHead>
              <tbody>
                {([
                  ['Tan Wei Ming', 'Executive', 'self', '1985-03-12', null, '1'],
                  ['Sarah Tan', 'Executive', 'spouse', '1987-09-04', null, null],
                  ['Lim Jun Jie', 'Staff', 'self', null, '42', '2'],
                ] as (string | null)[][]).map((r, i) => (
                  <RegisterRow key={i}>
                    <RegisterCell first primary={r[0]} className="min-w-[160px]" />
                    <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{r[1]}</span></RegisterCell>
                    <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{r[2]}</span></RegisterCell>
                    <RegisterCell><span className="text-[14px] tabular-nums" style={{ color: r[3] ? '#3c4043' : '#9aa0a6' }}>{r[3] ?? '—'}</span></RegisterCell>
                    <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: r[4] ? '#3c4043' : '#9aa0a6' }}>{r[4] ?? '—'}</span></RegisterCell>
                    <RegisterCell last align="right"><span className="text-[14px] tabular-nums" style={{ color: r[5] ? '#3c4043' : '#9aa0a6' }}>{r[5] ?? '—'}</span></RegisterCell>
                  </RegisterRow>
                ))}
              </tbody>
            </Register>
            <ul className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground/70 list-disc pl-4">
              <li><span className="font-medium text-foreground/70">dob</span> as DD/MM/YYYY or YYYY-MM-DD — never month first; <span className="font-medium text-foreground/70">age</span> is used only when there&apos;s no dob.</li>
              <li><span className="font-medium text-foreground/70">relationship</span> must be one of <code>self</code>, <code>spouse</code>, or <code>child</code>.</li>
              <li><span className="font-medium text-foreground/70">category</span> is your own plan tier / class label (e.g. Executive, Staff).</li>
              <li><span className="font-medium text-foreground/70">occupation_class</span> (optional, 1–4) drives insurer eligibility rules; leave blank if not applicable.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Step 1 — company / date / GST */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-muted-foreground/70">Company</span><input value={company} onChange={e => setCompany(e.target.value)} className={inp} placeholder="Acme Pte Ltd" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-muted-foreground/70">Policy effective date</span><input type="date" value={effDate} onChange={e => setEffDate(e.target.value)} className={inp} /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-muted-foreground/70">GST %</span><input type="number" value={gst} onChange={e => setGst(Number(e.target.value))} className={inp} /></label>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground/70">Quote basis</span>
            <div className="inline-flex rounded-lg border border-border overflow-hidden w-fit text-[12.5px]">
              {(['new_business', 'renewal'] as const).map(b => (
                <button key={b} onClick={() => setBasis(b)}
                  className={cn('px-4 py-1.5 font-medium', basis === b ? 'bg-[#202124] text-white' : 'text-muted-foreground hover:bg-muted/50')}>
                  {b === 'new_business' ? 'New Business' : 'Renewal'}
                </button>
              ))}
            </div>
            <span className="text-[10.5px] text-muted-foreground/60">Renewal-only age bands are excluded on New Business and priced on Renewal.</span>
          </div>
          <p className="text-[11.5px] text-muted-foreground/60">Insurer products come from your approved pricing (newest date per insurer).</p>
          <Nav back={() => setStep(0)} next={loadAvailable} nextLabel="Find insurer products" nextDisabled={busy} busy={busy} />
        </div>
      )}

      {/* Step 2 — pick insurer products (approved) */}
      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] text-muted-foreground">Select the insurer products to compare.</p>
          <div className="flex flex-col gap-1.5">
            {avail.map(t => {
              const on = selectedKeys.has(entryKey(t))
              return (
                <button key={entryKey(t)} onClick={() => toggleEntry(t)}
                  className={cn('flex items-center justify-between px-3 py-2 rounded-lg border text-left text-[12.5px]', on ? 'border-[#202124] bg-white' : 'border-border hover:border-[#9aa0a6]')}>
                  <span><span className="font-semibold">{t.insurer_name}</span> · {t.product_title}{t.plan_year ? ` · ${t.plan_year}` : ''} <span className="text-muted-foreground/50">{t.plans.length} plans{t.member_types.length ? ` · ${t.member_types.map(m => m === 'employee' ? 'Emp' : 'Dep').join('/')}` : ''}</span></span>
                  <input type="checkbox" readOnly checked={on} />
                </button>
              )
            })}
          </div>
          <Nav back={() => setStep(1)} next={() => setStep(3)} nextLabel="Map plans" nextDisabled={selectedKeys.size === 0} />
        </div>
      )}

      {/* Step 3 — category → plan mapping per selected insurer product */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-muted-foreground">Map each employee category to a plan for every insurer product — or state what the client wants per product and let Opus suggest the closest match at each insurer. Dependants are priced automatically from the dependant table.</p>
          {matchError && <p className="text-[11.5px] text-[#c5221f]">{matchError}</p>}
          {Array.from(new Set(avail.filter(t => selectedKeys.has(entryKey(t))).map(t => t.product_title))).map(title => (
            <div key={title} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  value={targets[title] ?? ''}
                  onChange={e => setTargets(prev => ({ ...prev, [title]: e.target.value }))}
                  placeholder={`What does the client want for ${title}? (e.g. private hospital, 1-bed ward)`}
                  className={cn(inp, 'flex-1')}
                />
                <button onClick={() => suggestPlans(title)} disabled={matchingProduct === title || !targets[title]?.trim()}
                  className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[#dadce0] text-[#202124] hover:bg-[#f8f9fa] disabled:opacity-50 whitespace-nowrap">
                  {matchingProduct === title ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Suggest plans
                </button>
              </div>
              {avail.filter(t => selectedKeys.has(entryKey(t)) && t.product_title === title).map(t => (
                <div key={entryKey(t)} className="border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-1.5 bg-muted/40 text-[12px] font-semibold">{t.insurer_name} · {t.product_title}</div>
                  <div className="divide-y divide-border/60">
                    {categories.map(cat => (
                      <div key={cat} className="flex items-center gap-3 px-3 py-1.5 text-[12px]">
                        <span className="w-28 text-muted-foreground/80">{cat}</span>
                        <select value={map[t.rate_table_id]?.[t.product_title]?.[cat] ?? ''} onChange={e => setPlan(t.rate_table_id, t.product_title, cat, e.target.value)} className={inp}>
                          <option value="">— none —</option>
                          {t.plans.map(p => <option key={p.plan_code} value={p.plan_code}>{p.plan_code}{p.beds ? ` · ${p.beds}` : ''}{p.hospital_type ? ` · ${p.hospital_type}` : ''}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <Nav back={() => setStep(2)} next={compute} nextLabel="Compute comparison" busy={busy} />
        </div>
      )}

      {/* Step 4 — comparison */}
      {step === 4 && result && (
        <div className="flex flex-col gap-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(byInsurer.length, 4)}, minmax(0,1fr))` }}>
            {byInsurer.map((r, i) => (
              <div key={r.insurer_name} className={cn('rounded-xl border p-4', i === 0 ? 'border-[#202124] bg-white' : 'border-border bg-card')}>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-foreground">{r.insurer_name}</span>
                  {i === 0 && <span className="text-[11.5px] font-medium bg-[#f1f3f4] text-[#3c4043] px-2 py-0.5 rounded-[6px]">Lowest premium</span>}
                </div>
                <p className="text-[22px] font-bold text-foreground mt-1">{money(r.total)}</p>
                <p className="text-[10.5px] text-muted-foreground/70">incl. {money(r.gst)} GST · ex-GST {money(r.subtotal)}</p>
                <div className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                  {Object.entries(r.by_product).map(([p, v]) => <div key={p} className="flex justify-between"><span>{p}</span><span>{money(v)}</span></div>)}
                </div>
                {r.missing > 0 && <p className="text-[10.5px] text-[#3c4043] mt-1.5">{r.missing} line(s) unpriced — check mapping/ages</p>}
              </div>
            ))}
          </div>

          {/* Per-member breakdown */}
          <div>
            <h3 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em] leading-tight" style={{ color: '#202124' }}>Per-member breakdown</h3>
            <Register label="Per-member breakdown" minWidth={760} maxHeight="24rem">
              <RegisterHead>
                <RegisterTh first width={260}>Member</RegisterTh>
                <RegisterTh>Insurer</RegisterTh>
                <RegisterTh>Product</RegisterTh>
                <RegisterTh>Plan</RegisterTh>
                <RegisterTh align="right">Age</RegisterTh>
                <RegisterTh last align="right">Premium</RegisterTh>
              </RegisterHead>
              <tbody>
                {result.lines.map((l, i) => (
                  <RegisterRow key={i}>
                    <RegisterCell first primary={l.member_name} secondary={l.relationship} />
                    <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{l.insurer_name}</span></RegisterCell>
                    <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{l.product_code}</span></RegisterCell>
                    <RegisterCell><span className="text-[14px]" style={{ color: l.plan_code ? '#3c4043' : '#9aa0a6' }}>{l.plan_code ?? '—'}</span></RegisterCell>
                    <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: l.age != null ? '#3c4043' : '#9aa0a6' }}>{l.age ?? '—'}</span></RegisterCell>
                    <RegisterCell last align="right" nowrap={false}>
                      {l.premium != null ? <span className="text-[14px] font-medium tabular-nums" style={{ color: '#202124' }}>{money(l.premium)}</span> : <span className="block text-[13px] leading-snug" style={{ color: '#5f6368' }}>{l.note}</span>}
                    </RegisterCell>
                  </RegisterRow>
                ))}
              </tbody>
            </Register>
          </div>
          {/* Benefit comparison */}
          {isComparison(analysis) ? (
            <BenefitComparison comparison={analysis} busy={analyzing} onRecompute={() => compareBenefits()} />
          ) : (
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 text-[13px] font-bold text-foreground">Benefit comparison</h3>
                <button onClick={compareBenefits} disabled={analyzing || !quotationId}
                        className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[#dadce0] text-[#202124] hover:bg-[#f8f9fa] disabled:opacity-50">
                  {analyzing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  {analyzing ? 'Comparing…' : 'Compare benefits'}
                </button>
              </div>
              {analysis && !isComparison(analysis) && (
                <p className="text-[12px] mt-2" style={{ color: '#3c4043' }}>
                  This quote holds a written comparison from before 2 Oct 2026. Recompare it for the side-by-side table.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            {onDraftReply && (
              <button onClick={() => onDraftReply(plainToHtml(buildReplySummary(byInsurer)))} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-1.5 rounded-lg bg-[#202124] text-white hover:opacity-90">
                <Reply size={13} /> Draft reply with this quote{analysis ? ' + recommendation' : ''}
              </button>
            )}
            <button onClick={() => { setStep(initialMembers?.length ? 1 : 0); setResult(null); if (!initialMembers?.length) setMembers([]); setSelectedKeys(new Set()) }} className="text-[12.5px] px-3 py-1.5 rounded-lg border border-border hover:bg-muted">New quote</button>
            <span className="text-[11.5px] text-[#3c4043]">Saved to history ✓</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Nav({ back, next, nextLabel, nextDisabled, busy }: { back?: () => void; next: () => void; nextLabel: string; nextDisabled?: boolean; busy?: boolean }) {
  return (
    <div className="flex items-center justify-between pt-1">
      {back ? <button onClick={back} className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"><ArrowLeft size={13} /> Back</button> : <span />}
      <button onClick={next} disabled={nextDisabled} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-1.5 rounded-lg bg-[#202124] text-white hover:opacity-90 disabled:opacity-40">
        {busy ? <Loader2 size={13} className="animate-spin" /> : null}{nextLabel} {!busy && <ArrowRight size={13} />}
      </button>
    </div>
  )
}
