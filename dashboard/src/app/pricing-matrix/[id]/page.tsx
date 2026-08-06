'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Wand2, Save, CheckCircle2, Plus, Trash2, FileSpreadsheet, AlertTriangle, Table2, ArrowRight, Pencil, ListChecks } from 'lucide-react'
import type { RateTable, Coverage, RatePlan, ReconciliationIssue } from '@/lib/pm-rates'
import { runnableIssues, rateTableIsRunnable, EMPTY_RATE_TABLE } from '@/lib/pm-rates'
import type { RuleConflict } from '@/lib/pm-rates-extract'
import type { BenefitTerm, TermConflict } from '@/lib/pm-benefits-extract'
import { computeInsurerQuote } from '@/lib/pm-calc'
import type { InsurerResult } from '@/lib/pm-quote'

/** Card surface — white cards with a subtle border + shadow so they read on the white page. */
const card = 'bg-white border border-slate-100 rounded-xl shadow-sm'

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
}

/** A reconciliation issue joined with its live value shape, so resolving it can both mutate the
 *  in-memory rate table/terms (as before) AND persist the decision (who/when) via the new endpoint. */
type RuleIssue = RuleConflict & { issueId: string }
type TermIssue = TermConflict & { issueId: string }

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

  const runExtract = useCallback(async () => {
    // Two phases (rate table, then benefit terms) called in sequence — split out of one long
    // request because a single call covering both AI passes could exceed the platform's actual
    // function timeout on a slow/complex workbook, coming back as a bare gateway 504 with no
    // useful error. Each phase is its own independent AI pass, so splitting them roughly halves
    // what any one request has to finish within.
    setExtracting(true); setError(null); setProgress({ label: 'Starting…', step: 0, total: 5 })
    const poll = setInterval(async () => {
      const s = await fetch(`/api/pricing-matrix/calculators/${id}/map-status`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
      if (s?.map_progress) setProgress(s.map_progress)
    }, 1800)
    try {
      const r1 = await fetch(`/api/pricing-matrix/calculators/${id}/extract/rates`, { method: 'POST' })
      const d1 = await safeJson<{ error?: string }>(r1)
      if (!r1.ok) { setError(d1.error ?? 'Rate extraction failed'); return }

      const r2 = await fetch(`/api/pricing-matrix/calculators/${id}/extract/terms`, { method: 'POST' })
      const d2 = await safeJson<{ error?: string }>(r2)
      if (!r2.ok) setError(d2.error ?? 'Coverage-term extraction failed')
    } finally { clearInterval(poll); setExtracting(false); setProgress(null); await load() }
  }, [id, load])

  useEffect(() => { load() }, [load])
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

  if (loading) return <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-24 justify-center"><Loader2 size={15} className="animate-spin" /> Loading…</div>
  if (!calc) return <div className="p-8 text-sm text-rose-600">Not found.</div>

  const issues = runnableIssues(rt)
  const runnable = rateTableIsRunnable(rt)
  const approved = calc.status === 'approved'
  const openItems = ruleConflicts.length + termConflicts.length

  const statusStyle: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600', extracting: 'bg-amber-100 text-amber-700',
    in_review: 'bg-indigo-100 text-indigo-700', approved: 'bg-emerald-100 text-emerald-700', archived: 'bg-slate-100 text-slate-400',
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-500 hover:text-slate-900 mb-3"><ArrowLeft size={14} /> Pricing Matrix</Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {editingName ? (
              <input autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)}
                onBlur={() => { setEditingName(false); const v = nameDraft.trim(); if (v && v !== (calc.insurer_name ?? '')) patchMeta({ insurer_name: v }) }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingName(false) }}
                placeholder="Insurer name" className="text-[19px] font-semibold text-slate-900 bg-slate-50 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary/25 min-w-[220px]" />
            ) : (
              <span className="flex items-center gap-1.5 min-w-0">
                <h1 className={`text-[19px] font-semibold truncate ${calc.insurer_name ? 'text-slate-900' : 'text-slate-400 italic'}`}>{calc.insurer_name || calc.label || 'Untitled calculator'}</h1>
                {!approved && <button onClick={() => { setNameDraft(calc.insurer_name ?? ''); setEditingName(true) }} title="Rename insurer" className="text-slate-300 hover:text-slate-600 shrink-0"><Pencil size={13} /></button>}
              </span>
            )}
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${statusStyle[calc.status] ?? 'bg-slate-100 text-slate-500'}`}>{calc.status.replace('_', ' ')}</span>
            <span className="text-[11px] text-slate-400 shrink-0">v{calc.version}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11.5px] text-slate-500">
            <span className="inline-flex items-center gap-1"><FileSpreadsheet size={12} className="text-emerald-600/70" />{calc.xlsx_filename}</span>
            {calc.brochure_filename && <span className="text-slate-300">·</span>}
            {calc.brochure_filename && <span>{calc.brochure_filename}</span>}
            <span className="text-slate-300">·</span>
            {approved ? (
              calc.effective_date ? <span>eff. {calc.effective_date}</span> : null
            ) : (
              <span className="inline-flex items-center gap-1">eff. <input type="date" value={calc.effective_date ?? ''} onChange={e => patchMeta({ effective_date: e.target.value || null })} className="bg-slate-50 rounded px-1.5 py-0.5 text-[11.5px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/25" /></span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => { if (rt && !window.confirm('Re-extracting replaces the current rate table, rules, and coverage terms with a fresh AI proposal. Continue?')) return; runExtract() }} disabled={extracting} className="flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg border border-slate-100 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {extracting ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}{rt ? 'Re-extract' : 'Extract'}
          </button>
          {!approved && <button onClick={save} disabled={saving || !rt} className="flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg border border-slate-100 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Save size={14} /> Save</button>}
          {!approved && <button onClick={approve} disabled={saving || !runnable || openItems > 0} title={openItems > 0 ? `Resolve ${openItems} flagged item${openItems === 1 ? '' : 's'} first` : (!runnable ? issues[0] : '')} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 size={14} /> Approve{openItems > 0 ? ` · ${openItems} left` : ''}</button>}
        </div>
      </div>

      {error && <div className="mb-4 text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
      {extracting && (
        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
          <div className="flex items-center gap-2 text-[12.5px] text-indigo-800 mb-2">
            <Loader2 size={14} className="animate-spin" />
            <span className="font-medium">{progress?.label ?? 'Reading the workbook…'}</span>
            <span className="ml-auto text-indigo-400 tabular-nums">{progress ? `${Math.min(progress.step, progress.total)} / ${progress.total}` : ''}</span>
          </div>
          <div className="h-1.5 rounded-full bg-indigo-100 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress ? Math.round((Math.min(progress.step, progress.total) / progress.total) * 100) : 8}%` }} />
          </div>
          <p className="text-[10.5px] text-indigo-400 mt-1.5">Two models read the rates, rules and coverage terms independently, cross-checking the xlsx and the brochure.</p>
        </div>
      )}

      {!rt && !extracting && (
        <div className="text-center text-slate-500 py-16 border border-dashed border-slate-100 rounded-xl bg-slate-50/50">
          <Wand2 size={24} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm">No rate table yet. Click <b>Extract</b> to have the AI read the workbook and brochure.</p>
          <button onClick={() => setRt({ ...EMPTY_RATE_TABLE, calculator_id: id })} className="mt-3 text-[12px] text-primary hover:underline">or set one up manually</button>
        </div>
      )}

      {approved && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] text-emerald-800"><CheckCircle2 size={16} /> Approved &amp; saved. This insurer is now available to quote and compare.</div>
          <Link href="/pricing-matrix/quote/new" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Add employees &amp; quote <ArrowRight size={14} /></Link>
        </div>
      )}

      {approved && calc.analysis_summary && (
        <div className="mb-5 flex flex-col gap-2">
          <div className={card + ' p-4'}>
            <h2 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">How this calculator prices</h2>
            <p className="text-[12.5px] text-slate-700 leading-relaxed">{calc.analysis_summary}</p>
          </div>
          {calc.change_summary?.text && (
            <div className={card + ' p-4 border-indigo-100'}>
              <h2 className="text-[12px] font-semibold text-indigo-500 uppercase tracking-wide mb-1.5">Changed since the previous approved version</h2>
              <p className="text-[12.5px] text-slate-700 leading-relaxed">{calc.change_summary.text}</p>
            </div>
          )}
        </div>
      )}

      {rt && (
        <div className="flex flex-col gap-5">
          {/* 1 — Flagged items + readiness. */}
          <ReviewPanel issues={issues} ruleConflicts={ruleConflicts} termConflicts={termConflicts} onResolveRule={resolveRule} onDismissRule={dismissRule} onResolveTerm={resolveTerm} disabled={approved} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* 2 — Rate table + rules. */}
            <div className="flex flex-col gap-5">
              <RateTableEditor rt={rt} setRt={setRt} disabled={approved} />
              <BenefitTermsEditor terms={terms} setTerms={setTerms} disabled={approved} />
              <WorkbookSummary dump={calc.workbook_summary} />
            </div>
            {/* 3 — Worked example, computed locally by pm-calc.ts. */}
            <div className="flex flex-col gap-5">
              <WorkedExample rt={rt} defaultEff={calc.effective_date} />
            </div>
          </div>
        </div>
      )}
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
  const allDone = ruleConflicts.length === 0 && termConflicts.length === 0
  return (
    <section className={card + ' p-4'}>
      <div className="flex items-center gap-2 mb-3">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">1</span>
        <h2 className="text-[13px] font-semibold text-slate-800">Review <span className="font-normal text-slate-400">— resolve flagged items, then approve</span></h2>
      </div>

      {issues.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-800 mb-1"><AlertTriangle size={13} /> Not ready to approve yet</div>
          <ul className="text-[12px] text-amber-800 list-disc list-inside">{issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}

      {ruleConflicts.length === 0 && termConflicts.length === 0 ? (
        <div className="flex items-center gap-2 text-[12.5px] text-emerald-700 py-1"><CheckCircle2 size={15} /> {allDone ? 'No flagged disagreements — Opus and Gemini agreed on everything.' : ''}</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {ruleConflicts.map((c, i) => (
            <div key={`r${i}`} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
              <div className="flex items-start gap-1.5 text-[12.5px] text-slate-800 font-medium mb-1.5"><ListChecks size={13} className="mt-0.5 text-rose-500 shrink-0" />Rule "{c.field}" — Opus and Gemini disagree</div>
              <div className="flex flex-wrap gap-2 pl-5">
                <button disabled={disabled} onClick={() => onResolveRule(c, c.opus)} className="text-[11.5px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-white">Use Opus: {JSON.stringify(c.opus)}</button>
                <button disabled={disabled} onClick={() => onResolveRule(c, c.gemini)} className="text-[11.5px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-white">Use Gemini: {JSON.stringify(c.gemini)}</button>
                <button disabled={disabled} onClick={() => onDismissRule(c)} className="text-[11.5px] text-slate-400 hover:text-slate-600">I&rsquo;ve edited it below, dismiss</button>
              </div>
            </div>
          ))}
          {termConflicts.map((c, i) => (
            <div key={`t${i}`} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
              <div className="flex items-start gap-1.5 text-[12.5px] text-slate-800 font-medium mb-1.5"><ListChecks size={13} className="mt-0.5 text-amber-500 shrink-0" />{c.category} — {c.label} <span className="font-normal text-slate-400">({c.note})</span></div>
              <div className="flex flex-wrap gap-2 pl-5">
                {c.opus !== undefined && <button disabled={disabled} onClick={() => onResolveTerm(c, c.opus)} className="text-[11.5px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-white">Use: {c.opus}</button>}
                {c.gemini !== undefined && <button disabled={disabled} onClick={() => onResolveTerm(c, c.gemini)} className="text-[11.5px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-white">Use: {c.gemini}</button>}
                <button disabled={disabled} onClick={() => onResolveTerm(c, undefined)} className="text-[11.5px] text-rose-400 hover:text-rose-600">Remove this term</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Step 2 — rate table + insurer-specific pricing rules ────────────────────────
const colInput = 'w-16 text-[12px] text-right font-mono rounded px-1.5 py-0.5 bg-slate-50 border border-transparent hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white disabled:opacity-60'
const txtInput = 'text-[12px] rounded px-2 py-0.5 bg-slate-50 border border-transparent hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white disabled:opacity-60'
const chip = 'text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex items-center gap-1'

function RateTableEditor({ rt, setRt, disabled }: { rt: RateTable; setRt: (rt: RateTable) => void; disabled: boolean }) {
  const up = (patch: Partial<RateTable>) => setRt({ ...rt, ...patch })
  const upRules = (patch: Partial<RateTable['rules']>) => up({ rules: { ...rt.rules, ...patch } })
  const upCov = (i: number, patch: Partial<Coverage>) => { const cs = [...rt.coverages]; cs[i] = { ...cs[i], ...patch }; up({ coverages: cs }) }
  const addCoverage = () => up({ coverages: [...rt.coverages, { code: 'NEW', full_name: 'New coverage', plans: [{ code: 'Plan 1', label: 'Plan 1' }], age_bands: ['0-99'], rates: [{ band: '0-99', by_plan: {} }] }] })
  const removeCoverage = (i: number) => up({ coverages: rt.coverages.filter((_, j) => j !== i) })

  return (
    <section className={card + ' p-4 flex flex-col gap-4'}>
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">2</span>
        <h2 className="text-[13px] font-semibold text-slate-800">Rate table &amp; rules <span className="font-normal text-slate-400">— every number a quote will use</span></h2>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="text-[12px] flex items-center gap-1.5">Age basis
          <select value={rt.age_basis ?? ''} onChange={e => up({ age_basis: (e.target.value || null) as RateTable['age_basis'] })} disabled={disabled} className={`${txtInput} w-24`}>
            <option value="">—</option><option value="ANB">Next birthday</option><option value="ALB">Last birthday</option>
          </select>
        </label>
        <label className="text-[12px] flex items-center gap-1.5">
          <input type="checkbox" checked={!!rt.rules.gst?.inclusive} disabled={disabled} onChange={e => upRules({ gst: { inclusive: e.target.checked, rate: rt.rules.gst?.rate ?? 0.09 } })} /> Rates include GST
        </label>
        {rt.rules.gst?.inclusive && (
          <label className="text-[12px] flex items-center gap-1.5">rate <input type="number" step="0.01" value={rt.rules.gst?.rate ?? 0.09} disabled={disabled} onChange={e => upRules({ gst: { inclusive: true, rate: +e.target.value } })} className={`${colInput} w-16`} /></label>
        )}
      </div>

      <LoadingBandsEditor rt={rt} upRules={upRules} disabled={disabled} />

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/50">Coverages</p>
          {!disabled && <button onClick={addCoverage} className="text-[11px] text-primary flex items-center gap-1 hover:underline"><Plus size={11} /> add</button>}
        </div>
        <div className="flex flex-col gap-3">
          {rt.coverages.map((c, i) => (
            <CoverageEditor key={i} cov={c} onChange={p => upCov(i, p)} onRemove={() => removeCoverage(i)} disabled={disabled} />
          ))}
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
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/50 mb-1.5">Group-size loading <span className="normal-case text-muted-foreground/40">— headcount → % adjustment</span></p>
      <div className="flex flex-col gap-1.5">
        {bands.map((b, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[12px]">
            <input type="number" value={b.min} disabled={disabled} onChange={e => setBands(bands.map((x, j) => j === i ? { ...x, min: +e.target.value } : x))} className={`${colInput} w-14`} />
            <span className="text-muted-foreground/50">to</span>
            <input type="number" value={b.max ?? ''} placeholder="∞" disabled={disabled} onChange={e => setBands(bands.map((x, j) => j === i ? { ...x, max: e.target.value === '' ? null : +e.target.value } : x))} className={`${colInput} w-14`} />
            <span className="text-muted-foreground/50">lives →</span>
            <input type="number" value={b.loading_pct} disabled={disabled} onChange={e => setBands(bands.map((x, j) => j === i ? { ...x, loading_pct: +e.target.value } : x))} className={`${colInput} w-16`} />
            <span className="text-muted-foreground/50">%</span>
            {!disabled && <button onClick={() => setBands(bands.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600"><Trash2 size={12} /></button>}
          </div>
        ))}
        {!disabled && <button onClick={() => setBands([...bands, { min: 1, max: null, loading_pct: 0 }])} className="text-[11px] text-primary flex items-center gap-1 hover:underline self-start"><Plus size={10} /> add band</button>}
      </div>
      {codes.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground/60">excluded from loading:</span>
          {codes.map(code => (
            <label key={code} className={`${chip} cursor-pointer ${excludes.has(code) ? 'bg-rose-50 text-rose-600' : ''}`}>
              <input type="checkbox" className="hidden" disabled={disabled} checked={excludes.has(code)}
                onChange={e => { const s = new Set(excludes); e.target.checked ? s.add(code) : s.delete(code); upRules({ loading_excludes: Array.from(s) }) }} />
              {code}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

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

  return (
    <div className="border border-slate-100 rounded-lg p-2.5">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <input value={cov.code} onChange={e => onChange({ code: e.target.value.toUpperCase() })} disabled={disabled} className={`${txtInput} w-20 font-mono`} placeholder="CODE" />
        <input value={cov.full_name} onChange={e => onChange({ full_name: e.target.value })} disabled={disabled} className={`${txtInput} flex-1 min-w-[140px]`} placeholder="Full name" />
        <input value={cov.member_type ?? ''} onChange={e => onChange({ member_type: e.target.value || undefined })} disabled={disabled} className={`${txtInput} w-28`} placeholder="member type (opt.)" />
        {!disabled && <button onClick={onRemove} className="text-rose-400 hover:text-rose-600"><Trash2 size={13} /></button>}
      </div>

      <div className="overflow-x-auto">
        <table className="text-[11.5px] border-collapse w-full">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left py-1 pr-2 font-medium">Age band</th>
              {cov.plans.map(p => (
                <th key={p.code} className="text-right py-1 pr-2 font-medium">
                  <input value={p.label} disabled={disabled} onChange={e => setPlans(cov.plans.map(x => x.code === p.code ? { ...x, label: e.target.value } : x))} className={`${txtInput} w-20 text-right`} />
                  {!disabled && <button onClick={() => removePlan(p.code)} className="text-slate-300 hover:text-rose-500 ml-1"><Trash2 size={10} className="inline" /></button>}
                </th>
              ))}
              {!disabled && <th className="text-right py-1"><button onClick={addPlan} className="text-primary hover:underline text-[11px] flex items-center gap-0.5 ml-auto"><Plus size={10} /> plan</button></th>}
            </tr>
          </thead>
          <tbody>
            {cov.rates.map((r, ri) => (
              <tr key={ri} className="border-t border-slate-50">
                <td className="py-1 pr-2"><input value={r.band} disabled={disabled} onChange={e => setBand(ri, e.target.value)} className={`${txtInput} w-20`} placeholder="0-25" /></td>
                {cov.plans.map(p => (
                  <td key={p.code} className="py-1 pr-2 text-right">
                    <input value={r.by_plan?.[p.code] ?? ''} disabled={disabled} onChange={e => setRate(ri, p.code, e.target.value)} className={colInput} placeholder="—" />
                  </td>
                ))}
                {!disabled && <td className="text-right"><button onClick={() => removeBand(ri)} className="text-slate-300 hover:text-rose-500"><Trash2 size={11} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && <button onClick={addBand} className="mt-1.5 text-[11px] text-primary flex items-center gap-1 hover:underline"><Plus size={10} /> add age band</button>}
    </div>
  )
}

// ── Step 3 — coverage / benefit terms (Level 2 comparison data) ─────────────────
function BenefitTermsEditor({ terms, setTerms, disabled }: { terms: BenefitTerm[]; setTerms: (t: BenefitTerm[]) => void; disabled: boolean }) {
  const upTerm = (i: number, patch: Partial<BenefitTerm>) => { const t = [...terms]; t[i] = { ...t[i], ...patch }; setTerms(t) }
  const addTerm = () => setTerms([...terms, { category: '', label: '', value: '', source: 'pdf' }])
  const removeTerm = (i: number) => setTerms(terms.filter((_, j) => j !== i))

  return (
    <section className={card + ' p-4 flex flex-col gap-3'}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">3</span>
          <h2 className="text-[13px] font-semibold text-slate-800">Coverage terms <span className="font-normal text-slate-400">— what&rsquo;s actually covered, for comparison</span></h2>
        </div>
        {!disabled && <button onClick={addTerm} className="text-[11px] text-primary flex items-center gap-1 hover:underline"><Plus size={11} /> add</button>}
      </div>
      {terms.length === 0 ? (
        <p className="text-[12px] text-slate-400">No coverage terms yet — Extract reads them from the brochure.</p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-[420px] overflow-auto">
          {terms.some(t => t.plan_code_inferred) && (
            <p className="text-[10.5px] text-amber-700/80 -mt-1 mb-0.5">Amber plan field = the AI inferred which tier this applies to rather than reading it explicitly — worth a second look.</p>
          )}
          {terms.map((t, i) => (
            <div key={i} className="grid grid-cols-[70px_100px_1fr_1fr_20px] gap-1.5 items-center">
              <input value={t.plan_code ?? ''} disabled={disabled} onChange={e => upTerm(i, { plan_code: e.target.value || undefined })}
                title={t.plan_code_inferred ? 'Plan tier was inferred by the AI, not explicitly stated in the source — double-check this one' : undefined}
                className={`${txtInput} ${t.plan_code_inferred ? 'border-amber-300 bg-amber-50/60' : ''}`} placeholder="plan" />
              <input value={t.category} disabled={disabled} onChange={e => upTerm(i, { category: e.target.value })} className={txtInput} placeholder="category" />
              <input value={t.label} disabled={disabled} onChange={e => upTerm(i, { label: e.target.value })} className={txtInput} placeholder="label" />
              <input value={t.value} disabled={disabled} onChange={e => upTerm(i, { value: e.target.value })} className={txtInput} placeholder="value" />
              {!disabled && <button onClick={() => removeTerm(i)} className="text-slate-300 hover:text-rose-500"><Trash2 size={12} /></button>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Workbook reference — click any sheet to inspect its cells ─────────────────────────
function WorkbookSummary({ dump }: { dump: Dump | null }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!dump) return null
  const sheet = open ?? dump.sheets?.[0]?.name ?? ''
  const values = dump.values?.[sheet]
  return (
    <section className={card + ' p-4'}>
      <div className="flex items-center gap-2 mb-2">
        <Table2 size={14} className="text-slate-400" />
        <h2 className="text-[13px] font-semibold text-slate-800">Workbook <span className="font-normal text-slate-400">— click a sheet to inspect</span></h2>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {dump.sheets.map(s => (
          <button key={s.name} onClick={() => setOpen(s.name)}
            className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${s.name === sheet ? 'bg-primary/10 text-primary font-medium ring-1 ring-primary/20' : s.visible ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
            {s.name}{!s.visible ? ' (hidden)' : ''}
          </button>
        ))}
      </div>
      {values ? <SheetGrid values={values} /> : <p className="text-[11.5px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">No cell values captured for this sheet.</p>}
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
  return (
    <div className="overflow-auto max-h-[420px] border border-slate-100 rounded-md">
      <table className="text-[11px] border-collapse">
        <thead className="sticky top-0 bg-slate-50 z-10">
          <tr><th className="px-1.5 py-0.5 border border-slate-100 text-slate-300 font-normal"></th>{cols.map(c => <th key={c} className="px-1.5 py-0.5 border border-slate-100 font-mono text-slate-400 font-normal">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(rn => (
            <tr key={rn}>
              <td className="px-1.5 py-0.5 border border-slate-100 bg-slate-50 text-slate-400 sticky left-0 tabular-nums">{rn}</td>
              {cols.map(c => <td key={c} className="px-1.5 py-0.5 border border-slate-100 whitespace-nowrap max-w-[160px] truncate text-slate-600" title={map[rn]?.[c] ?? ''}>{map[rn]?.[c] ?? ''}</td>)}
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
    <section className={card + ' p-4 flex flex-col gap-3'}>
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">4</span>
        <h2 className="text-[13px] font-semibold text-slate-800">Worked example <span className="font-normal text-slate-400">— computed live from the table on the left</span></h2>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
        <label className="flex items-center gap-1">Age <input type="number" value={age} onChange={e => setAge(+e.target.value)} className="w-14 border border-slate-100 rounded px-1.5 py-0.5 bg-white" /></label>
        <label className="flex items-center gap-1">Relationship
          <select value={relationship} onChange={e => setRelationship(e.target.value as 'Self' | 'Spouse' | 'Child')} className="border border-slate-100 rounded px-1.5 py-0.5 bg-white">
            <option>Self</option><option>Spouse</option><option>Child</option>
          </select>
        </label>
        {codes.map(code => (
          <label key={code} className="flex items-center gap-1 text-slate-500">
            <span className="font-medium">{code}:</span>
            <select value={sel[code] ?? ''} onChange={e => setSel(s => ({ ...s, [code]: e.target.value }))} className="text-[11px] border border-slate-100 rounded px-1 py-0.5 bg-white">
              <option value="">— not selected —</option>
              {Array.from(new Set(rt.coverages.filter(c => c.code === code).flatMap(c => c.plans))).map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      {m && (
        <div className="border-t border-slate-100 pt-2 flex items-center gap-4 flex-wrap">
          {codes.filter(c => typeof m.lines[c] === 'number').map(c => (
            <span key={c} className="text-[11.5px] text-slate-600">{c} <b className="tabular-nums text-slate-800">{m.lines[c]?.toFixed(2)}</b></span>
          ))}
          <span className="text-[12px] text-slate-700 ml-auto">Premium <b className="tabular-nums text-primary text-[13px]">{m.subtotal.toFixed(2)}</b></span>
        </div>
      )}
      <p className="text-[10.5px] text-slate-400">Computed by pm-calc.ts from the rate table &amp; rules above — this is exactly what a real quote will compute, with no network call.</p>
    </section>
  )
}
