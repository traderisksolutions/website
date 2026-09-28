'use client'

import { useMemo, useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { Btn, Spinner, inputCls } from '@/components/crm/primitives'
import { Tip } from '@/components/Tip'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const dateCls = 'h-12 w-full rounded-[12px] border border-[#dadce0] bg-white px-4 text-[15px] text-[#202124] outline-none focus:border-[#202124]'

async function safeJson<T>(r: Response): Promise<T & { error?: string }> {
  try { return await r.json() } catch { return { error: `HTTP ${r.status}` } as T & { error?: string } }
}

function NewQuoteInner() {
  const router = useRouter()
  // Arriving from a company page carries the company with it, so the broker does not have to
  // find the same company again in the picker.
  const params = useSearchParams()
  const preCompanyId = params.get('company_id')
  const preCompanyName = params.get('company')
  const [step, setStep] = useState(0)
  const [companyPick, setCompanyPick] = useState<PickerValue | null>(
    preCompanyId && preCompanyName
      ? { companyId: preCompanyId, companyName: preCompanyName, contactId: null, contactEmail: null, contactName: null }
      : null,
  )
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
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
        <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Pricing Matrix</Link>
        <h1 className="m-0 mt-3 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">New quote</h1>

        <nav className="mt-6" aria-label="Steps" style={{ borderBottom: `1px solid ${RULE}` }}>
          <ol className="m-0 p-0 list-none flex items-center gap-7">
            {steps.map((s, i) => {
              const on = i === step
              const reachable = i === 0 || namedCount > 0
              return (
                <li key={s}>
                  <button type="button" onClick={() => setStep(i)} disabled={!reachable} aria-current={on ? 'step' : undefined}
                    className={cn('relative block pb-3 text-[15px] bg-transparent border-0 p-0 cursor-pointer disabled:cursor-default', on ? 'font-medium' : 'hover:text-[#202124]')} style={{ color: on ? INK : MUTED }}>
                    {i + 1}. {s}
                    <span className={cn('absolute left-0 right-0 -bottom-px h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden />
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        {error && <p role="alert" className="m-0 mt-5 text-[14px]" style={{ color: '#3c4043' }}>{error}</p>}

        {step === 0 && (
          <div className="mt-8 flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px] gap-3 max-w-[640px] items-start">
              <CompanyContactPicker value={companyPick} onChange={setCompanyPick} hideContact />
              <input type="date" value={effDate} onChange={e => setEffDate(e.target.value)} title="Policy effective date" aria-label="Policy effective date" className={dateCls} />
            </div>

            <CensusEditor census={census} setCensus={setCensus} companyId={companyPick?.companyId ?? null} onRenameTier={renameOverrideCategory} />

            <div className="flex justify-end">
              <button type="button" onClick={() => setStep(1)} disabled={namedCount === 0} className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: INK }}>Next: insurers</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mt-8 flex flex-col gap-6">
            {selectedCoverages.length > 0 && (
              <div className="rounded-[16px] bg-white p-5 flex flex-col gap-4" style={{ border: `1px solid ${RULE}` }}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em] leading-tight flex items-center">Client target requirements<Tip text="Optional. Used to auto-pick a plan tier per insurer." /></h2>
                  <Btn level="secondary" onClick={runMatch} disabled={matching || !Object.values(targets).some(t => t?.trim())} loading={matching}>Auto-match plan tiers</Btn>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedCoverages.map(c => (
                    <label key={c.code} className="block min-w-0">
                      <span className="block text-[12.5px] mb-1.5" style={{ color: MUTED }}>{c.label}</span>
                      <input value={targets[c.code] ?? ''} onChange={e => setTargets(t => ({ ...t, [c.code]: e.target.value }))}
                        placeholder="e.g. $200k annual limit, private hospital, 1-bed" className={inputCls} />
                    </label>
                  ))}
                </div>
                {matchError && <p role="alert" className="m-0 text-[13.5px]" style={{ color: '#3c4043' }}>{matchError}</p>}
              </div>
            )}

            <PlanSelectionEditor avail={avail} selected={selected} selections={selections} toggleInsurer={toggleInsurer} setSel={setSel} namedCount={namedCount} matchNotes={matchNotes} />

            <CategoryOverrideEditor avail={avail} selected={selected} census={census} overrides={categoryOverrides} setOverride={setOverride} />

            {selectedIds.length > 0 && namedCount > 0 && (
              <div className="flex flex-col gap-4 pt-6" style={{ borderTop: `1px solid ${RULE}` }}>
                <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em] leading-tight">Live comparison</h2>
                {(() => {
                  const { cheapest, priciest, spread } = quoteSpreadStats(liveResult.insurers)
                  return cheapest && (
                    <MetricGrid className="md:grid-cols-3">
                      <MetricCard label="Lowest premium" value={`$${cheapest.grand!.toLocaleString()}`} sub={cheapest.insurer_name} />
                      <MetricCard label="Highest premium" value={priciest ? `$${priciest.grand!.toLocaleString()}` : '—'} sub={priciest?.insurer_name} />
                      <MetricCard label="Spread" value={spread != null ? `$${spread.toLocaleString()}` : '—'} sub={spread != null ? 'across selected insurers' : undefined} />
                    </MetricGrid>
                  )
                })()}
                <PmComparison result={liveResult} />
                <h2 className="m-0 mt-2 text-[16px] font-medium tracking-[-0.01em] leading-tight">Benefit schedule</h2>
                <PmLiveBenefitPreview rows={liveBenefitRows} insurers={selectedInsurerMeta} />
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button type="button" onClick={() => setStep(0)} className="h-12 px-5 rounded-[12px] bg-white text-[15px] border cursor-pointer hover:bg-[#f8f9fa]" style={{ borderColor: '#dadce0', color: INK }}>Back</button>
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" onClick={downloadComparisonPdf} disabled={downloading || selectedIds.length === 0} className="h-12 px-5 rounded-[12px] bg-white text-[15px] border cursor-pointer inline-flex items-center gap-2 hover:bg-[#f8f9fa] disabled:opacity-50 disabled:cursor-not-allowed" style={{ borderColor: '#dadce0', color: INK }}>
                  <Download size={15} /> {downloading ? 'Preparing…' : 'Download comparison PDF'}
                </button>
                <button type="button" onClick={saveQuote} disabled={saving || selectedIds.length === 0 || !effDate} title={!effDate ? 'Set a policy effective date in the Census step. Ages are computed from it.' : ''} className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: INK }}>
                  {saving ? 'Saving…' : 'Save quote'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** The page reads the company out of the URL, so it needs a boundary to prerender. */
export default function NewQuotePage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-56px)] bg-white"><Spinner /></div>}>
      <NewQuoteInner />
    </Suspense>
  )
}
