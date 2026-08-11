'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Pencil, Save, X } from 'lucide-react'
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

const inp = 'text-[12.5px] border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25'

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

  if (loading) return <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-24 justify-center"><Loader2 size={15} className="animate-spin" /> Loading…</div>
  if (!quote) return <div className="p-8 text-sm text-rose-600">Not found.</div>

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <Link href="/pricing-matrix/quote" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Quotes</Link>

      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-[18px] font-semibold text-foreground">{quote.company_name || 'Untitled quote'}</h1>
        {!editing && (
          <button onClick={startEdit} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-border hover:bg-muted shrink-0">
            <Pencil size={13} /> Edit
          </button>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground/70 mb-5">{quote.member_count} lives{quote.effective_date ? ` · eff. ${quote.effective_date}` : ''} · {new Date(quote.created_at).toLocaleString('en-SG')}</p>

      {error && <div className="mb-4 text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

      {editing ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 max-w-lg items-start">
            <CompanyContactPicker value={editCompanyPick} onChange={setEditCompanyPick} hideContact initialQuery={quote.company_name ?? ''} />
            <input type="date" value={editEffDate} onChange={e => setEditEffDate(e.target.value)} title="Policy effective date" className={inp} />
          </div>

          <CensusEditor census={editCensus} setCensus={setEditCensus} companyId={editCompanyPick?.companyId ?? null} onRenameTier={renameOverrideCategory} />

          <PlanSelectionEditor avail={avail} selected={editSelected} selections={editSelections} toggleInsurer={toggleInsurer} setSel={setSel} namedCount={editNamedCount} />

          <CategoryOverrideEditor avail={avail} selected={editSelected} census={editCensus} overrides={editCategoryOverrides} setOverride={setOverride} />

          {editSelectedIds.length > 0 && editNamedCount > 0 && (
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
              <PmLiveBenefitPreview rows={liveBenefitRows} insurers={editSelectedMeta} />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} disabled={saving} className="flex items-center gap-1.5 text-[13px] px-4 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50"><X size={14} /> Cancel</button>
            <button onClick={saveChanges} disabled={saving || editSelectedIds.length === 0 || editNamedCount === 0} className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : quote.results ? (
        <div className="flex flex-col gap-6">
          {(() => {
            const { cheapest, priciest, spread } = quoteSpreadStats(quote.results.insurers)
            return cheapest && (
              <MetricGrid className="md:grid-cols-3">
                <MetricCard label="Cheapest" value={`$${cheapest.grand!.toLocaleString()}`} sub={cheapest.insurer_name} />
                <MetricCard label="Most expensive" value={priciest ? `$${priciest.grand!.toLocaleString()}` : '—'} sub={priciest?.insurer_name} />
                <MetricCard label="Spread" value={spread != null ? `$${spread.toLocaleString()}` : '—'} sub={spread != null ? 'across selected insurers' : undefined} />
              </MetricGrid>
            )
          })()}
          <PmComparison result={quote.results} />
          <PmQuoteActions quoteId={quote.id} results={quote.results} initialRecommendation={quote.recommendation} initialPriorities={quote.priorities} />
        </div>
      ) : <p className="text-[13px] text-muted-foreground">No results stored for this quote.</p>}
    </div>
  )
}
