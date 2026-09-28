'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { PmComparison } from '@/components/pricing-matrix/PmComparison'
import { PmLiveBenefitPreview } from '@/components/pricing-matrix/PmLiveBenefitPreview'
import { PmQuoteActions } from '@/components/pricing-matrix/PmQuoteActions'
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
import type { Recommendation, LegacyRecommendation } from '@/lib/pm-recommend'
import { MetricCard, MetricGrid } from '@/components/shared/metric-card'
import { Empty, Spinner } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const dateCls = 'h-12 w-full rounded-[12px] border border-[#dadce0] bg-white px-4 text-[15px] text-[#202124] outline-none focus:border-[#202124]'

type Quote = {
  id: string; company_name: string | null; company_id: string | null; effective_date: string | null; member_count: number
  census: CensusMember[]; calculator_ids: string[]; selections: Record<string, Selection>
  category_overrides: Record<string, CategoryOverrides> | null
  results: QuoteResult | null; recommendation: Recommendation | LegacyRecommendation | null; priorities: string | null; created_at: string
}

async function safeJson<T>(r: Response): Promise<T & { error?: string }> {
  try { return await r.json() } catch { return { error: `HTTP ${r.status}` } as T & { error?: string } }
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [avail, setAvail] = useState<AvailableCalculator[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editCompanyPick, setEditCompanyPick] = useState<PickerValue | null>(null)
  const editCompany = editCompanyPick?.companyName ?? ''
  const [editEffDate, setEditEffDate] = useState('')
  const [editCensus, setEditCensus] = useState<CensusMember[]>([])
  const [editSelected, setEditSelected] = useState<Record<string, boolean>>({})
  const [editSelections, setEditSelections] = useState<Record<string, Selection>>({})
  const [editCategoryOverrides, setEditCategoryOverrides] = useState<Record<string, CategoryOverrides>>({})

  useEffect(() => {
    fetch(`/api/pricing-matrix/quote/${id}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => { setQuote(d); setLoading(false) })
    fetch('/api/pricing-matrix/quote/available', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(setAvail)
  }, [id])

  function startEdit() {
    if (!quote) return
    setEditCompanyPick(quote.company_id ? { companyId: quote.company_id, companyName: quote.company_name ?? '', contactId: null, contactEmail: null, contactName: null } : null)
    setEditEffDate(quote.effective_date ?? '')
    setEditCensus(quote.census.length ? quote.census : [{ name: '', relationship: 'Self', date_of_birth: null, age: null }])
    setEditSelected(Object.fromEntries(quote.calculator_ids.map(cid => [cid, true])))
    setEditSelections(quote.selections)
    setEditCategoryOverrides(quote.category_overrides ?? {})
    setError(null)
    setEditing(true)
  }

  const editNamedCount = editCensus.filter(m => (m.name ?? '').trim() || m.date_of_birth || m.age != null).length
  const editSelectedIds = useMemo(() => avail.filter(a => editSelected[a.id]).map(a => a.id), [avail, editSelected])

  // Same live-compute pattern as the "New quote" wizard — pm-calc.ts/pm-compare.ts are pure, so
  // this recomputes instantly on every dropdown toggle with no round-trip to the server.
  const liveResult: QuoteResult = useMemo(() => {
    const globals = { effective_date: editEffDate || null }
    const insurers: InsurerResult[] = avail.filter(a => editSelected[a.id]).map((a): InsurerResult => {
      if (!a.rate_table) return { calculator_id: a.id, insurer_name: a.insurer_name, effective_date: a.effective_date, coverage_lines: [], by_line: {}, grand: null, member_count: 0, avg_per_life: null, members: [], error: 'No approved rate table for this insurer' }
      try {
        return computeInsurerQuote(a.id, a.insurer_name, a.effective_date, a.rate_table, editCensus, editSelections[a.id] ?? {}, globals, editCategoryOverrides[a.id], a.computation_rules ?? undefined)
      } catch (e) {
        return { calculator_id: a.id, insurer_name: a.insurer_name, effective_date: a.effective_date, coverage_lines: coverageCodes(a.rate_table), by_line: {}, grand: null, member_count: 0, avg_per_life: null, members: [], error: String(e) }
      }
    })
    return { insurers, lines_union: alignLines(insurers), census_size: editNamedCount }
  }, [avail, editSelected, editCensus, editSelections, editCategoryOverrides, editEffDate, editNamedCount])

  const liveBenefitRows: CompareRow[] = useMemo(() => {
    const insurersForTerms = avail.filter(a => editSelected[a.id] && a.rate_table).map(a => ({ calculator_id: a.id, insurer_name: a.insurer_name, rate_table: a.rate_table!, terms: a.benefit_terms }))
    return alignSelectedTerms(insurersForTerms, editSelections)
  }, [avail, editSelected, editSelections])

  const editSelectedMeta = useMemo(() => avail.filter(a => editSelected[a.id]).map(a => ({ calculator_id: a.id, insurer_name: a.insurer_name })), [avail, editSelected])

  function toggleInsurer(a: AvailableCalculator) {
    setEditSelected(s => ({ ...s, [a.id]: !s[a.id] }))
    setEditSelections(prev => {
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
    setEditSelections(prev => ({ ...prev, [calcId]: { ...prev[calcId], [code]: { ...prev[calcId]?.[code], [field]: value } } }))
  const setOverride = (calcId: string, category: string, code: string, field: string, value: string) =>
    setEditCategoryOverrides(prev => ({
      ...prev,
      [calcId]: { ...prev[calcId], [category]: { ...prev[calcId]?.[category], [code]: { ...prev[calcId]?.[category]?.[code], [field]: value } } },
    }))
  function renameOverrideCategory(oldName: string, newName: string) {
    setEditCategoryOverrides(prev => {
      const next: typeof prev = {}
      for (const [calcId, byCat] of Object.entries(prev)) {
        const { [oldName]: moved, ...rest } = byCat
        next[calcId] = moved ? { ...rest, [newName]: moved } : byCat
      }
      return next
    })
  }

  async function saveChanges() {
    setSaving(true); setError(null)
    const res = await fetch(`/api/pricing-matrix/quote/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: editCompany, company_id: editCompanyPick?.companyId ?? null, effective_date: editEffDate || null, census: editCensus, calculator_ids: editSelectedIds, selections: editSelections, category_overrides: editCategoryOverrides }),
    })
    const d = await safeJson<{ results?: QuoteResult }>(res)
    if (!res.ok || !d.results) { setError(d.error ?? 'Save failed'); setSaving(false); return }
    setQuote(q => q ? {
      ...q, company_name: editCompany || null, company_id: editCompanyPick?.companyId ?? null, effective_date: editEffDate || null, census: editCensus,
      calculator_ids: editSelectedIds, selections: editSelections, category_overrides: editCategoryOverrides, results: d.results!, member_count: editNamedCount,
    } : q)
    setSaving(false); setEditing(false)
  }

  if (loading) return <div className="min-h-[calc(100vh-56px)] bg-white"><Spinner /></div>
  if (!quote) return <div className="min-h-[calc(100vh-56px)] bg-white"><Empty>Quote not found.</Empty></div>

  const meta = [`${quote.member_count} lives`, quote.effective_date ? `effective ${quote.effective_date}` : null, `created ${new Date(quote.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}`].filter(Boolean).join(' · ')

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
        <Link href="/pricing-matrix/quote" className="inline-flex items-center gap-1.5 text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Quotes</Link>

        <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08] truncate">{quote.company_name || 'Untitled quote'}</h1>
            <p className="m-0 mt-2 text-[13.5px] tabular-nums" style={{ color: MUTED }}>{meta}</p>
          </div>
          {!editing && (
            <button type="button" onClick={startEdit} className="h-12 px-5 rounded-[12px] bg-white text-[15px] border cursor-pointer hover:bg-[#f8f9fa] shrink-0" style={{ borderColor: '#dadce0', color: INK }}>Edit</button>
          )}
        </div>

        {error && <p role="alert" className="m-0 mt-5 text-[14px]" style={{ color: '#3c4043' }}>{error}</p>}

        {editing ? (
          <div className="mt-8 flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px] gap-3 max-w-[640px] items-start">
              <CompanyContactPicker value={editCompanyPick} onChange={setEditCompanyPick} hideContact initialQuery={quote.company_name ?? ''} />
              <input type="date" value={editEffDate} onChange={e => setEditEffDate(e.target.value)} title="Policy effective date" aria-label="Policy effective date" className={dateCls} />
            </div>

            <CensusEditor census={editCensus} setCensus={setEditCensus} companyId={editCompanyPick?.companyId ?? null} onRenameTier={renameOverrideCategory} />

            <PlanSelectionEditor avail={avail} selected={editSelected} selections={editSelections} toggleInsurer={toggleInsurer} setSel={setSel} namedCount={editNamedCount} />

            <CategoryOverrideEditor avail={avail} selected={editSelected} census={editCensus} overrides={editCategoryOverrides} setOverride={setOverride} />

            {editSelectedIds.length > 0 && editNamedCount > 0 && (
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
                <PmLiveBenefitPreview rows={liveBenefitRows} insurers={editSelectedMeta} />
              </div>
            )}

            <div className="flex justify-end gap-3 flex-wrap">
              <button type="button" onClick={() => setEditing(false)} disabled={saving} className="h-12 px-5 rounded-[12px] bg-white text-[15px] border cursor-pointer hover:bg-[#f8f9fa] disabled:opacity-50" style={{ borderColor: '#dadce0', color: INK }}>Cancel</button>
              <button type="button" onClick={saveChanges} disabled={saving || editSelectedIds.length === 0 || editNamedCount === 0} className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: INK }}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : quote.results ? (
          <div className="mt-8 flex flex-col gap-6">
            {(() => {
              const { cheapest, priciest, spread } = quoteSpreadStats(quote.results.insurers)
              return cheapest && (
                <MetricGrid className="md:grid-cols-3">
                  <MetricCard label="Lowest premium" value={`$${cheapest.grand!.toLocaleString()}`} sub={cheapest.insurer_name} />
                  <MetricCard label="Highest premium" value={priciest ? `$${priciest.grand!.toLocaleString()}` : '—'} sub={priciest?.insurer_name} />
                  <MetricCard label="Spread" value={spread != null ? `$${spread.toLocaleString()}` : '—'} sub={spread != null ? 'across selected insurers' : undefined} />
                </MetricGrid>
              )
            })()}
            <PmComparison result={quote.results} />
            <PmQuoteActions quoteId={quote.id} results={quote.results} initialRecommendation={quote.recommendation} initialPriorities={quote.priorities} />
          </div>
        ) : <Empty>No results stored for this quote.</Empty>}
      </div>
    </div>
  )
}
