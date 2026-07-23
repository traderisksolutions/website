'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Wand2, Save, CheckCircle2, Play, Plus, Trash2, FileSpreadsheet, Lightbulb, Eye, Table2, ArrowRight, Check, ListChecks, Pencil } from 'lucide-react'
import type { CellMapProfile, CoverageLine, ReviewItem, ReviewOption } from '@/lib/pm-profile'
import { profileIsRunnable, deriveReviewItems, unresolvedReviewCount, applyProfilePath, resolveReviewItem } from '@/lib/pm-profile'
import type { Pricing } from '@/lib/pm-pricing'

/** Card surface — white cards with a subtle border + shadow so they read on the white page. */
const card = 'bg-white border border-slate-100 rounded-xl shadow-sm'

type Dump = {
  sheets: { name: string; state: string; visible: boolean; max_row: number; max_col: number }[]
  previews: Record<string, { top_rows: { row: number; cells: Record<string, string> }[] }>
  values?: Record<string, Record<string, string>>
}
type Calc = {
  id: string; insurer_name: string | null; label: string | null; status: string
  xlsx_filename: string | null; brochure_filename: string | null; effective_date: string | null; version: number
  profile: CellMapProfile | null; workbook_summary: Dump | null; pricing: Pricing | null
  verification: { at: string; members: RunMember[]; totals: RunTotals; warnings: string[] } | null
}
type RunMember = { row: number; name: string | null; lines: Record<string, number | null>; subtotal: number }
type RunTotals = { by_line: Record<string, number | null>; grand: number | null }

const MEMBER_FIELDS: (keyof NonNullable<CellMapProfile['member_inputs']>)[] =
  ['name', 'category', 'date_of_birth', 'policy_effective_date', 'policy_expiry_date', 'relationship', 'occupation_class']

async function safeJson<T>(r: Response): Promise<T & { error?: string }> {
  try { return await r.json() } catch { return { error: `HTTP ${r.status}` } as T & { error?: string } }
}

/** A real (mapped or manually-started) profile always has a coverage_lines array; the DB default
 *  is an empty {} which must be treated as "not mapped yet". */
function hasRealProfile(p: CellMapProfile | null | undefined): p is CellMapProfile {
  return !!p && Array.isArray((p as CellMapProfile).coverage_lines)
}

export default function CalculatorReviewPage() {
  const { id } = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const [calc, setCalc] = useState<Calc | null>(null)
  const [profile, setProfile] = useState<CellMapProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapping, setMapping] = useState(false)
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
    // The DB defaults profile to '{}'::jsonb; treat an un-mapped (no coverage_lines) profile as none.
    if (res.ok) { setCalc(row); setProfile(hasRealProfile(row.profile) ? row.profile : null) }
    setLoading(false)
    return row
  }, [id])

  const runMap = useCallback(async () => {
    setMapping(true); setError(null); setProgress({ label: 'Starting…', step: 0, total: 6 })
    // Poll the light status endpoint so the progress bar reflects the real ensemble steps.
    const poll = setInterval(async () => {
      const s = await fetch(`/api/pricing-matrix/calculators/${id}/map-status`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
      if (s?.map_progress) setProgress(s.map_progress)
    }, 1800)
    try {
      const res = await fetch(`/api/pricing-matrix/calculators/${id}/map`, { method: 'POST' })
      const d = await safeJson<{ profile?: CellMapProfile }>(res)
      if (!res.ok) setError(d.error ?? 'Mapping failed')
      await load()
    } finally { clearInterval(poll); setMapping(false); setProgress(null) }
  }, [id, load])

  useEffect(() => { load() }, [load])
  // Auto-map right after upload (a fresh calculator has an empty {} profile, not a real one).
  useEffect(() => {
    if (calc && calc.status === 'draft' && !hasRealProfile(calc.profile) && search.get('automap') === '1' && !mapping) {
      runMap()
      router.replace(`/pricing-matrix/${id}`)
    }
  }, [calc, search, mapping, runMap, router, id])

  function startBlank() {
    const sheets = calc?.workbook_summary?.sheets ?? []
    const guess = sheets.find(s => s.visible && !/table|diff/i.test(s.name))?.name ?? sheets.find(s => s.visible)?.name ?? ''
    setProfile({ sheet: guess, rows: { start: 0, end: 0 }, member_inputs: {}, coverage_lines: [{ code: '', label: '', inputs: { plan: '' }, output: '' }], totals: {}, date_serial: true })
  }

  async function saveProfile() {
    if (!profile) return
    setSaving(true); setError(null)
    const res = await fetch(`/api/pricing-matrix/calculators/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }) })
    if (!res.ok) setError((await safeJson<{ error?: string }>(res)).error ?? 'Save failed')
    await load(); setSaving(false)
  }

  async function approve() {
    setSaving(true); setError(null)
    const res = await fetch(`/api/pricing-matrix/calculators/${id}/approve`, { method: 'POST' })
    if (!res.ok) setError((await safeJson<{ error?: string }>(res)).error ?? 'Approve failed')
    await load(); setSaving(false)
  }

  if (loading) return <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-24 justify-center"><Loader2 size={15} className="animate-spin" /> Loading…</div>
  if (!calc) return <div className="p-8 text-sm text-rose-600">Not found.</div>

  const runnable = profileIsRunnable(profile)
  const approved = calc.status === 'approved'
  const openItems = unresolvedReviewCount(profile)

  // Column letter → header label for the driving sheet (for the resolve wizard's column picker).
  const columnLabels: Record<string, string> = {}
  const dsheet = profile?.sheet
  for (const r of (dsheet ? calc.workbook_summary?.previews?.[dsheet]?.top_rows ?? [] : [])) {
    for (const [col, val] of Object.entries(r.cells)) {
      if (!String(val).startsWith('=') && !columnLabels[col]) columnLabels[col] = String(val)
    }
  }

  const statusStyle: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600', mapping: 'bg-amber-100 text-amber-700',
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
          <button onClick={() => { if (hasRealProfile(calc.profile) && !window.confirm('Re-mapping replaces the current cell-map, your edits, and your resolved answers with a fresh AI proposal. Continue?')) return; runMap() }} disabled={mapping} className="flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg border border-slate-100 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {mapping ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}{hasRealProfile(calc.profile) ? 'Re-map' : 'Auto-map'}
          </button>
          {!approved && <button onClick={saveProfile} disabled={saving || !profile} className="flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg border border-slate-100 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Save size={14} /> Save</button>}
          {!approved && <button onClick={approve} disabled={saving || !runnable || openItems > 0} title={openItems > 0 ? `Resolve ${openItems} review item${openItems === 1 ? '' : 's'} first` : (!runnable ? 'Finish the cell-map first' : '')} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 size={14} /> Approve{openItems > 0 ? ` · ${openItems} left` : ''}</button>}
        </div>
      </div>

      {error && <div className="mb-4 text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
      {mapping && (
        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
          <div className="flex items-center gap-2 text-[12.5px] text-indigo-800 mb-2">
            <Loader2 size={14} className="animate-spin" />
            <span className="font-medium">{progress?.label ?? 'Reading the workbook…'}</span>
            <span className="ml-auto text-indigo-400 tabular-nums">{progress ? `${Math.min(progress.step, progress.total)} / ${progress.total}` : ''}</span>
          </div>
          <div className="h-1.5 rounded-full bg-indigo-100 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress ? Math.round((Math.min(progress.step, progress.total) / progress.total) * 100) : 8}%` }} />
          </div>
          <p className="text-[10.5px] text-indigo-400 mt-1.5">Two models read the rates independently; a judge reconciles any disagreement for dollar accuracy.</p>
        </div>
      )}

      {!profile && !mapping && (
        <div className="text-center text-slate-500 py-16 border border-dashed border-slate-100 rounded-xl bg-slate-50/50">
          <Wand2 size={24} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm">No cell-map yet. Click <b>Auto-map</b> to have the AI propose one from the workbook.</p>
          <button onClick={startBlank} className="mt-3 text-[12px] text-primary hover:underline">or set up the cell-map manually</button>
        </div>
      )}

      {approved && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] text-emerald-800"><CheckCircle2 size={16} /> Approved &amp; saved. This insurer is now available to quote.</div>
          <Link href="/pricing-matrix/quote/new" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Add employees &amp; quote <ArrowRight size={14} /></Link>
        </div>
      )}

      {profile && (
        <div className="flex flex-col gap-5">
          {/* 1 — What the AI understood + resolve its questions in place. */}
          <WorkbookAnalysis profile={profile} setProfile={setProfile} columnLabels={columnLabels} disabled={approved} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* 2 — Cell-map + workbook reference. */}
            <div className="flex flex-col gap-5">
              <ProfileEditor profile={profile} setProfile={setProfile} disabled={approved} />
              <WorkbookSummary dump={calc.workbook_summary} sheet={profile.sheet} />
            </div>
            {/* 3 — Pricing & maths (transparent rate tables + worked example). */}
            <div className="flex flex-col gap-5">
              <PricingPanel id={id} pricing={calc.pricing} profile={profile} runnable={runnable} defaultEff={calc.effective_date} onRefreshed={load} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Step 1 — what the AI found + resolve its questions in place ────────────────────
function WorkbookAnalysis({ profile, setProfile, columnLabels, disabled }: {
  profile: CellMapProfile; setProfile: (p: CellMapProfile) => void; columnLabels: Record<string, string>; disabled: boolean
}) {
  const a = profile.analysis ?? {}
  return (
    <section className={card + ' p-4'}>
      <div className="flex items-center gap-2 mb-3">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">1</span>
        <h2 className="text-[13px] font-semibold text-slate-800">What the AI found <span className="font-normal text-slate-400">— resolve its questions, then approve</span></h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mb-4">
        {a.detected_sheets && a.detected_sheets.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide mb-1.5 text-slate-500"><FileSpreadsheet size={12} />Detected sheets</div>
            <ul className="flex flex-col gap-1">{a.detected_sheets.map((s, i) => (
              <li key={i} className="text-[12px] text-slate-700 flex items-baseline gap-1.5"><span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{s.sheet}</span><span className="text-slate-400">→</span><span className="text-slate-600">{s.role}</span></li>
            ))}</ul>
          </div>
        )}
        {a.mapped && a.mapped.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide mb-1.5 text-emerald-600"><CheckCircle2 size={12} />Mapped</div>
            <ul className="flex flex-col gap-1">{a.mapped.map((m, i) => <li key={i} className="text-[12px] text-slate-700 flex items-start gap-1.5"><CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" />{m}</li>)}</ul>
          </div>
        )}
      </div>

      <ResolveWizard profile={profile} setProfile={setProfile} columnLabels={columnLabels} disabled={disabled} />
    </section>
  )
}

// ── Resolve wizard — one question at a time; each answer edits the cell-map + checks off ──
function ResolveWizard({ profile, setProfile, columnLabels, disabled }: {
  profile: CellMapProfile; setProfile: (p: CellMapProfile) => void; columnLabels: Record<string, string>; disabled: boolean
}) {
  const items = deriveReviewItems(profile)
  const [idx, setIdx] = useState(0)
  const [pending, setPending] = useState<{ mode: 'column' | 'input'; opt: ReviewOption } | null>(null)
  const [draft, setDraft] = useState('')
  if (items.length === 0) return null

  const openIdxs = items.map((it, i) => (it.resolved ? -1 : i)).filter(i => i >= 0)
  const allDone = openIdxs.length === 0
  const cur = items[Math.min(idx, items.length - 1)]

  function resolve(item: ReviewItem, resolvedLabel: string, path?: string, value?: string | number | null) {
    let np = profile
    if (path && value !== undefined) np = applyProfilePath(np, path, value)
    np = resolveReviewItem(np, item.id, { label: resolvedLabel, value: value ?? undefined })
    setProfile(np)
    setPending(null); setDraft('')
    // Advance to the next still-open item.
    const next = items.findIndex((it, i) => i !== items.indexOf(item) && !it.resolved)
    if (next >= 0) setIdx(next)
  }

  function choose(item: ReviewItem, opt: ReviewOption) {
    if (opt.dismiss) return resolve(item, opt.label)
    if (opt.set) return resolve(item, `${opt.label}`, opt.set.path, opt.set.value)
    if (opt.pick_column) { setPending({ mode: 'column', opt }); setDraft(''); return }
    if (opt.value_input) { setPending({ mode: 'input', opt }); setDraft(''); return }
    resolve(item, opt.label) // no-op option → just acknowledge
  }

  const cols = Object.keys(columnLabels).length ? columnLabels : Object.fromEntries('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => [c, '']))

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <ListChecks size={12} /> Resolve {allDone ? '' : <span className="text-rose-500">· {openIdxs.length} left</span>}
        </div>
        {/* progress dots */}
        <div className="flex items-center gap-1">
          {items.map((it, i) => (
            <button key={it.id} onClick={() => setIdx(i)} title={it.question}
              className={`w-2 h-2 rounded-full transition-colors ${it.resolved ? 'bg-emerald-400' : i === Math.min(idx, items.length - 1) ? 'bg-primary' : 'bg-slate-300'}`} />
          ))}
        </div>
      </div>

      {allDone ? (
        <div className="flex items-center gap-2 text-[12.5px] text-emerald-700 py-1.5"><CheckCircle2 size={15} /> All settled — the cell-map reflects your answers. You can Approve now.</div>
      ) : (
        <div>
          <div className="flex items-start gap-2 mb-2.5">
            <span className={`mt-0.5 shrink-0 ${cur.severity === 'assumption' ? 'text-amber-500' : 'text-rose-500'}`}>{cur.severity === 'assumption' ? <Lightbulb size={14} /> : <Eye size={14} />}</span>
            <p className="text-[13px] text-slate-800 font-medium">{cur.question}</p>
          </div>

          {pending ? (
            <div className="flex items-center gap-2 pl-6">
              {pending.mode === 'column' ? (
                <select autoFocus value={draft} onChange={e => setDraft(e.target.value)} className="text-[12px] rounded-md bg-white border border-slate-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="">Pick a column…</option>
                  {Object.entries(cols).map(([c, lbl]) => <option key={c} value={c}>{c}{lbl ? ` — ${lbl}` : ''}</option>)}
                </select>
              ) : (
                <input autoFocus type={pending.opt.value_input === 'number' ? 'number' : 'text'} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Enter value" className="w-32 text-[12px] rounded-md bg-white border border-slate-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20" />
              )}
              <button disabled={!draft} onClick={() => resolve(cur, `${pending.opt.label}: ${pending.mode === 'column' ? `${draft}${cols[draft] ? ` — ${cols[draft]}` : ''}` : draft}`, cur.target_path ?? pending.opt.set?.path, draft)}
                className="text-[12px] font-semibold px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Apply</button>
              <button onClick={() => { setPending(null); setDraft('') }} className="text-[12px] text-slate-400 hover:text-slate-600">Cancel</button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pl-6">
              {cur.options.map((opt, i) => (
                <button key={i} disabled={disabled} onClick={() => choose(cur, opt)}
                  className={`text-[12px] px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${opt.recommended ? 'border-primary/40 bg-primary/5 text-primary font-medium hover:bg-primary/10' : 'border-slate-200 text-slate-700 hover:bg-white'}`}>
                  {opt.recommended && <Check size={12} className="inline mr-1 -mt-0.5" />}{opt.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-3 pl-6">
            <span className="text-[11px] text-slate-400">Question {Math.min(idx, items.length - 1) + 1} of {items.length}</span>
            <button onClick={() => { const n = items.findIndex((it, i) => i > idx && !it.resolved); setIdx(n >= 0 ? n : (openIdxs[0] ?? idx)) }} className="text-[11.5px] text-slate-400 hover:text-slate-600">Skip →</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Workbook reference — click any sheet to inspect its cells ─────────────────────────
function WorkbookSummary({ dump, sheet }: { dump: Dump | null; sheet: string }) {
  const [open, setOpen] = useState(sheet)
  if (!dump) return null
  const values = dump.values?.[open]
  return (
    <section className={card + ' p-4'}>
      <div className="flex items-center gap-2 mb-2">
        <Table2 size={14} className="text-slate-400" />
        <h2 className="text-[13px] font-semibold text-slate-800">Workbook <span className="font-normal text-slate-400">— click a sheet to inspect</span></h2>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {dump.sheets.map(s => (
          <button key={s.name} onClick={() => setOpen(s.name)}
            className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${s.name === open ? 'bg-primary/10 text-primary font-medium ring-1 ring-primary/20' : s.visible ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
            {s.name}{!s.visible ? ' (hidden)' : ''}{s.name === sheet ? ' ·map' : ''}
          </button>
        ))}
      </div>
      {values ? <SheetGrid values={values} /> : <p className="text-[11.5px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">This sheet is computed — values appear when a census runs (see the worked example under Pricing &amp; maths).</p>}
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

// ── Profile editor ────────────────────────────────────────────────────────────────
const colInput = 'w-14 text-[12px] font-mono text-center rounded px-1 py-0.5 bg-slate-50 border border-transparent hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white disabled:opacity-60'
const txtInput = 'text-[12px] rounded px-2 py-0.5 bg-slate-50 border border-transparent hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white disabled:opacity-60'

function ProfileEditor({ profile, setProfile, disabled }: { profile: CellMapProfile; setProfile: (p: CellMapProfile) => void; disabled: boolean }) {
  const up = (patch: Partial<CellMapProfile>) => setProfile({ ...profile, ...patch })
  const upMember = (field: string, col: string) => up({ member_inputs: { ...profile.member_inputs, [field]: col || undefined } })
  const upLine = (i: number, patch: Partial<CoverageLine>) => { const l = [...profile.coverage_lines]; l[i] = { ...l[i], ...patch }; up({ coverage_lines: l }) }
  const upLineInput = (i: number, field: string, col: string) => { const l = [...profile.coverage_lines]; l[i] = { ...l[i], inputs: { ...l[i].inputs, [field]: col } }; up({ coverage_lines: l }) }
  const removeLineInput = (i: number, field: string) => { const l = [...profile.coverage_lines]; const inputs = { ...l[i].inputs }; delete inputs[field]; l[i] = { ...l[i], inputs }; up({ coverage_lines: l }) }

  return (
    <section className={card + ' p-4 flex flex-col gap-4'}>
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">2</span>
        <h2 className="text-[13px] font-semibold text-slate-800">Cell-map <span className="font-normal text-slate-400">— confirm before approving</span></h2>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-[12px] flex items-center gap-1.5">Sheet <input value={profile.sheet} onChange={e => up({ sheet: e.target.value })} disabled={disabled} className={`${txtInput} w-28`} /></label>
        <label className="text-[12px] flex items-center gap-1.5">Rows <input type="number" value={profile.rows?.start ?? 0} onChange={e => up({ rows: { ...profile.rows, start: +e.target.value } })} disabled={disabled} className={`${colInput} w-16`} /> → <input type="number" value={profile.rows?.end ?? 0} onChange={e => up({ rows: { ...profile.rows, end: +e.target.value } })} disabled={disabled} className={`${colInput} w-16`} /></label>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/50 mb-1.5">Per-life inputs (column letter)</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {MEMBER_FIELDS.map(f => (
            <label key={f} className="text-[12px] flex items-center justify-between gap-2">
              <span className="text-muted-foreground/80">{f.replace(/_/g, ' ')}</span>
              <input value={profile.member_inputs?.[f] ?? ''} onChange={e => upMember(f, e.target.value.toUpperCase())} disabled={disabled} className={colInput} placeholder="—" />
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/50">Coverage lines</p>
          {!disabled && <button onClick={() => up({ coverage_lines: [...profile.coverage_lines, { code: 'NEW', label: 'New line', inputs: { plan: '' }, output: '' }] })} className="text-[11px] text-primary flex items-center gap-1 hover:underline"><Plus size={11} /> add</button>}
        </div>
        <div className="flex flex-col gap-2.5">
          {profile.coverage_lines.map((line, i) => (
            <div key={i} className="border border-slate-100/60 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <input value={line.code} onChange={e => upLine(i, { code: e.target.value.toUpperCase() })} disabled={disabled} className={`${txtInput} w-20 font-mono`} placeholder="CODE" />
                <input value={line.label} onChange={e => upLine(i, { label: e.target.value })} disabled={disabled} className={`${txtInput} flex-1`} placeholder="Label" />
                <span className="text-[11px] text-muted-foreground/60">→ premium</span>
                <input value={line.output} onChange={e => upLine(i, { output: e.target.value.toUpperCase() })} disabled={disabled} className={colInput} placeholder="col" />
                {!disabled && <button onClick={() => up({ coverage_lines: profile.coverage_lines.filter((_, j) => j !== i) })} className="text-rose-400 hover:text-rose-600"><Trash2 size={13} /></button>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-1">
                {Object.entries(line.inputs ?? {}).map(([field, col]) => (
                  <span key={field} className="text-[11.5px] flex items-center gap-1 group/f">
                    <span className="text-muted-foreground/70">{field}</span>
                    <input value={col} onChange={e => upLineInput(i, field, e.target.value.toUpperCase())} disabled={disabled} className={colInput} />
                    {!disabled && <button title={`remove ${field}`} onClick={() => removeLineInput(i, field)} className="text-slate-300 hover:text-rose-500"><Trash2 size={11} /></button>}
                  </span>
                ))}
                {!disabled && (
                  <button onClick={() => { const f = window.prompt('New input field name (e.g. plan, hospital, beds, coinsurance, panel):')?.trim(); if (f) upLineInput(i, f, '') }}
                    className="text-[11px] text-primary hover:underline flex items-center gap-0.5"><Plus size={10} /> field</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/50 mb-1.5">Totals (absolute cells)</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center">
          {profile.coverage_lines.map(line => (
            <label key={line.code} className="text-[11.5px] flex items-center gap-1">
              <span className="text-muted-foreground/70">{line.code}</span>
              <input value={profile.totals?.by_line?.[line.code] ?? ''} onChange={e => up({ totals: { ...profile.totals, by_line: { ...profile.totals?.by_line, [line.code]: e.target.value.toUpperCase() } } })} disabled={disabled} className={`${colInput} w-16`} placeholder="cell" />
            </label>
          ))}
          <label className="text-[11.5px] flex items-center gap-1 font-medium">
            <span>grand</span>
            <input value={profile.totals?.grand ?? ''} onChange={e => up({ totals: { ...profile.totals, grand: e.target.value.toUpperCase() } })} disabled={disabled} className={`${colInput} w-16`} placeholder="cell" />
          </label>
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/50 mb-1">Per-life total column <span className="normal-case text-muted-foreground/40">— use when premiums aren&rsquo;t on this sheet; leave line outputs blank</span></p>
        <label className="text-[11.5px] flex items-center gap-1.5">
          <span className="text-muted-foreground/70">column (e.g. Y)</span>
          <input value={profile.per_life_total ?? ''} onChange={e => up({ per_life_total: e.target.value.toUpperCase() || undefined })} disabled={disabled} className={colInput} placeholder="—" />
        </label>
      </div>
    </section>
  )
}

// ── Pricing & maths — transparent rate tables + a worked example (replaces Verify) ────
type SampleMember = { name: string; age?: number; coverage: Record<string, Record<string, string>> }

function PricingPanel({ id, pricing, profile, runnable, defaultEff, onRefreshed }: {
  id: string; pricing: Pricing | null; profile: CellMapProfile; runnable: boolean; defaultEff: string | null; onRefreshed: () => void
}) {
  const inclGst = /incl|inclusive/i.test(pricing?.gst ?? '')
  const gstDiv = profile.total_gst_divisor
  const [refreshing, setRefreshing] = useState(false)
  const [rlabel, setRlabel] = useState('')

  async function refresh() {
    setRefreshing(true); setRlabel('Reading the workbook…')
    const poll = setInterval(async () => {
      const s = await fetch(`/api/pricing-matrix/calculators/${id}/map-status`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
      if (s?.map_progress?.label) setRlabel(s.map_progress.label)
    }, 1800)
    try {
      await fetch(`/api/pricing-matrix/calculators/${id}/extract-pricing`, { method: 'POST' })
      onRefreshed()
    } finally { clearInterval(poll); setRefreshing(false); setRlabel('') }
  }

  return (
    <section className={card + ' p-4 flex flex-col gap-4'}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold shrink-0">3</span>
          <h2 className="text-[13px] font-semibold text-slate-800 truncate">Pricing &amp; maths <span className="font-normal text-slate-400">— confirm every rate is right</span></h2>
        </div>
        <button onClick={refresh} disabled={refreshing} title="Re-read the rate tables (Opus + Gemini + judge) without changing your cell-map" className="flex items-center gap-1.5 text-[11.5px] text-slate-500 hover:text-slate-800 disabled:opacity-60 shrink-0">
          {refreshing ? <><Loader2 size={12} className="animate-spin" />{rlabel || 'Refreshing…'}</> : <><Wand2 size={12} /> Refresh rate tables</>}
        </button>
      </div>

      {/* Worked example first — proof a real premium computes correctly. */}
      <WorkedExample id={id} profile={profile} runnable={runnable} defaultEff={defaultEff} />

      {/* Full rate tables from the workbook. */}
      {!pricing || !pricing.coverages?.length ? (
        <p className="text-[12px] text-slate-500 border border-dashed border-slate-100 rounded-lg px-3 py-4 text-center">
          Rate tables appear after <b>Auto-map</b>. If they&rsquo;re missing, click <b>Re-map</b> to re-read the workbook.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {pricing.gst && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{pricing.gst}</span>}
            {inclGst && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Rates below include GST</span>}
            {gstDiv && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Quotes shown net (÷{gstDiv})</span>}
            {pricing.rate_version && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{pricing.rate_version}</span>}
            {pricing.accuracy && pricing.accuracy.extractors.length > 1 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1" title={`${pricing.accuracy.agreed} agreed · ${pricing.accuracy.conflicts} reconciled by judge · ${pricing.accuracy.single_source} single-source of ${pricing.accuracy.total_rates}`}>
                <CheckCircle2 size={11} /> Opus + Gemini cross-checked{pricing.accuracy.conflicts ? ` · ${pricing.accuracy.adjudicated} reconciled` : ''}
              </span>
            )}
          </div>
          {pricing.coverages.map((cov, i) => (
            <div key={i} className="border border-slate-100 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[12.5px] font-semibold text-slate-800">{cov.full_name}</span>
                  {cov.code && cov.code !== cov.full_name && <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-white border border-slate-100 text-slate-500">{cov.code}</span>}
                  {cov.member_type && <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{cov.member_type}</span>}
                  {inclGst && <span className="text-[10.5px] text-amber-600">(incl. GST)</span>}
                </div>
                {cov.derivation && <p className="text-[11px] text-slate-500 mt-1 flex items-start gap-1.5"><Lightbulb size={12} className="text-amber-500 mt-0.5 shrink-0" />{cov.derivation}</p>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px] border-collapse">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-100 bg-white">
                      <th className="text-left py-1.5 px-3 font-medium">Age band</th>
                      {cov.plans.map(p => <th key={p.code} className="text-right py-1.5 px-3 font-medium whitespace-nowrap" title={p.attrs ?? ''}>{p.label}{p.attrs ? <span className="block text-[9.5px] font-normal text-slate-400">{p.attrs}</span> : null}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {cov.rates.map((r, j) => (
                      <tr key={j} className="border-b border-slate-100">
                        <td className="py-1 px-3 text-slate-700 whitespace-nowrap">{r.band}</td>
                        {cov.plans.map(p => {
                          const v = r.by_plan?.[p.code]
                          return <td key={p.code} className="py-1 px-3 text-right tabular-nums text-slate-600">{typeof v === 'number' ? v.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (v ? <span className="text-slate-300">{v}</span> : '—')}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="text-[10.5px] text-slate-400">Rates read directly from the insurer&rsquo;s workbook. Premiums are computed by running that same workbook — never re-typed.</p>
        </div>
      )}
    </section>
  )
}

/** A single worked example: pick an age + plans → run the real workbook → show the premium. */
function WorkedExample({ id, profile, runnable, defaultEff }: { id: string; profile: CellMapProfile; runnable: boolean; defaultEff: string | null }) {
  const dd = profile.dropdowns ?? {}
  const initCov = useMemo(() => Object.fromEntries(profile.coverage_lines.map(l =>
    [l.code, Object.fromEntries(Object.keys(l.inputs).map(f => [f, dd[`${l.code}.${f}`]?.[0] ?? (f === 'plan' ? 'Plan 1' : '')]))]
  )), [profile, dd])
  const [age, setAge] = useState(40)
  const [cov, setCov] = useState<Record<string, Record<string, string>>>(initCov)
  const [res, setRes] = useState<{ members: RunMember[]; totals: RunTotals } | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true); setError(null); setRes(null)
    const member: SampleMember = { name: `Age ${age} example`, age, coverage: cov }
    const r = await fetch(`/api/pricing-matrix/calculators/${id}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: [member], globals: { effective_date: defaultEff ?? '2026-01-01' } }),
    })
    const d = await safeJson<{ members: RunMember[]; totals: RunTotals }>(r)
    if (!r.ok) setError(d.error ?? 'Run failed'); else setRes(d)
    setRunning(false)
  }

  const m = res?.members?.[0]
  return (
    <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/60">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[12px] font-medium text-slate-700">Worked example</span>
        <button onClick={run} disabled={running || !runnable} className="flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Show workings
        </button>
      </div>
      {!runnable && <p className="text-[11px] text-amber-600 mb-1.5">Finish the cell-map to enable the worked example.</p>}
      <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
        <label className="flex items-center gap-1">Age <input type="number" value={age} onChange={e => setAge(+e.target.value)} className="w-14 border border-slate-100 rounded px-1.5 py-0.5 bg-white" /></label>
        {profile.coverage_lines.map(l => (
          <span key={l.code} className="flex items-center gap-1 text-slate-500">
            <span className="font-medium">{l.code}:</span>
            {Object.keys(l.inputs).map(f => (
              <SelOrText key={f} value={cov[l.code]?.[f] ?? ''} opts={dd[`${l.code}.${f}`]} placeholder={f}
                onChange={v => setCov(c => ({ ...c, [l.code]: { ...c[l.code], [f]: v } }))} />
            ))}
          </span>
        ))}
      </div>
      {error && <p className="text-[11.5px] text-rose-600 mt-2">{error}</p>}
      {m && (
        <div className="mt-2.5 border-t border-slate-100 pt-2 flex items-center gap-4 flex-wrap">
          {profile.coverage_lines.filter(l => typeof m.lines[l.code] === 'number').map(l => (
            <span key={l.code} className="text-[11.5px] text-slate-600">{l.code} <b className="tabular-nums text-slate-800">{fmt(m.lines[l.code])}</b></span>
          ))}
          <span className="text-[12px] text-slate-700 ml-auto">Premium <b className="tabular-nums text-primary text-[13px]">{fmt(m.subtotal)}</b></span>
        </div>
      )}
      {m && <p className="text-[10.5px] text-slate-400 mt-1.5">Computed by running the insurer&rsquo;s own workbook — compare against their spreadsheet to confirm.</p>}
    </div>
  )
}

function SelOrText({ value, opts, placeholder, onChange }: { value: string; opts?: string[]; placeholder?: string; onChange: (v: string) => void }) {
  if (opts && opts.length) return (
    <select value={value} onChange={e => onChange(e.target.value)} className="text-[11px] border border-slate-100 rounded px-1 py-0.5 bg-background focus:outline-none">
      <option value="">—</option>{opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-20 text-[11px] border border-slate-100 rounded px-1 py-0.5 bg-background focus:outline-none" />
}

const fmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
