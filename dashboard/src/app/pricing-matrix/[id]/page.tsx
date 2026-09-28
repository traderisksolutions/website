'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Plus, Trash2, Pencil } from 'lucide-react'
import type { RateTable, Coverage, RatePlan, ReconciliationIssue } from '@/lib/pm-rates'
import { runnableIssues, rateTableIsRunnable, EMPTY_RATE_TABLE } from '@/lib/pm-rates'
import type { RuleConflict } from '@/lib/pm-rates-extract'
import type { BenefitTerm, TermConflict } from '@/lib/pm-benefits-extract'
import type { RuleStep, ExcelShape } from '@/lib/pm-rules-extract'
import { computeInsurerQuote } from '@/lib/pm-calc'
import type { InsurerResult } from '@/lib/pm-quote'
import { StatusPill, CALCULATOR_STATUS, RULES_STATUS } from '@/components/shared/status-pill'
import { Btn, Chip, Empty, Segmented, Spinner, inputCls } from '@/components/crm/primitives'
import { Tip } from '@/components/Tip'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
/** Outline card, as on Home: white, hairline, 16px radius, no shadow. */
const card = 'rounded-[16px] bg-white border border-[#e8eaed]'
const h2 = 'm-0 text-[16px] font-medium tracking-[-0.01em] leading-tight flex items-center'
const iconBtn = 'w-8 h-8 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] disabled:opacity-50'

type Dump = {
  sheets: { name: string; state: string; visible: boolean; max_row: number; max_col: number }[]
  previews: Record<string, { top_rows: { row: number; cells: Record<string, string> }[] }>
  values?: Record<string, Record<string, string>>
}
type Accuracy = { extractors?: string[]; total_rates?: number; agreed?: number; conflicts?: number; adjudicated?: number; single_source?: number }
type Calc = {
  id: string; insurer_name: string | null; label: string | null; status: string
  xlsx_filename: string | null; brochure_filename: string | null; effective_date: string | null; version: number
  workbook_summary: Dump | null
  rate_table: (RateTable & { accuracy?: Accuracy }) | null
  benefit_terms: { terms: BenefitTerm[]; accuracy?: { total: number; conflicts: number } } | null
  issues: ReconciliationIssue[]
  analysis_summary?: string | null
  change_summary?: { text?: string } | null
  computation_rules: { id: string; source: ExcelShape; status: 'draft' | 'in_review' | 'approved' | 'archived'; rules: RuleStep[] } | null
}

/** A reconciliation issue joined with its live value shape, so resolving it can both mutate the
 *  in-memory rate table/terms (as before) AND persist the decision (who/when) via the new endpoint. */
type RuleIssue = RuleConflict & { issueId: string }
type TermIssue = TermConflict & { issueId: string }

type TaxCategory = { id: string; name: string; status: 'active' | 'archived' }
type NewTerm = { id: string; term: string; source: 'coverage' | 'benefit_term' }
type Section = 'review' | 'rates' | 'terms' | 'workbook'

async function safeJson<T>(r: Response): Promise<T & { error?: string }> {
  try { return await r.json() } catch { return { error: `HTTP ${r.status}` } as T & { error?: string } }
}

export default function CalculatorReviewPage() {
  const { id } = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const [calc, setCalc] = useState<Calc | null>(null)
  const [rt, setRt] = useState<RateTable | null>(null)
  const [terms, setTerms] = useState<BenefitTerm[]>([])
  const [ruleConflicts, setRuleConflicts] = useState<RuleIssue[]>([])
  const [termConflicts, setTermConflicts] = useState<TermIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState<{ label: string; step: number; total: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [classifying, setClassifying] = useState(false)
  const [classifyMsg, setClassifyMsg] = useState<string | null>(null)
  const [newTerms, setNewTerms] = useState<NewTerm[]>([])
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([])
  // View-only: which section the Segmented switch shows. No data flows through it.
  const [section, setSection] = useState<Section>('review')

  const loadTerminology = useCallback(async () => {
    const [nRes, cRes] = await Promise.all([
      fetch(`/api/pricing-matrix/taxonomy/synonyms?status=pending&calculator_id=${id}`, { cache: 'no-store' }),
      fetch('/api/pricing-matrix/taxonomy/categories', { cache: 'no-store' }),
    ])
    setNewTerms(nRes.ok ? await nRes.json() : [])
    setTaxCategories(cRes.ok ? await cRes.json() : [])
  }, [id])

  async function approveTerm(synonymId: string, categoryId: string) {
    if (!categoryId) return
    await fetch(`/api/pricing-matrix/taxonomy/synonyms/${synonymId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category_id: categoryId }) })
    await loadTerminology()
  }
  async function rejectTerm(synonymId: string) {
    await fetch(`/api/pricing-matrix/taxonomy/synonyms/${synonymId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reject: true }) })
    await loadTerminology()
  }

  async function patchMeta(body: Record<string, unknown>) {
    await fetch(`/api/pricing-matrix/calculators/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    await load()
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/pricing-matrix/calculators/${id}`, { cache: 'no-store' })
    const row = await safeJson<Calc>(res)
    if (res.ok) {
      setCalc(row)
      setRt(row.rate_table ?? null)
      setTerms(row.benefit_terms?.terms ?? [])
      const open = (row.issues ?? []).filter(i => i.status === 'open')
      setRuleConflicts(open.filter(i => i.kind === 'rule').map(i => ({ issueId: i.id, field: i.field ?? '', opus: i.opus_value, gemini: i.gemini_value })))
      setTermConflicts(open.filter(i => i.kind === 'term').map(i => ({ issueId: i.id, key: i.dedupe_key ?? '', category: i.category ?? '', label: i.label ?? '', opus: i.opus_value as string | undefined, gemini: i.gemini_value as string | undefined, note: i.note ?? '' })))
    }
    setLoading(false)
    return row
  }, [id])

  // Five SEPARATE synchronous requests, not one long backgrounded chain — on Vercel's free plan a
  // single function's real execution ceiling is ~60s no matter what maxDuration claims. The rate
  // stage is split into two (read, then reconcile+judge) because the judge call running
  // SEQUENTIALLY after the parallel Opus+Gemini read was, on its own, enough to blow the combined
  // request past that ceiling even after the outer pipeline was split into 4 stages — see
  // pm-extract-shared.ts and pm-rates-extract.ts's readRateTables/finalizeRateTable.
  const runExtract = useCallback(async () => {
    setExtracting(true); setError(null)
    const TOTAL = 6
    const call = async (path: string, body?: Record<string, unknown>) =>
      fetch(`/api/pricing-matrix/calculators/${id}/extract/${path}`, {
        method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
      })
    const fail = async (path: string, d: { error?: string }, res: Response) => {
      // Stage name always prefixed — a raw 504 body isn't JSON, so d.error alone (e.g. "HTTP 504")
      // would otherwise hide WHICH stage timed out, the one thing worth knowing to debug it.
      setError(`${path} stage failed: ${d.error ?? `HTTP ${res.status}`}`)
      setExtracting(false); setProgress(null)
      await load()
    }

    setProgress({ label: 'Reading the workbook', step: 1, total: TOTAL })
    let res = await call('dump')
    let d = await safeJson<{ error?: string }>(res)
    if (!res.ok) { await fail('dump', d, res); return }

    // Rate extraction is split by workbook sheet (see extract/rate-plan) so no single AI call ever
    // has to embed the whole workbook as inline JSON text — the thing that was pushing extraction
    // past Vercel's free-plan execution ceiling on larger calculators.
    setProgress({ label: 'Planning rate extraction', step: 2, total: TOTAL })
    res = await call('rate-plan')
    const plan = await safeJson<{ batches?: string[][]; error?: string }>(res)
    if (!res.ok) { await fail('rate-plan', plan, res); return }
    const batches = plan.batches ?? [[]]

    for (let i = 0; i < batches.length; i++) {
      setProgress({ label: batches.length > 1 ? `Reading rates — sheet batch ${i + 1} of ${batches.length}` : 'Reading rates — Opus & Gemini', step: 3, total: TOTAL })
      res = await call('rate', { sheets: batches[i], batchIndex: i, batchTotal: batches.length })
      d = await safeJson<{ error?: string }>(res)
      if (!res.ok) { await fail('rate', d, res); return }
    }

    setProgress({ label: 'Cross-checking every rate', step: 4, total: TOTAL })
    res = await call('rate-finalize')
    d = await safeJson<{ error?: string }>(res)
    if (!res.ok) { await fail('rate-finalize', d, res); return }

    setProgress({ label: 'Extracting coverage terms', step: 5, total: TOTAL })
    res = await call('benefits')
    d = await safeJson<{ error?: string }>(res)
    if (!res.ok) { await fail('benefits', d, res); return }

    setProgress({ label: 'Reading calculation logic', step: 6, total: TOTAL })
    res = await call('rules')
    d = await safeJson<{ error?: string }>(res)
    if (!res.ok) { await fail('rules', d, res); return }

    setExtracting(false); setProgress(null)
    await load()
  }, [id, load])

  async function runClassify() {
    setClassifying(true); setError(null); setClassifyMsg(null)
    const res = await fetch(`/api/pricing-matrix/calculators/${id}/classify-categories`, { method: 'POST' })
    const d = await safeJson<{ coverages_classified?: number; terms_classified?: number; error?: string }>(res)
    if (!res.ok) { setError(d.error ?? 'Could not sync benefit categories'); setClassifying(false); return }
    setClassifyMsg(`Tagged ${d.coverages_classified ?? 0} coverage line(s), ${d.terms_classified ?? 0} benefit term(s).`)
    setClassifying(false)
    await load()
  }

  useEffect(() => { load() }, [load])
  useEffect(() => { loadTerminology() }, [loadTerminology])
  // Auto-extract right after upload.
  useEffect(() => {
    if (calc && calc.status === 'draft' && !calc.rate_table && search.get('automap') === '1' && !extracting) {
      runExtract()
      router.replace(`/pricing-matrix/${id}`)
    }
  }, [calc, search, extracting, runExtract, router, id])

  async function save() {
    if (!rt) return
    setSaving(true); setError(null)
    const res = await fetch(`/api/pricing-matrix/calculators/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rate_table: rt,
        benefit_terms: { terms, accuracy: { total: terms.length, conflicts: termConflicts.length } },
      }),
    })
    if (!res.ok) setError((await safeJson<{ error?: string }>(res)).error ?? 'Save failed')
    await load(); setSaving(false)
  }

  async function approve() {
    setSaving(true); setError(null)
    const res = await fetch(`/api/pricing-matrix/calculators/${id}/approve`, { method: 'POST' })
    if (!res.ok) setError((await safeJson<{ error?: string }>(res)).error ?? 'Approve failed')
    await load(); setSaving(false)
  }

  const [approvingRules, setApprovingRules] = useState(false)
  async function approveRules() {
    setApprovingRules(true); setError(null)
    const res = await fetch(`/api/pricing-matrix/calculators/${id}/rules/approve`, { method: 'POST' })
    if (!res.ok) setError((await safeJson<{ error?: string }>(res)).error ?? 'Could not approve calculation logic')
    await load(); setApprovingRules(false)
  }

  const resolveIssue = (issueId: string, body: Record<string, unknown>) =>
    fetch(`/api/pricing-matrix/calculators/${id}/issues/${issueId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {})

  function resolveRule(rc: RuleIssue, value: unknown) {
    if (!rt) return
    setRt({ ...rt, rules: { ...rt.rules, [rc.field]: value } })
    setRuleConflicts(cs => cs.filter(c => c !== rc))
    void resolveIssue(rc.issueId, { resolution: value })
  }
  function dismissRule(rc: RuleIssue) {
    setRuleConflicts(cs => cs.filter(c => c !== rc))
    void resolveIssue(rc.issueId, { dismiss: true })
  }

  function resolveTerm(tc: TermIssue, value: string | undefined) {
    setTerms(ts => {
      const idx = ts.findIndex(t => termKeyOf(t) === tc.key)
      if (value === undefined) return idx >= 0 ? ts.filter((_, i) => i !== idx) : ts // "remove"
      if (idx >= 0) { const copy = [...ts]; copy[idx] = { ...copy[idx], value }; return copy }
      return ts
    })
    setTermConflicts(cs => cs.filter(c => c !== tc))
    void resolveIssue(tc.issueId, value === undefined ? { dismiss: true } : { resolution: value })
  }

  if (loading) return <div className="min-h-[calc(100vh-56px)] bg-white"><Spinner /></div>
  if (!calc) return <div className="min-h-[calc(100vh-56px)] bg-white"><Empty>Calculator not found.</Empty></div>

  const issues = runnableIssues(rt)
  const runnable = rateTableIsRunnable(rt)
  const approved = calc.status === 'approved'
  const openItems = ruleConflicts.length + termConflicts.length
  const reviewCount = openItems + newTerms.length + (calc.computation_rules?.rules?.length && calc.computation_rules.status !== 'approved' ? 1 : 0)
  const agreement = calc.rate_table?.accuracy?.total_rates ? `${Math.round((calc.rate_table.accuracy.agreed! / calc.rate_table.accuracy.total_rates) * 100)}% cross-check agreement${calc.rate_table.accuracy.extractors?.length ? ` (${calc.rate_table.accuracy.extractors.join(' + ')})` : ''}` : null
  const facts = rt ? [
    `${rt.coverages.length} coverage${rt.coverages.length === 1 ? '' : 's'}`,
    `${new Set(rt.coverages.flatMap(c => c.plans.map(p => p.code))).size} plans`,
    `${openItems} flagged`,
    agreement,
  ].filter(Boolean).join(' · ') : null
  const primaryBtn = 'h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed'
  const secondaryBtn = 'h-12 px-5 rounded-[12px] bg-white text-[15px] border border-[#dadce0] text-[#202124] cursor-pointer inline-flex items-center gap-2 hover:bg-[#f8f9fa] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap'

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1400px] px-6 sm:px-12 pt-12 pb-20">
        <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Pricing Matrix</Link>

        {/* Header */}
        <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0 max-w-[760px]">
            <div className="flex items-center gap-3 flex-wrap">
              {editingName ? (
                <input autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)}
                  onBlur={() => { setEditingName(false); const v = nameDraft.trim(); if (v && v !== (calc.insurer_name ?? '')) patchMeta({ insurer_name: v }) }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingName(false) }}
                  placeholder="Insurer name" aria-label="Insurer name" className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08] bg-white border-0 border-b-2 border-[#202124] px-0 py-0 outline-none min-w-[280px]" style={{ color: INK }} />
              ) : (
                <span className="flex items-center gap-2 min-w-0">
                  <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08] truncate" style={{ color: calc.insurer_name ? INK : MUTED }}>{calc.insurer_name || calc.label || 'Untitled calculator'}</h1>
                  {!approved && <button type="button" onClick={() => { setNameDraft(calc.insurer_name ?? ''); setEditingName(true) }} title="Rename insurer" aria-label="Rename insurer" className={iconBtn} style={{ color: MUTED }}><Pencil size={14} /></button>}
                </span>
              )}
              <StatusPill status={calc.status} config={CALCULATOR_STATUS} className="shrink-0" />
              <Chip className="shrink-0">v{calc.version}</Chip>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[13.5px]" style={{ color: MUTED }}>
              <span>{calc.xlsx_filename}</span>
              {calc.brochure_filename && <><span style={{ color: '#9aa0a6' }}>·</span><span>{calc.brochure_filename}</span></>}
              <span style={{ color: '#9aa0a6' }}>·</span>
              {approved ? (
                calc.effective_date ? <span className="tabular-nums">effective {calc.effective_date}</span> : <span>no effective date</span>
              ) : (
                <label className="inline-flex items-center gap-1.5">effective <input type="date" value={calc.effective_date ?? ''} onChange={e => patchMeta({ effective_date: e.target.value || null })} aria-label="Rate effective date" className="h-8 rounded-[8px] border border-[#dadce0] bg-white px-2 text-[13px] outline-none focus:border-[#202124]" style={{ color: INK }} /></label>
              )}
            </div>
            {facts && <p className="m-0 mt-2 text-[13.5px] tabular-nums" style={{ color: MUTED }}>{facts}</p>}
          </div>
          <div className="flex items-center gap-3 flex-wrap shrink-0">
            <button type="button" onClick={() => { if (rt && !window.confirm('Re-extracting replaces the current rate table, rules, and coverage terms with a fresh AI proposal. Continue?')) return; runExtract() }} disabled={extracting} className={secondaryBtn}>
              {extracting && <Loader2 size={14} className="animate-spin" />}{rt ? 'Re-extract' : 'Extract'}
            </button>
            {rt && (
              <button type="button" onClick={runClassify} disabled={classifying} title="Tags each coverage and benefit term with a shared canonical category so it aligns against other insurers. Rates, rules and approval are untouched." className={secondaryBtn}>
                {classifying && <Loader2 size={14} className="animate-spin" />} Sync benefit categories
              </button>
            )}
            {!approved && <button type="button" onClick={save} disabled={saving || !rt} className={secondaryBtn}>Save</button>}
            {!approved && <button type="button" onClick={approve} disabled={saving || !runnable || openItems > 0} title={openItems > 0 ? `Resolve ${openItems} flagged item${openItems === 1 ? '' : 's'} first` : (!runnable ? issues[0] : '')} className={primaryBtn} style={{ background: INK }}>Approve{openItems > 0 ? ` · ${openItems} left` : ''}</button>}
            {approved && <Link href="/pricing-matrix/quote/new" className={`${primaryBtn} no-underline inline-flex items-center`} style={{ background: INK }}>New quote</Link>}
          </div>
        </div>

        {error && <p role="alert" className="m-0 mt-5 text-[14px]" style={{ color: '#3c4043' }}>{error}</p>}
        {classifyMsg && <p role="status" className="m-0 mt-5 text-[14px]" style={{ color: '#3c4043' }}>{classifyMsg}</p>}
        {extracting && (
          <div className="mt-6 rounded-[16px] px-6 py-5" style={{ background: '#f1f3f4' }} aria-busy="true">
            <div className="flex items-center gap-2 text-[14px] mb-3">
              <Loader2 size={14} className="animate-spin" style={{ color: MUTED }} />
              <span className="font-medium">{progress?.label ?? 'Reading the workbook…'}</span>
              <span className="ml-auto tabular-nums text-[13px]" style={{ color: MUTED }}>{progress ? `${Math.min(progress.step, progress.total)} / ${progress.total}` : ''}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#e8eaed' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress ? Math.round((Math.min(progress.step, progress.total) / progress.total) * 100) : 8}%`, background: INK }} />
            </div>
            <p className="m-0 text-[12.5px] mt-2" style={{ color: MUTED }}>Two models read the rates, rules and coverage terms independently, cross-checking the xlsx and the brochure.</p>
          </div>
        )}

        {!rt && !extracting && (
          <div className="py-16 text-center">
            <p className="m-0 text-[15px]" style={{ color: MUTED }}>No rate table yet. Extract reads the workbook and brochure.</p>
            <button type="button" onClick={() => setRt({ ...EMPTY_RATE_TABLE, calculator_id: id })} className="mt-4 h-10 px-4 rounded-[10px] bg-white text-[14px] border border-[#dadce0] cursor-pointer hover:bg-[#f8f9fa]" style={{ color: INK }}>Set up manually</button>
          </div>
        )}

        {approved && (
          <p className="m-0 mt-6 text-[14px]" style={{ color: '#3c4043' }}>Approved. This insurer is available to quote and compare.</p>
        )}

        {approved && calc.analysis_summary && (
          <div className="mt-6 flex flex-col">
            <section className="py-6" style={{ borderTop: `1px solid ${RULE}` }}>
              <h2 className={`${h2} mb-3`}>Pricing method</h2>
              <p className="m-0 text-[14px] leading-relaxed max-w-[860px]" style={{ color: '#3c4043' }}>{calc.analysis_summary}</p>
            </section>
            {calc.change_summary?.text && (
              <section className="py-6" style={{ borderTop: `1px solid ${RULE}` }}>
                <h2 className={`${h2} mb-3`}>Changes since the previous approved version</h2>
                <p className="m-0 text-[14px] leading-relaxed max-w-[860px]" style={{ color: '#3c4043' }}>{calc.change_summary.text}</p>
              </section>
            )}
          </div>
        )}

        {rt && (
          <div className="mt-8 flex flex-col gap-6">
            <Segmented<Section>
              value={section}
              onChange={setSection}
              options={[
                { value: 'review', label: 'Review', count: reviewCount },
                { value: 'rates', label: 'Rates and rules' },
                { value: 'terms', label: 'Coverage terms', count: terms.length },
                { value: 'workbook', label: 'Workbook' },
              ]}
            />

            {section === 'review' && (
              <div className="flex flex-col gap-6">
                {/* 1 — Flagged items + readiness. */}
                <ReviewPanel issues={issues} ruleConflicts={ruleConflicts} termConflicts={termConflicts} onResolveRule={resolveRule} onDismissRule={dismissRule} onResolveTerm={resolveTerm} disabled={approved} />

                {/* New terminology this calculator surfaced — wording that didn't exactly match the
                    shared taxonomy (see /pricing-matrix/taxonomy). Approving here is retroactive: it
                    also fixes every other calculator that used the same wording. */}
                {newTerms.length > 0 && (
                  <NewTerminologyPanel terms={newTerms} categories={taxCategories.filter(c => c.status === 'active')} onApprove={approveTerm} onReject={rejectTerm} disabled={approved} />
                )}

                {/* Translated calculation logic (see pm-rules-extract.ts) — independent approval gate
                    from the calculator/rate-table status, only shown when there's something to review. */}
                {!!calc.computation_rules?.rules?.length && (
                  <ComputationRulesPanel computationRules={calc.computation_rules} onApprove={approveRules} approving={approvingRules} />
                )}
              </div>
            )}

            {section === 'rates' && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
                {/* 2 — Rate table + rules. */}
                <RateTableEditor rt={rt} setRt={setRt} disabled={approved} />
                {/* 3 — Worked example, computed locally by pm-calc.ts. */}
                <WorkedExample rt={rt} defaultEff={calc.effective_date} />
              </div>
            )}

            {section === 'terms' && <BenefitTermsEditor terms={terms} setTerms={setTerms} rt={rt} disabled={approved} />}

            {section === 'workbook' && (calc.workbook_summary ? <WorkbookSummary dump={calc.workbook_summary} /> : <Empty>No workbook summary captured.</Empty>)}
          </div>
        )}
      </div>
    </div>
  )
}

const termKeyOf = (t: Pick<BenefitTerm, 'plan_code' | 'category' | 'label'>) => {
  const n = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${n(t.plan_code)}|${n(t.category)}|${n(t.label)}`
}

// ── Step 1 — readiness + flagged items to resolve ───────────────────────────────
function ReviewPanel({ issues, ruleConflicts, termConflicts, onResolveRule, onDismissRule, onResolveTerm, disabled }: {
  issues: string[]; ruleConflicts: RuleIssue[]; termConflicts: TermIssue[]
  onResolveRule: (c: RuleIssue, value: unknown) => void; onDismissRule: (c: RuleIssue) => void
  onResolveTerm: (c: TermIssue, value: string | undefined) => void; disabled: boolean
}) {
  const open = ruleConflicts.length + termConflicts.length
  const rows = issues.length + open
  return (
    <section>
      <header className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className={h2}>Flagged items<Tip text="Where Opus and Gemini disagreed. Resolve every item, then approve." /></h2>
        <Chip>{open === 0 ? 'None open' : `${open} open`}</Chip>
      </header>

      <Register label="Flagged items" minWidth={640}>
        <RegisterHead>
          <RegisterTh first width={260}>Item</RegisterTh>
          <RegisterTh>Kind</RegisterTh>
          <RegisterTh last align="right">Resolution</RegisterTh>
        </RegisterHead>
        <tbody>
          {issues.map((s, i) => (
            <RegisterRow key={`i${i}`}>
              <RegisterCell first nowrap={false}><span className="block text-[14px] leading-snug" style={{ color: '#3c4043' }}>{s}</span></RegisterCell>
              <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>Blocks approval</span></RegisterCell>
              <RegisterCell last align="right"><span className="text-[13px]" style={{ color: MUTED }}>Fix in rates and rules</span></RegisterCell>
            </RegisterRow>
          ))}
          {ruleConflicts.map((c, i) => (
            <RegisterRow key={`r${i}`}>
              <RegisterCell first primary={c.field} secondary="Rule" />
              <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>Rule</span></RegisterCell>
              <RegisterCell last align="right" nowrap={false}>
                <span className="inline-flex flex-wrap justify-end gap-2">
                  <Btn size="xs" level="secondary" disabled={disabled} onClick={() => onResolveRule(c, c.opus)}>Use Opus: {JSON.stringify(c.opus)}</Btn>
                  <Btn size="xs" level="secondary" disabled={disabled} onClick={() => onResolveRule(c, c.gemini)}>Use Gemini: {JSON.stringify(c.gemini)}</Btn>
                  <Btn size="xs" level="tertiary" disabled={disabled} onClick={() => onDismissRule(c)}>Dismiss, edited in rates</Btn>
                </span>
              </RegisterCell>
            </RegisterRow>
          ))}
          {termConflicts.map((c, i) => (
            <RegisterRow key={`t${i}`}>
              <RegisterCell first primary={`${c.category} — ${c.label}`} secondary={c.note ?? 'Term'} title={c.note ?? undefined} />
              <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>Term</span></RegisterCell>
              <RegisterCell last align="right" nowrap={false}>
                <span className="inline-flex flex-wrap justify-end gap-2">
                  {c.opus !== undefined && <Btn size="xs" level="secondary" disabled={disabled} onClick={() => onResolveTerm(c, c.opus)}>Use: {c.opus}</Btn>}
                  {c.gemini !== undefined && <Btn size="xs" level="secondary" disabled={disabled} onClick={() => onResolveTerm(c, c.gemini)}>Use: {c.gemini}</Btn>}
                  <Btn size="xs" level="tertiary" disabled={disabled} onClick={() => onResolveTerm(c, undefined)} className="text-[#c5221f]">Remove this term</Btn>
                </span>
              </RegisterCell>
            </RegisterRow>
          ))}
          {rows === 0 && <RegisterEmpty colSpan={3}>No disagreements. Opus and Gemini agreed on every value.</RegisterEmpty>}
        </tbody>
      </Register>
    </section>
  )
}

// ── New terminology — wording that didn't exactly match the shared taxonomy ─────
function NewTerminologyPanel({ terms, categories, onApprove, onReject, disabled }: {
  terms: NewTerm[]; categories: TaxCategory[]
  onApprove: (id: string, categoryId: string) => void; onReject: (id: string) => void; disabled: boolean
}) {
  return (
    <section>
      <header className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className={h2}>New terminology<Tip text="Wording not yet in the shared taxonomy. Approving maps it for every calculator." /></h2>
        <Chip>{terms.length} to map</Chip>
      </header>
      <Register label="New terminology" minWidth={640}>
        <RegisterHead>
          <RegisterTh first width={300}>Term</RegisterTh>
          <RegisterTh>Source</RegisterTh>
          <RegisterTh last align="right">Category</RegisterTh>
        </RegisterHead>
        <tbody>
          {terms.map(t => (
            <RegisterRow key={t.id}>
              <RegisterCell first primary={t.term} secondary={t.source === 'coverage' ? 'Coverage' : 'Benefit term'} title={t.term} />
              <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{t.source === 'coverage' ? 'Coverage' : 'Benefit term'}</span></RegisterCell>
              <RegisterCell last align="right">
                <span className="inline-flex items-center gap-2">
                  <select disabled={disabled} defaultValue="" onChange={e => e.target.value && onApprove(t.id, e.target.value)} aria-label="Assign category" className={`${inputCls} w-auto h-9 disabled:opacity-50`}>
                    <option value="" disabled>Assign category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Btn size="xs" level="secondary" disabled={disabled} onClick={() => onReject(t.id)}>Reject</Btn>
                </span>
              </RegisterCell>
            </RegisterRow>
          ))}
          {terms.length === 0 && <RegisterEmpty colSpan={3}>No new terminology.</RegisterEmpty>}
        </tbody>
      </Register>
    </section>
  )
}

// ── Translated calculation logic — its own approval lifecycle ───────────────────
const SHAPE_LABEL: Record<ExcelShape, string> = {
  embedded_table: 'Workbook has its own rate table',
  formula_shell: 'Workbook is a calculation shell (numbers from the brochure)',
  hybrid: 'Workbook has both its own numbers and formulas',
}
const STEP_LABEL: Record<RuleStep['type'], string> = {
  age_band_lookup: 'Age-band lookup', flat_rate: 'Flat rate', percentage_loading: 'Percentage loading',
  conditional_tier_selection: 'Conditional tier selection', combine: 'Combine', gst_adjustment: 'GST adjustment',
}
function describeStep(s: RuleStep): string {
  switch (s.type) {
    case 'age_band_lookup': return `${s.coverage_code} — look up by age band × ${s.plan_field}`
    case 'flat_rate': return `${s.coverage_code} — flat rate (${s.plan_field})`
    case 'percentage_loading': return `Loading on ${s.applies_to === 'all' ? 'all coverages' : s.applies_to.join(', ')} by ${s.basis}${s.excludes?.length ? `, excludes ${s.excludes.join(', ')}` : ''}`
    case 'conditional_tier_selection': return `Pick ${s.output} based on ${s.variable}`
    case 'combine': return `${s.output} = ${s.inputs.join(` ${s.op === 'add' ? '+' : s.op === 'subtract' ? '−' : '×'} `)}`
    case 'gst_adjustment': return `GST ${s.inclusive ? `inclusive @ ${(s.rate * 100).toFixed(0)}%` : 'not applied'} on ${s.input_ref}`
  }
}
function ComputationRulesPanel({ computationRules, onApprove, approving }: {
  computationRules: NonNullable<Calc['computation_rules']>; onApprove: () => void; approving: boolean
}) {
  const approved = computationRules.status === 'approved'
  return (
    <section>
      <header className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className={h2}>Computation rules<Tip text="Translated from the workbook's own formulas. Check each step against its source cell before approving. Once approved, these run at quote time instead of the flat rate lookup." /></h2>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Chip>{SHAPE_LABEL[computationRules.source]}</Chip>
          <StatusPill status={computationRules.status} config={RULES_STATUS} />
          {!approved && <Btn level="secondary" onClick={onApprove} disabled={approving} loading={approving}>Approve logic</Btn>}
        </div>
      </header>
      <Register label="Computation rules" minWidth={640}>
        <RegisterHead>
          <RegisterTh first width={220}>Step</RegisterTh>
          <RegisterTh>Rule</RegisterTh>
          <RegisterTh last align="right">Source cell</RegisterTh>
        </RegisterHead>
        <tbody>
          {computationRules.rules.map((s, i) => (
            <RegisterRow key={i}>
              <RegisterCell first primary={STEP_LABEL[s.type]} secondary={`Step ${i + 1}`} />
              <RegisterCell nowrap={false}><span className="block text-[14px] leading-snug" style={{ color: '#3c4043' }}>{describeStep(s)}</span></RegisterCell>
              <RegisterCell last align="right"><span className="font-mono text-[12.5px]" style={{ color: s.source_ref ? MUTED : '#9aa0a6' }}>{s.source_ref ?? '—'}</span></RegisterCell>
            </RegisterRow>
          ))}
        </tbody>
      </Register>
    </section>
  )
}

// ── Step 2 — rate table + insurer-specific pricing rules ────────────────────────
const colInput = 'w-20 h-8 text-[13px] text-right tabular-nums rounded-[8px] px-2 bg-white border border-[#dadce0] outline-none focus:border-[#202124] disabled:opacity-60 disabled:bg-[#f8f9fa] text-[#202124]'
const txtInput = 'h-8 text-[13px] rounded-[8px] px-2.5 bg-white border border-[#dadce0] outline-none focus:border-[#202124] disabled:opacity-60 disabled:bg-[#f8f9fa] text-[#202124]'
const label = 'text-[12.5px]'

function RateTableEditor({ rt, setRt, disabled }: { rt: RateTable; setRt: (rt: RateTable) => void; disabled: boolean }) {
  const up = (patch: Partial<RateTable>) => setRt({ ...rt, ...patch })
  const upRules = (patch: Partial<RateTable['rules']>) => up({ rules: { ...rt.rules, ...patch } })
  const upCov = (i: number, patch: Partial<Coverage>) => { const cs = [...rt.coverages]; cs[i] = { ...cs[i], ...patch }; up({ coverages: cs }) }
  const addCoverage = () => up({ coverages: [...rt.coverages, { code: 'NEW', full_name: 'New coverage', plans: [{ code: 'Plan 1', label: 'Plan 1' }], age_bands: ['0-99'], rates: [{ band: '0-99', by_plan: {} }] }] })
  const removeCoverage = (i: number) => up({ coverages: rt.coverages.filter((_, j) => j !== i) })

  return (
    <section className={`${card} p-5 flex flex-col gap-5 min-w-0`}>
      <h2 className={h2}>Rate table and rules<Tip text="Every number a quote uses." /></h2>

      <div className="flex flex-wrap items-center gap-5">
        <label className={`${label} flex items-center gap-2`} style={{ color: MUTED }}>Age basis
          <select value={rt.age_basis ?? ''} onChange={e => up({ age_basis: (e.target.value || null) as RateTable['age_basis'] })} disabled={disabled} className={`${txtInput} w-36`}>
            <option value="">—</option><option value="ANB">Next birthday</option><option value="ALB">Last birthday</option>
          </select>
        </label>
        <label className="text-[13.5px] flex items-center gap-2 cursor-pointer" style={{ color: '#3c4043' }}>
          <input type="checkbox" className="w-4 h-4 accent-[#202124]" checked={!!rt.rules.gst?.inclusive} disabled={disabled} onChange={e => upRules({ gst: { inclusive: e.target.checked, rate: rt.rules.gst?.rate ?? 0.09 } })} /> Rates include GST
        </label>
        {rt.rules.gst?.inclusive && (
          <label className={`${label} flex items-center gap-2`} style={{ color: MUTED }}>GST rate <input type="number" step="0.01" value={rt.rules.gst?.rate ?? 0.09} disabled={disabled} onChange={e => upRules({ gst: { inclusive: true, rate: +e.target.value } })} className={colInput} /></label>
        )}
      </div>

      <LoadingBandsEditor rt={rt} upRules={upRules} disabled={disabled} />

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Coverages</p>
          {!disabled && <Btn size="xs" level="tertiary" onClick={addCoverage}><Plus size={11} /> Add coverage</Btn>}
        </div>
        <div className="flex flex-col gap-4">
          {rt.coverages.map((c, i) => (
            <CoverageEditor key={i} cov={c} onChange={p => upCov(i, p)} onRemove={() => removeCoverage(i)} disabled={disabled} />
          ))}
          {rt.coverages.length === 0 && <Empty compact>No coverages yet.</Empty>}
        </div>
      </div>
    </section>
  )
}

function LoadingBandsEditor({ rt, upRules, disabled }: { rt: RateTable; upRules: (p: Partial<RateTable['rules']>) => void; disabled: boolean }) {
  const bands = rt.rules.group_size_loading ?? []
  const setBands = (b: typeof bands) => upRules({ group_size_loading: b })
  const excludes = new Set(rt.rules.loading_excludes ?? [])
  const codes = Array.from(new Set(rt.coverages.map(c => c.code)))

  return (
    <div>
      <p className="m-0 mb-2 text-[12.5px] flex items-center" style={{ color: MUTED }}>Group-size loading<Tip text="Headcount band to percentage adjustment." /></p>
      <div className="flex flex-col gap-2">
        {bands.map((b, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px] flex-wrap" style={{ color: MUTED }}>
            <input type="number" value={b.min} disabled={disabled} aria-label="From lives" onChange={e => setBands(bands.map((x, j) => j === i ? { ...x, min: +e.target.value } : x))} className={`${colInput} w-16`} />
            <span>to</span>
            <input type="number" value={b.max ?? ''} placeholder="∞" disabled={disabled} aria-label="To lives" onChange={e => setBands(bands.map((x, j) => j === i ? { ...x, max: e.target.value === '' ? null : +e.target.value } : x))} className={`${colInput} w-16`} />
            <span>lives</span>
            <input type="number" value={b.loading_pct} disabled={disabled} aria-label="Loading percent" onChange={e => setBands(bands.map((x, j) => j === i ? { ...x, loading_pct: +e.target.value } : x))} className={`${colInput} w-20`} />
            <span>%</span>
            {!disabled && <button type="button" onClick={() => setBands(bands.filter((_, j) => j !== i))} aria-label="Remove band" className={iconBtn} style={{ color: MUTED }}><Trash2 size={13} /></button>}
          </div>
        ))}
        {bands.length === 0 && <p className="m-0 text-[13px]" style={{ color: MUTED }}>No loading bands.</p>}
        {!disabled && <Btn size="xs" level="tertiary" onClick={() => setBands([...bands, { min: 1, max: null, loading_pct: 0 }])} className="self-start"><Plus size={11} /> Add band</Btn>}
      </div>
      {codes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px]" style={{ color: MUTED }}>Excluded from loading</span>
          {codes.map(code => {
            const on = excludes.has(code)
            return (
              <label key={code} className="inline-flex items-center h-7 px-2.5 rounded-[6px] text-[12px] font-medium cursor-pointer select-none border" style={{ background: on ? '#ffffff' : '#f1f3f4', borderColor: on ? INK : 'transparent', color: on ? INK : '#3c4043' }}>
                <input type="checkbox" className="sr-only" disabled={disabled} checked={on}
                  onChange={e => { const s = new Set(excludes); e.target.checked ? s.add(code) : s.delete(code); upRules({ loading_excludes: Array.from(s) }) }} />
                {code}{on ? ' · excluded' : ''}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Member-type header tone for the rate matrix: dependant matrices get the grey header,
 *  everything else the ink employee header (globals.css .mt-employee / .mt-dependant). */
const isDependant = (memberType?: string | null) => /depend|spouse|child/i.test(memberType ?? '')

function CoverageEditor({ cov, onChange, onRemove, disabled }: { cov: Coverage; onChange: (p: Partial<Coverage>) => void; onRemove: () => void; disabled: boolean }) {
  const setPlans = (plans: RatePlan[]) => onChange({ plans })
  const addPlan = () => setPlans([...cov.plans, { code: `Plan ${cov.plans.length + 1}`, label: `Plan ${cov.plans.length + 1}` }])
  const removePlan = (code: string) => setPlans(cov.plans.filter(p => p.code !== code))
  const addBand = () => onChange({ rates: [...cov.rates, { band: '', by_plan: {} }] })
  const removeBand = (i: number) => onChange({ rates: cov.rates.filter((_, j) => j !== i) })
  const setRate = (ri: number, planCode: string, raw: string) => {
    const rates = [...cov.rates]
    const v: number | string | undefined = raw.trim() === '' ? undefined : (isNaN(Number(raw)) ? raw : Number(raw))
    rates[ri] = { ...rates[ri], by_plan: { ...rates[ri].by_plan, [planCode]: v as number } }
    onChange({ rates })
  }
  const setBand = (ri: number, band: string) => { const rates = [...cov.rates]; rates[ri] = { ...rates[ri], band }; onChange({ rates }) }
  const dep = isDependant(cov.member_type)
  const hdrInput = 'h-7 w-24 text-right text-[12px] font-medium bg-transparent border-0 border-b px-1 outline-none disabled:opacity-70'
  const hdrColor = dep ? INK : '#ffffff'
  const hdrRule = dep ? 'rgba(32,33,36,0.35)' : 'rgba(255,255,255,0.45)'

  return (
    <div className={`${card} p-4 min-w-0`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input value={cov.code} onChange={e => onChange({ code: e.target.value.toUpperCase() })} disabled={disabled} aria-label="Coverage code" className={`${txtInput} w-24 font-mono`} placeholder="CODE" />
        <input value={cov.full_name} onChange={e => onChange({ full_name: e.target.value })} disabled={disabled} aria-label="Coverage name" className={`${txtInput} flex-1 min-w-[160px]`} placeholder="Full name" />
        <input value={cov.member_type ?? ''} onChange={e => onChange({ member_type: e.target.value || undefined })} disabled={disabled} aria-label="Member type" className={`${txtInput} w-36`} placeholder="Member type" />
        {!disabled && <button type="button" onClick={onRemove} aria-label="Remove coverage" className={iconBtn} style={{ color: MUTED }}><Trash2 size={14} /></button>}
      </div>

      <div className="overflow-x-auto rounded-[12px]" style={{ border: `1px solid ${RULE}` }}>
        <table className="data-table matrix-table w-full border-collapse text-[13px]">
          <thead className={dep ? 'mt-dependant' : 'mt-employee'}>
            <tr>
              <th className="text-left">Age band</th>
              {cov.plans.map(p => (
                <th key={p.code} className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <input value={p.label} disabled={disabled} aria-label="Plan label" onChange={e => setPlans(cov.plans.map(x => x.code === p.code ? { ...x, label: e.target.value } : x))} className={hdrInput} style={{ color: hdrColor, borderBottomColor: hdrRule }} />
                    {!disabled && <button type="button" onClick={() => removePlan(p.code)} aria-label={`Remove ${p.label}`} className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer opacity-70 hover:opacity-100" style={{ color: hdrColor }}><Trash2 size={11} /></button>}
                  </span>
                </th>
              ))}
              {!disabled && <th className="text-right"><button type="button" onClick={addPlan} className="inline-flex items-center gap-1 text-[12px] font-medium bg-transparent border-0 cursor-pointer opacity-80 hover:opacity-100" style={{ color: hdrColor }}><Plus size={11} /> Plan</button></th>}
            </tr>
          </thead>
          <tbody>
            {cov.rates.map((r, ri) => (
              <tr key={ri}>
                <td><input value={r.band} disabled={disabled} aria-label="Age band" onChange={e => setBand(ri, e.target.value)} className={`${txtInput} w-24`} placeholder="0-25" /></td>
                {cov.plans.map(p => (
                  <td key={p.code} className="text-right">
                    <input value={r.by_plan?.[p.code] ?? ''} disabled={disabled} aria-label={`${p.label} rate for ${r.band || 'band'}`} onChange={e => setRate(ri, p.code, e.target.value)} className={colInput} placeholder="—" />
                  </td>
                ))}
                {!disabled && <td className="text-right"><button type="button" onClick={() => removeBand(ri)} aria-label="Remove age band" className={iconBtn} style={{ color: MUTED }}><Trash2 size={12} /></button></td>}
              </tr>
            ))}
            {cov.rates.length === 0 && <tr><td colSpan={cov.plans.length + 2} className="text-[13px]" style={{ color: MUTED }}>No age bands.</td></tr>}
          </tbody>
        </table>
      </div>
      {!disabled && <Btn size="xs" level="tertiary" onClick={addBand} className="mt-2"><Plus size={11} /> Add age band</Btn>}
    </div>
  )
}

// ── Step 3 — coverage / benefit terms (Level 2 comparison data) ─────────────────
const normText = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const POLICY_COL = '__policy__'

/** Benefit terms rendered as an actual table — one row per benefit line, one column per plan tier
 *  (matching how every brochure actually presents this), instead of a flat list of individually-
 *  flagged cards. Grouping is purely presentational: the underlying data is still just BenefitTerm[]
 *  (see pm-benefits-extract.ts) — a table cell maps 1:1 to one term keyed by (category, label, plan_code). */
function BenefitTermsEditor({ terms, setTerms, rt, disabled }: { terms: BenefitTerm[]; setTerms: (t: BenefitTerm[]) => void; rt: RateTable; disabled: boolean }) {
  const cols = useMemo(() => {
    const seen = new Map<string, string>()
    for (const cov of rt.coverages ?? []) for (const p of cov.plans ?? []) if (!seen.has(p.code)) seen.set(p.code, p.label || p.code)
    return [...Array.from(seen, ([code, label]) => ({ code, label })), { code: POLICY_COL, label: 'Policy-wide' }]
  }, [rt])

  const rows = useMemo(() => {
    const order: string[] = []
    const byKey = new Map<string, { category: string; label: string; cells: Map<string, number> }>()
    terms.forEach((t, i) => {
      const k = `${normText(t.category)}|${normText(t.label)}`
      let row = byKey.get(k)
      if (!row) { row = { category: t.category, label: t.label, cells: new Map() }; byKey.set(k, row); order.push(k) }
      const col = t.plan_code || POLICY_COL
      if (!row.cells.has(col)) row.cells.set(col, i)
    })
    return order.map(k => byKey.get(k)!)
  }, [terms])

  function setCell(category: string, label: string, col: string, value: string) {
    const idx = terms.findIndex(t => normText(t.category) === normText(category) && normText(t.label) === normText(label) && (t.plan_code || POLICY_COL) === col)
    if (idx >= 0) {
      if (!value.trim()) { setTerms(terms.filter((_, j) => j !== idx)); return }
      const copy = [...terms]; copy[idx] = { ...copy[idx], value }; setTerms(copy)
    } else if (value.trim()) {
      setTerms([...terms, { category, label, value, plan_code: col === POLICY_COL ? undefined : col, source: 'pdf' }])
    }
  }
  function renameRow(category: string, label: string, newCategory: string, newLabel: string) {
    setTerms(terms.map(t => (normText(t.category) === normText(category) && normText(t.label) === normText(label)) ? { ...t, category: newCategory, label: newLabel } : t))
  }
  function removeRow(category: string, label: string) {
    setTerms(terms.filter(t => !(normText(t.category) === normText(category) && normText(t.label) === normText(label))))
  }

  const [newCat, setNewCat] = useState(''); const [newLabel, setNewLabel] = useState('')
  function addRow() {
    if (!newCat.trim() || !newLabel.trim()) return
    setTerms([...terms, { category: newCat.trim(), label: newLabel.trim(), value: '', source: 'pdf' }])
    setNewCat(''); setNewLabel('')
  }

  const inferredCount = terms.filter(t => t.plan_code_inferred).length
  const cellCls = (inferred?: boolean) => `${txtInput} w-full ${inferred ? 'border-dashed' : ''}`

  return (
    <section className={`${card} p-5 flex flex-col gap-4 min-w-0`}>
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className={h2}>Coverage terms<Tip text="One row per benefit, one column per plan. A dashed cell means the plan tier was inferred, not read." /></h2>
        {inferredCount > 0 && <Chip>{inferredCount} inferred</Chip>}
      </header>
      {terms.length === 0 ? (
        <Empty compact>No coverage terms yet. Extract reads them from the brochure.</Empty>
      ) : (
        <div className="overflow-auto max-h-[560px] rounded-[12px]" style={{ border: `1px solid ${RULE}` }}>
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="text-left sticky top-0 bg-white z-10" style={{ boxShadow: `inset 0 -1px 0 ${RULE}` }}>
                <th className="py-2.5 px-3 text-[12px] font-medium min-w-[220px]" style={{ color: MUTED }}>Benefit</th>
                {cols.map(c => <th key={c.code} className="py-2.5 px-2 text-[12px] font-medium min-w-[130px]" style={{ color: MUTED }}>{c.label}</th>)}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${RULE}` }}>
                  <td className="py-2 px-3 align-top">
                    <input value={row.category} disabled={disabled} aria-label="Category" onChange={e => renameRow(row.category, row.label, e.target.value, row.label)} className={`${txtInput} w-full mb-1`} placeholder="Category" />
                    <input value={row.label} disabled={disabled} aria-label="Benefit" onChange={e => renameRow(row.category, row.label, row.category, e.target.value)} className={`${txtInput} w-full`} placeholder="Benefit" />
                  </td>
                  {cols.map(c => {
                    const idx = row.cells.get(c.code)
                    const t = idx !== undefined ? terms[idx] : undefined
                    return (
                      <td key={c.code} className="py-2 px-2 align-top">
                        <input value={t?.value ?? ''} disabled={disabled} aria-label={`${row.label} · ${c.label}`} onChange={e => setCell(row.category, row.label, c.code, e.target.value)}
                          title={t?.plan_code_inferred ? 'Plan tier inferred by the AI, not stated in the source. Check it.' : undefined}
                          className={cellCls(t?.plan_code_inferred)} placeholder="—" />
                      </td>
                    )
                  })}
                  <td className="align-top py-2 pr-2">{!disabled && <button type="button" onClick={() => removeRow(row.category, row.label)} aria-label="Remove row" className={iconBtn} style={{ color: MUTED }}><Trash2 size={12} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!disabled && (
        <div className="flex items-center gap-2 pt-3 flex-wrap" style={{ borderTop: `1px solid ${RULE}` }}>
          <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Category" aria-label="New category" className={`${txtInput} w-40`} />
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Benefit label" aria-label="New benefit label" className={`${txtInput} flex-1 min-w-[160px]`} />
          <Btn size="xs" level="tertiary" onClick={addRow} disabled={!newCat.trim() || !newLabel.trim()}><Plus size={11} /> Add row</Btn>
        </div>
      )}
    </section>
  )
}

// ── Workbook reference — pick any sheet to inspect its cells ─────────────────────────
function WorkbookSummary({ dump }: { dump: Dump | null }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!dump) return null
  const sheet = open ?? dump.sheets?.[0]?.name ?? ''
  const values = dump.values?.[sheet]
  return (
    <section className={`${card} p-5 min-w-0`}>
      <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className={h2}>Workbook</h2>
        <Chip>{dump.sheets.length} sheet{dump.sheets.length === 1 ? '' : 's'}</Chip>
      </header>
      <Segmented<string>
        value={sheet}
        onChange={setOpen}
        options={dump.sheets.map(s => ({ value: s.name, label: s.visible ? s.name : `${s.name} (hidden)` }))}
        className="mb-4 max-w-full"
      />
      {values ? <SheetGrid values={values} /> : <Empty compact>No cell values captured for this sheet.</Empty>}
    </section>
  )
}

/** Render a sheet's cells as a compact spreadsheet grid (columns A.. × rows), scrollable. */
function SheetGrid({ values }: { values: Record<string, string> }) {
  const cells = Object.entries(values).filter(([k]) => k !== '_truncated')
  const parse = (ref: string) => { const m = ref.match(/^([A-Z]+)(\d+)$/); return m ? { col: m[1], row: +m[2] } : null }
  const cols: string[] = []; let maxRow = 0
  const map: Record<number, Record<string, string>> = {}
  for (const [ref, v] of cells) {
    const p = parse(ref); if (!p) continue
    if (!cols.includes(p.col)) cols.push(p.col)
    maxRow = Math.max(maxRow, p.row);(map[p.row] ??= {})[p.col] = v
  }
  cols.sort((a, b) => (a.length - b.length) || a.localeCompare(b))
  const rows = Object.keys(map).map(Number).sort((a, b) => a - b).slice(0, 200)
  const cell = 'px-2 py-1 whitespace-nowrap'
  return (
    <div className="overflow-auto max-h-[480px] rounded-[12px]" style={{ border: `1px solid ${RULE}` }}>
      <table className="text-[12px] border-collapse" style={{ color: '#3c4043' }}>
        <thead className="sticky top-0 z-10" style={{ background: '#f8f9fa' }}>
          <tr><th className={cell} style={{ border: `1px solid ${RULE}` }}></th>{cols.map(c => <th key={c} className={`${cell} font-mono font-normal`} style={{ border: `1px solid ${RULE}`, color: MUTED }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(rn => (
            <tr key={rn}>
              <td className={`${cell} sticky left-0 tabular-nums`} style={{ border: `1px solid ${RULE}`, background: '#f8f9fa', color: MUTED }}>{rn}</td>
              {cols.map(c => <td key={c} className={`${cell} max-w-[180px] truncate`} style={{ border: `1px solid ${RULE}` }} title={map[rn]?.[c] ?? ''}>{map[rn]?.[c] ?? ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Worked example — computed locally, instantly, by pm-calc.ts (no network call) ──
function WorkedExample({ rt, defaultEff }: { rt: RateTable; defaultEff: string | null }) {
  const codes = Array.from(new Set(rt.coverages.map(c => c.code)))
  const [age, setAge] = useState(40)
  const [relationship, setRelationship] = useState<'Self' | 'Spouse' | 'Child'>('Self')
  const [sel, setSel] = useState<Record<string, string>>(() => Object.fromEntries(codes.map(c => [c, rt.coverages.find(cc => cc.code === c)?.plans[0]?.code ?? ''])))

  const selection = Object.fromEntries(codes.filter(c => sel[c]).map(c => [c, { plan: sel[c] }]))
  const result: InsurerResult = computeInsurerQuote('preview', 'preview', defaultEff, rt, [{ name: 'Example', age, relationship }], selection, { effective_date: defaultEff })
  const m = result.members[0]

  return (
    <section className={`${card} p-5 flex flex-col gap-4 min-w-0`}>
      <h2 className={h2}>Worked example<Tip text="Computed by pm-calc from the rate table and rules. Identical to a real quote, no network call." /></h2>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="block text-[12.5px] mb-1.5" style={{ color: MUTED }}>Age</span>
            <input type="number" value={age} onChange={e => setAge(+e.target.value)} className={inputCls} />
          </label>
          <label className="block min-w-0">
            <span className="block text-[12.5px] mb-1.5" style={{ color: MUTED }}>Relationship</span>
            <select value={relationship} onChange={e => setRelationship(e.target.value as 'Self' | 'Spouse' | 'Child')} className={inputCls}>
              <option>Self</option><option>Spouse</option><option>Child</option>
            </select>
          </label>
        </div>
        {codes.map(code => (
          <label key={code} className="block min-w-0">
            <span className="block text-[12.5px] mb-1.5" style={{ color: MUTED }}>{code}</span>
            <select value={sel[code] ?? ''} onChange={e => setSel(s => ({ ...s, [code]: e.target.value }))} className={inputCls}>
              <option value="">Not selected</option>
              {Array.from(new Set(rt.coverages.filter(c => c.code === code).flatMap(c => c.plans))).map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      {m && (
        <dl className="m-0 pt-3 flex flex-col" style={{ borderTop: `1px solid ${RULE}` }}>
          {codes.filter(c => typeof m.lines[c] === 'number').map(c => (
            <div key={c} className="flex items-center justify-between py-1.5 text-[14px]">
              <dt style={{ color: MUTED }}>{c}</dt>
              <dd className="m-0 tabular-nums" style={{ color: INK }}>{m.lines[c]?.toFixed(2)}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2.5 mt-1 text-[14px]" style={{ borderTop: `1px solid ${RULE}` }}>
            <dt className="font-medium">Premium</dt>
            <dd className="m-0 tabular-nums text-[18px] font-medium" style={{ color: INK }}>{m.subtotal.toFixed(2)}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}
