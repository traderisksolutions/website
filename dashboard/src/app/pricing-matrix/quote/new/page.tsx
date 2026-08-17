'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Save, Download, Wand2 } from 'lucide-react'
import { PmComparison } from '@/components/pricing-matrix/PmComparison'
import { PmLiveBenefitPreview } from '@/components/pricing-matrix/PmLiveBenefitPreview'
import { CensusEditor } from '@/components/pricing-matrix/CensusEditor'
import { PlanSelectionEditor } from '@/components/pricing-matrix/PlanSelectionEditor'
import { CategoryOverrideEditor } from '@/components/pricing-matrix/CategoryOverrideEditor'
import { CompanyContactPicker } from '@/components/company-contact-picker/CompanyContactPicker'
import type { PickerValue } from '@/components/company-contact-picker/CompanyContactPicker'
import { computeInsurerQuote } from '@/lib/pm-calc'
import { alignLines, quoteSpreadStats } from '@/lib/pm-quote'
import type { CensusMember, Selection, CategoryOverrides, QuoteResult, InsurerResult, AvailableCalculator } from '@/lib/pm-quote'
import { coverageCodes } from '@/lib/pm-rates'
import { alignSelectedTerms } from '@/lib/pm-compare'
import type { CompareRow } from '@/lib/pm-compare'
import { MetricCard, MetricGrid } from '@/components/shared/metric-card'

const inp = 'text-[12.5px] border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25'

async function safeJson<T>(r: Response): Promise<T & { error?: string }> {
  try { return await r.json() } catch { return { error: `HTTP ${r.status}` } as T & { error?: string } }
}

export default function NewQuotePage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [companyPick, setCompanyPick] = useState<PickerValue | null>(null)
  const company = companyPick?.companyName ?? ''
  const [effDate, setEffDate] = useState('2026-01-01')
  const [census, setCensus] = useState<CensusMember[]>([{ name: '', relationship: 'Self', date_of_birth: null, age: null }])
  const [avail, setAvail] = useState<AvailableCalculator[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, CategoryOverrides>>({})
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [matchNotes, setMatchNotes] = useState<Record<string, string>>({})   // `${calcId}.${code}` -> reason
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetch('/api/pricing-matrix/quote/available', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(setAvail) }, [])

  const namedCount = census.filter(m => (m.name ?? '').trim() || m.date_of_birth || m.age != null).length
  const selectedIds = useMemo(() => avail.filter(a => selected[a.id]).map(a => a.id), [avail, selected])
  const selectedCoverages = useMemo(() => {
    const seen = new Map<string, string>()
    for (const a of avail) if (selected[a.id]) for (const l of a.coverage_lines) if (!seen.has(l.code)) seen.set(l.code, l.label)
    return Array.from(seen, ([code, label]) => ({ code, label }))
  }, [avail, selected])

  // Live, client-side pricing — pm-calc.ts is pure math (no AI, no network), so this recomputes
  // instantly on every dropdown toggle with no round-trip to the server.
  const liveResult: QuoteResult = useMemo(() => {
    const globals = { effective_date: effDate || null }
    const insurers: InsurerResult[] = avail.filter(a => selected[a.id]).map((a): InsurerResult => {
      if (!a.rate_table) return { calculator_id: a.id, insurer_name: a.insurer_name, effective_date: a.effective_date, coverage_lines: [], by_line: {}, grand: null, member_count: 0, avg_per_life: null, members: [], error: 'No approved rate table for this insurer' }
      try {
        return computeInsurerQuote(a.id, a.insurer_name, a.effective_date, a.rate_table, census, selections[a.id] ?? {}, globals, categoryOverrides[a.id], a.computation_rules ?? undefined)
      } catch (e) {
        return { calculator_id: a.id, insurer_name: a.insurer_name, effective_date: a.effective_date, coverage_lines: coverageCodes(a.rate_table), by_line: {}, grand: null, member_count: 0, avg_per_life: null, members: [], error: String(e) }
      }
    })
    return { insurers, lines_union: alignLines(insurers), census_size: namedCount }
  }, [avail, selected, census, selections, categoryOverrides, effDate, namedCount])

  // Live benefit-schedule preview, scoped to the plan tiers currently toggled (alignSelectedTerms —
  // built for the client-comparison PDF, reused here verbatim).
  const liveBenefitRows: CompareRow[] = useMemo(() => {
    const insurersForTerms = avail.filter(a => selected[a.id] && a.rate_table).map(a => ({ calculator_id: a.id, insurer_name: a.insurer_name, rate_table: a.rate_table!, terms: a.benefit_terms }))
    return alignSelectedTerms(insurersForTerms, selections)
  }, [avail, selected, selections])

  const selectedInsurerMeta = useMemo(() => avail.filter(a => selected[a.id]).map(a => ({ calculator_id: a.id, insurer_name: a.insurer_name })), [avail, selected])

  function toggleInsurer(a: AvailableCalculator) {
    setSelected(s => ({ ...s, [a.id]: !s[a.id] }))
    setSelections(prev => {
      if (prev[a.id]) return prev
      const sel: Selection = {}
      for (const l of a.coverage_lines) {
        sel[l.code] = {}
        for (const f of l.fields) sel[l.code][f] = a.dropdowns[`${l.code}.${f}`]?.[0] ?? (f === 'plan' ? 'Plan 1' : '')
      }
      return { ...prev, [a.id]: sel }
    })
  }
  const setSel = (calcId: string, code: string, field: string, value: string) =>
    setSelections(prev => ({ ...prev, [calcId]: { ...prev[calcId], [code]: { ...prev[calcId]?.[code], [field]: value } } }))
  const setOverride = (calcId: string, category: string, code: string, field: string, value: string) =>
    setCategoryOverrides(prev => ({
      ...prev,
      [calcId]: { ...prev[calcId], [category]: { ...prev[calcId]?.[category], [code]: { ...prev[calcId]?.[category]?.[code], [field]: value } } },
    }))
  // CensusEditor owns the tier list but not category_overrides — cascade a rename here so an
  // override keyed by the old tier name isn't silently orphaned.
  function renameOverrideCategory(oldName: string, newName: string) {
    setCategoryOverrides(prev => {
      const next: typeof prev = {}
      for (const [calcId, byCat] of Object.entries(prev)) {
        const { [oldName]: moved, ...rest } = byCat
        next[calcId] = moved ? { ...rest, [newName]: moved } : byCat
      }
      return next
    })
  }

  async function runMatch() {
    setMatching(true); setMatchError(null)
    const res = await fetch('/api/pricing-matrix/quote/match', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calculator_ids: selectedIds, targets }),
    })
    const d = await safeJson<{ suggestions?: { calculator_id: string; code: string; plan_code: string; reason: string }[] }>(res)
    if (!res.ok || !d.suggestions) { setMatchError(d.error ?? 'Auto-match failed'); setMatching(false); return }
    const notes: Record<string, string> = {}
    for (const s of d.suggestions) { setSel(s.calculator_id, s.code, 'plan', s.plan_code); notes[`${s.calculator_id}.${s.code}`] = s.reason }
    setMatchNotes(prev => ({ ...prev, ...notes }))
    setMatching(false)
  }

  async function saveQuote() {
    setSaving(true); setError(null)
    const res = await fetch('/api/pricing-matrix/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: company, company_id: companyPick?.companyId ?? null, effective_date: effDate, census, calculator_ids: selectedIds, selections, category_overrides: categoryOverrides }),
    })
    const d = await safeJson<{ id?: string; results?: QuoteResult }>(res)
    if (!res.ok || !d.id) { setError(d.error ?? 'Save failed'); setSaving(false); return }
    router.push(`/pricing-matrix/quote/${d.id}`)
  }

  async function downloadComparisonPdf() {
    setDownloading(true); setError(null)
    const res = await fetch('/api/pricing-matrix/quote/export-comparison-preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: company, effective_date: effDate, census, calculator_ids: selectedIds, selections }),
    })
    if (!res.ok) { setError((await safeJson<{ error?: string }>(res)).error ?? 'PDF failed'); setDownloading(false); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${(company || 'comparison').replace(/[^\w -]+/g, '')}_coverage-comparison.pdf`
    a.click()
    URL.revokeObjectURL(url)
    setDownloading(false)
  }

  const steps = ['Census', 'Insurers, plans & comparison']
  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Pricing Matrix</Link>
      <h1 className="text-[18px] font-semibold text-foreground mb-3">New quote</h1>

      <div className="flex items-center gap-2 text-[12px] mb-5">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-[6px] font-medium ${i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{i + 1}. {s}</span>
            {i < steps.length - 1 && <span className="text-muted-foreground/30">›</span>}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 max-w-lg items-start">
            <CompanyContactPicker value={companyPick} onChange={setCompanyPick} hideContact />
            <input type="date" value={effDate} onChange={e => setEffDate(e.target.value)} title="Policy effective date" className={inp} />
          </div>

          <CensusEditor census={census} setCensus={setCensus} companyId={companyPick?.companyId ?? null} onRenameTier={renameOverrideCategory} />

          <div className="flex justify-end">
            <button onClick={() => setStep(1)} disabled={namedCount === 0} className="text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Next: insurers →</button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          {selectedCoverages.length > 0 && (
            <div className="border border-border rounded-xl p-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[12.5px] font-semibold text-foreground/80">Client&rsquo;s target requirements <span className="font-normal text-muted-foreground/50">(optional — used to auto-pick a plan tier per insurer)</span></h2>
                <button onClick={runMatch} disabled={matching || !Object.values(targets).some(t => t?.trim())} className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-50 shrink-0">
                  {matching ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Auto-match plan tiers
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedCoverages.map(c => (
                  <label key={c.code} className="flex items-center gap-2 text-[12px]">
                    <span className="w-32 shrink-0 text-muted-foreground/70">{c.label}</span>
                    <input value={targets[c.code] ?? ''} onChange={e => setTargets(t => ({ ...t, [c.code]: e.target.value }))}
                      placeholder="e.g. $200k annual limit, private hospital, 1-bed" className="flex-1 text-[12px] border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25" />
                  </label>
                ))}
              </div>
              {matchError && <p className="text-[11.5px] text-rose-600">{matchError}</p>}
            </div>
          )}

          <PlanSelectionEditor avail={avail} selected={selected} selections={selections} toggleInsurer={toggleInsurer} setSel={setSel} namedCount={namedCount} matchNotes={matchNotes} />

          <CategoryOverrideEditor avail={avail} selected={selected} census={census} overrides={categoryOverrides} setOverride={setOverride} />

          {selectedIds.length > 0 && namedCount > 0 && (
            <div className="flex flex-col gap-3 pt-2 border-t border-border/60">
              <h2 className="text-[12.5px] font-semibold text-foreground/80">Live comparison <span className="font-normal text-muted-foreground/50">— updates instantly as you toggle plans above</span></h2>
              {(() => {
                const { cheapest, priciest, spread } = quoteSpreadStats(liveResult.insurers)
                return cheapest && (
                  <MetricGrid className="md:grid-cols-3">
                    <MetricCard label="Cheapest" value={`$${cheapest.grand!.toLocaleString()}`} sub={cheapest.insurer_name} />
                    <MetricCard label="Most expensive" value={priciest ? `$${priciest.grand!.toLocaleString()}` : '—'} sub={priciest?.insurer_name} />
                    <MetricCard label="Spread" value={spread != null ? `$${spread.toLocaleString()}` : '—'} sub={spread != null ? 'across selected insurers' : undefined} />
                  </MetricGrid>
                )
              })()}
              <PmComparison result={liveResult} />
              <PmLiveBenefitPreview rows={liveBenefitRows} insurers={selectedInsurerMeta} />
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(0)} className="text-[13px] px-4 py-1.5 rounded-lg border border-border hover:bg-muted">← Back</button>
            <div className="flex items-center gap-2">
              <button onClick={downloadComparisonPdf} disabled={downloading || selectedIds.length === 0} className="flex items-center gap-1.5 text-[13px] px-4 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-50">
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download comparison (PDF)
              </button>
              <button onClick={saveQuote} disabled={saving || selectedIds.length === 0 || !effDate} title={!effDate ? 'Set a policy effective date (Census step) — ages are computed from it' : ''} className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saving ? 'Saving…' : 'Save to draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
