'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { UploadCloud, Loader2, ArrowRight, ArrowLeft, Download, Reply, Sparkles, Trash2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { plainToHtml } from '@/components/RichEditor'

// ── Types mirrored from the API ────────────────────────────────────────────────
type Member = { name: string; category: string; relationship: string; dob?: string | null; age?: number | null }
type Plan   = { rate_table_id: string; product_code: string; plan_code: string; plan_name: string | null; hospital_type: string | null; beds: string | null }
type Avail  = { rate_table_id: string; insurer_id: string | null; insurer_name: string; product_code: string; age_basis: string; plan_year: number | null; version: number; plans: Plan[] }
type InsurerResult = { rate_table_id: string; insurer_id: string | null; insurer_name: string; by_product: Record<string, number>; subtotal: number; gst: number; total: number; missing: number }
type Line = { member_index: number; member_name: string; category: string; relationship: string; age: number | null; insurer_name: string; product_code: string; plan_code: string | null; premium: number | null; note: string | null }
type Analysis = { comparison: { benefit: string; by_insurer: Record<string, string> }[]; insurers: { insurer: string; pros: string[]; cons: string[] }[]; recommendation: string }

const PRODUCTS = ['GHS', 'GOC', 'GOS']
const TEMPLATE = 'name,category,relationship,dob,age\nJane Tan,Manager,self,1985-04-12,\nJohn Tan,Manager,spouse,1987-09-01,\nBaby Tan,Manager,child,,3\n'
const money = (n: number) => n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' })

// Minimal CSV parse (name,category,relationship,dob,age).
function parseCensus(text: string): Member[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const header = lines[0].toLowerCase().split(',').map(h => h.trim())
  const col = (n: string) => header.indexOf(n)
  const ci = { name: col('name'), cat: col('category'), rel: col('relationship'), dob: col('dob'), age: col('age') }
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
      dob: ci.dob >= 0 && c[ci.dob] ? c[ci.dob] : null,
      age: ageRaw ? Number(ageRaw) : null,
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
  const [products, setProducts] = useState<string[]>(['GHS'])
  const [avail, setAvail] = useState<Avail[]>([])
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set())
  // categoryMap[rate_table_id][product][category] = plan_code
  const [map, setMap] = useState<Record<string, Record<string, Record<string, string>>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ per_insurer: InsurerResult[]; lines: Line[]; quotation_id?: string | null } | null>(null)
  const [quotationId, setQuotationId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const categories = useMemo(() => Array.from(new Set(members.filter(m => m.name.trim()).map(m => m.category))), [members])
  function editMember(i: number, patch: Partial<Member>) { setMembers(prev => prev.map((m, j) => (j === i ? { ...m, ...patch } : m))) }

  function downloadTemplate() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }))
    a.download = 'census-template.csv'; a.click()
  }

  async function loadAvailable() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/quote/available?products=${products.join(',')}`, { cache: 'no-store' })
      const rows: Avail[] = res.ok ? await res.json() : []
      setAvail(rows)
      if (rows.length === 0) setError('No approved rate tables for the selected products yet. Approve one under Rate Tables first.')
      setStep(2)
    } finally { setBusy(false) }
  }

  function toggleTable(t: Avail) {
    setSelectedTables(prev => { const n = new Set(prev); n.has(t.rate_table_id) ? n.delete(t.rate_table_id) : n.add(t.rate_table_id); return n })
    // Seed default mapping: first plan of that product for every category.
    setMap(prev => {
      const next = { ...prev }
      if (!next[t.rate_table_id]) {
        const firstPlan = t.plans.find(p => p.product_code === t.product_code)?.plan_code ?? t.plans[0]?.plan_code ?? ''
        next[t.rate_table_id] = { [t.product_code]: Object.fromEntries(categories.map(c => [c, firstPlan])) }
      }
      return next
    })
  }

  function setPlan(tableId: string, product: string, category: string, plan: string) {
    setMap(prev => ({ ...prev, [tableId]: { ...prev[tableId], [product]: { ...(prev[tableId]?.[product] ?? {}), [category]: plan } } }))
  }

  async function compute() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/group-benefits/quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: company, effective_date: effDate, gst_rate: gst / 100, products, rate_table_ids: Array.from(selectedTables), category_map: map, census: members.filter(m => m.name.trim()) }),
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
      const res = await fetch(`/api/group-benefits/quote/${quotationId}/compare-benefits`, { method: 'POST' })
      const d = await res.json()
      if (res.ok && d.analysis) setAnalysis(d.analysis); else setError(d.error ?? 'Comparison failed')
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
    out.push(`Covering ${members.length} member(s) across ${products.join(', ')}. Premiums exclude prevailing GST unless otherwise stated.`)
    if (analysis?.recommendation) { out.push(''); out.push(`Our recommendation: ${analysis.recommendation}`) }
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

  const insurerNames = useMemo(() => analysis ? Array.from(new Set((analysis.comparison ?? []).flatMap(r => Object.keys(r.by_insurer ?? {})))) : [], [analysis])

  const stepTitles = ['Census', 'Products', 'Insurers & plans', 'Review', 'Comparison']
  const inp = 'text-[13px] border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25'

  return (
    <div className="flex flex-col gap-5">
      {/* Stepper */}
      <div className="flex items-center gap-2 text-[11.5px]">
        {stepTitles.map((s, i) => (
          <React.Fragment key={s}>
            <span className={cn('px-2 py-0.5 rounded-full font-medium', i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{i + 1}. {s}</span>
            {i < stepTitles.length - 1 && <span className="text-muted-foreground/30">›</span>}
          </React.Fragment>
        ))}
      </div>
      {error && <p className="text-[12.5px] text-rose-600">{error}</p>}

      {/* Step 0 — census */}
      {step === 0 && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-8 cursor-pointer hover:border-primary/40">
            <UploadCloud size={22} className="text-muted-foreground/50" />
            <span className="text-[12.5px] font-medium">Upload census CSV</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) setMembers(parseCensus(await f.text())) }} />
          </label>
          <div className="flex items-center justify-between">
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline"><Download size={12} /> Download template</button>
            <span className="text-[11px] text-muted-foreground/60">Headers: <code>name, category, relationship, dob, age</code> — dob (YYYY-MM-DD) preferred; age used if no dob. relationship = self / spouse / child.</span>
          </div>
          {members.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden text-[11.5px]">
              <div className="px-3 py-1.5 bg-muted/40 font-semibold text-muted-foreground/70 flex items-center justify-between">
                <span>{members.length} members · {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} ({categories.join(', ')})</span>
                <span className="text-[10px] font-normal text-muted-foreground/50">Review &amp; fix before quoting</span>
              </div>
              <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr_24px] gap-1 px-2 py-1 text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground/50">
                <span>Name</span><span>Category</span><span>Relation</span><span>DOB / age</span><span />
              </div>
              <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                {members.map((m, i) => (
                  <div key={i} className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr_24px] gap-1 px-2 py-1 items-center">
                    <input value={m.name} onChange={e => editMember(i, { name: e.target.value })} className="text-[11.5px] px-1.5 py-0.5 rounded border border-transparent hover:border-border focus:border-primary/40 focus:outline-none bg-transparent" />
                    <input value={m.category} onChange={e => editMember(i, { category: e.target.value })} className="text-[11.5px] px-1.5 py-0.5 rounded border border-transparent hover:border-border focus:border-primary/40 focus:outline-none bg-transparent" />
                    <select value={m.relationship} onChange={e => editMember(i, { relationship: e.target.value })} className="text-[11px] px-1 py-0.5 rounded border border-transparent hover:border-border focus:border-primary/40 focus:outline-none bg-transparent">
                      <option value="self">self</option><option value="spouse">spouse</option><option value="child">child</option>
                    </select>
                    <input value={m.dob ?? (m.age != null ? String(m.age) : '')} placeholder="YYYY-MM-DD or age"
                      onChange={e => { const v = e.target.value.trim(); editMember(i, /^\d{1,3}$/.test(v) && Number(v) <= 120 ? { dob: null, age: Number(v) } : { dob: v || null, age: null }) }}
                      className="text-[11.5px] px-1.5 py-0.5 rounded border border-transparent hover:border-border focus:border-primary/40 focus:outline-none bg-transparent" />
                    <button onClick={() => setMembers(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground/30 hover:text-rose-600"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => setMembers(prev => [...prev, { name: '', category: categories[0] ?? 'Default', relationship: 'self', dob: null, age: null }])}
                className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] text-primary hover:bg-primary/5 border-t border-border/60"><Plus size={12} /> Add member</button>
            </div>
          )}
          <Nav next={() => setStep(1)} nextLabel="Products" nextDisabled={members.filter(m => m.name.trim()).length === 0} />
        </div>
      )}

      {/* Step 1 — products + meta */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-muted-foreground/70">Company</span><input value={company} onChange={e => setCompany(e.target.value)} className={inp} placeholder="Acme Pte Ltd" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-muted-foreground/70">Policy effective date</span><input type="date" value={effDate} onChange={e => setEffDate(e.target.value)} className={inp} /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-muted-foreground/70">GST %</span><input type="number" value={gst} onChange={e => setGst(Number(e.target.value))} className={inp} /></label>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground/70 mb-1.5">Products to quote</p>
            <div className="flex gap-2">
              {PRODUCTS.map(p => (
                <button key={p} onClick={() => setProducts(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                  className={cn('text-[12px] font-medium px-3 py-1.5 rounded-lg border', products.includes(p) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>{p}</button>
              ))}
            </div>
          </div>
          <Nav back={() => setStep(0)} next={loadAvailable} nextLabel="Find insurers" nextDisabled={products.length === 0 || busy} busy={busy} />
        </div>
      )}

      {/* Step 2 — pick insurers (approved tables) */}
      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] text-muted-foreground">Select the approved insurer tables to compare.</p>
          <div className="flex flex-col gap-1.5">
            {avail.map(t => (
              <button key={t.rate_table_id} onClick={() => toggleTable(t)}
                className={cn('flex items-center justify-between px-3 py-2 rounded-lg border text-left text-[12.5px]', selectedTables.has(t.rate_table_id) ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30')}>
                <span><span className="font-semibold">{t.insurer_name}</span> · {t.product_code}{t.plan_year ? ` · ${t.plan_year}` : ''} <span className="text-muted-foreground/50">v{t.version} · {t.plans.length} plans</span></span>
                <input type="checkbox" readOnly checked={selectedTables.has(t.rate_table_id)} />
              </button>
            ))}
          </div>
          <Nav back={() => setStep(1)} next={() => setStep(3)} nextLabel="Map plans" nextDisabled={selectedTables.size === 0} />
        </div>
      )}

      {/* Step 3 — category → plan mapping per selected table */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-muted-foreground">Map each employee category to a plan for every insurer.</p>
          {avail.filter(t => selectedTables.has(t.rate_table_id)).map(t => {
            const planOpts = t.plans.filter(p => p.product_code === t.product_code)
            return (
              <div key={t.rate_table_id} className="border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-1.5 bg-muted/40 text-[12px] font-semibold">{t.insurer_name} · {t.product_code}</div>
                <div className="divide-y divide-border/60">
                  {categories.map(cat => (
                    <div key={cat} className="flex items-center gap-3 px-3 py-1.5 text-[12px]">
                      <span className="w-28 text-muted-foreground/80">{cat}</span>
                      <select value={map[t.rate_table_id]?.[t.product_code]?.[cat] ?? ''} onChange={e => setPlan(t.rate_table_id, t.product_code, cat, e.target.value)} className={inp}>
                        <option value="">— none —</option>
                        {(planOpts.length ? planOpts : t.plans).map(p => <option key={p.plan_code} value={p.plan_code}>{p.plan_code}{p.beds ? ` · ${p.beds}` : ''}{p.hospital_type ? ` · ${p.hospital_type}` : ''}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          <Nav back={() => setStep(2)} next={compute} nextLabel="Compute comparison" busy={busy} />
        </div>
      )}

      {/* Step 4 — comparison */}
      {step === 4 && result && (
        <div className="flex flex-col gap-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(byInsurer.length, 4)}, minmax(0,1fr))` }}>
            {byInsurer.map((r, i) => (
              <div key={r.insurer_name} className={cn('rounded-xl border p-4', i === 0 ? 'border-emerald-300 bg-emerald-50/40' : 'border-border bg-card')}>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-foreground">{r.insurer_name}</span>
                  {i === 0 && <span className="text-[9px] font-bold uppercase bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">Lowest</span>}
                </div>
                <p className="text-[22px] font-bold text-foreground mt-1">{money(r.total)}</p>
                <p className="text-[10.5px] text-muted-foreground/70">incl. {money(r.gst)} GST · ex-GST {money(r.subtotal)}</p>
                <div className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                  {Object.entries(r.by_product).map(([p, v]) => <div key={p} className="flex justify-between"><span>{p}</span><span>{money(v)}</span></div>)}
                </div>
                {r.missing > 0 && <p className="text-[10.5px] text-amber-600 mt-1.5">{r.missing} line(s) unpriced — check mapping/ages</p>}
              </div>
            ))}
          </div>

          {/* Per-member breakdown */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-muted/40 text-[12px] font-semibold">Per-member breakdown ({result.lines.length} lines)</div>
            <div className="max-h-96 overflow-y-auto divide-y divide-border/60 text-[11.5px]">
              {result.lines.map((l, i) => (
                <div key={i} className={cn('flex items-center gap-2 px-3 py-1', l.premium == null && 'bg-amber-50/60')}>
                  <span className="w-40 truncate">{l.member_name} <span className="text-muted-foreground/50">({l.relationship})</span></span>
                  <span className="w-24 text-muted-foreground/60">{l.insurer_name}</span>
                  <span className="w-12 text-muted-foreground/60">{l.product_code}</span>
                  <span className="w-20 text-muted-foreground/60">{l.plan_code ?? '—'}</span>
                  <span className="w-14 text-muted-foreground/50">age {l.age ?? '?'}</span>
                  <span className="flex-1 text-right font-medium">{l.premium != null ? money(l.premium) : <span className="text-amber-600">{l.note}</span>}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Coverage comparison & recommendation (Opus) */}
          <div className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[13px] font-bold text-foreground">Coverage comparison & recommendation</h3>
              {!analysis && (
                <button onClick={compareBenefits} disabled={analyzing || !quotationId} className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-50">
                  {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{analyzing ? 'Analysing coverage…' : 'Compare benefits with Opus'}
                </button>
              )}
            </div>
            {!analysis && !analyzing && <p className="text-[11.5px] text-muted-foreground/70">Opus aligns each plan&apos;s benefits, lists pros/cons per insurer, and recommends the best value (coverage vs price).</p>}
            {analysis && (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg bg-primary/5 border-l-2 border-primary/40 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Recommendation</p>
                  <p className="text-[12px] text-foreground/80 leading-relaxed m-0">{analysis.recommendation}</p>
                </div>
                {(analysis.comparison?.length ?? 0) > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead><tr>
                        <th className="text-left px-2 py-1 border-b border-border text-muted-foreground/70 font-semibold">Benefit</th>
                        {insurerNames.map(n => <th key={n} className="text-left px-2 py-1 border-b border-border text-muted-foreground/70 font-semibold">{n}</th>)}
                      </tr></thead>
                      <tbody>
                        {analysis.comparison.map((row, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1 border-b border-border/50 font-medium text-foreground/80">{row.benefit}</td>
                            {insurerNames.map(n => <td key={n} className="px-2 py-1 border-b border-border/50 text-muted-foreground">{row.by_insurer?.[n] ?? '—'}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min((analysis.insurers ?? []).length, 3)},minmax(0,1fr))` }}>
                  {(analysis.insurers ?? []).map(ins => (
                    <div key={ins.insurer} className="rounded-lg border border-border p-3">
                      <p className="text-[12px] font-bold text-foreground mb-1.5">{ins.insurer}</p>
                      {ins.pros?.map((p, i) => <p key={`p${i}`} className="text-[11px] text-emerald-700 flex gap-1 m-0"><span>+</span>{p}</p>)}
                      {ins.cons?.map((c, i) => <p key={`c${i}`} className="text-[11px] text-rose-600 flex gap-1 m-0"><span>−</span>{c}</p>)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onDraftReply && (
              <button onClick={() => onDraftReply(plainToHtml(buildReplySummary(byInsurer)))} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                <Reply size={13} /> Draft reply with this quote{analysis ? ' + recommendation' : ''}
              </button>
            )}
            <button onClick={() => { setStep(initialMembers?.length ? 1 : 0); setResult(null); if (!initialMembers?.length) setMembers([]); setSelectedTables(new Set()) }} className="text-[12.5px] px-3 py-1.5 rounded-lg border border-border hover:bg-muted">New quote</button>
            <span className="text-[11.5px] text-emerald-600">Saved to history ✓</span>
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
      <button onClick={next} disabled={nextDisabled} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
        {busy ? <Loader2 size={13} className="animate-spin" /> : null}{nextLabel} {!busy && <ArrowRight size={13} />}
      </button>
    </div>
  )
}
