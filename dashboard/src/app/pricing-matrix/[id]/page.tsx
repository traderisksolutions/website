'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Wand2, Save, CheckCircle2, Play, Plus, Trash2, AlertTriangle } from 'lucide-react'
import type { CellMapProfile, CoverageLine } from '@/lib/pm-profile'
import { profileIsRunnable } from '@/lib/pm-profile'

type Dump = {
  sheets: { name: string; state: string; visible: boolean; max_row: number; max_col: number }[]
  previews: Record<string, { top_rows: { row: number; cells: Record<string, string> }[] }>
}
type Calc = {
  id: string; insurer_name: string | null; label: string | null; status: string
  xlsx_filename: string | null; brochure_filename: string | null; effective_date: string | null; version: number
  profile: CellMapProfile | null; workbook_summary: Dump | null
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/pricing-matrix/calculators/${id}`, { cache: 'no-store' })
    const row = await safeJson<Calc>(res)
    // The DB defaults profile to '{}'::jsonb; treat an un-mapped (no coverage_lines) profile as none.
    if (res.ok) { setCalc(row); setProfile(hasRealProfile(row.profile) ? row.profile : null) }
    setLoading(false)
    return row
  }, [id])

  const runMap = useCallback(async () => {
    setMapping(true); setError(null)
    try {
      const res = await fetch(`/api/pricing-matrix/calculators/${id}/map`, { method: 'POST' })
      const d = await safeJson<{ profile?: CellMapProfile }>(res)
      if (!res.ok) setError(d.error ?? 'Mapping failed')
      await load()
    } finally { setMapping(false) }
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

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Pricing Matrix</Link>

      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">{calc.insurer_name || calc.label || 'Untitled calculator'}</h1>
          <p className="text-[12px] text-muted-foreground/70 mt-0.5">
            {calc.xlsx_filename}{calc.brochure_filename ? ` · ${calc.brochure_filename}` : ''}{calc.effective_date ? ` · eff. ${calc.effective_date}` : ''} · v{calc.version} · <span className="font-medium">{calc.status}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runMap} disabled={mapping} className="flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50">
            {mapping ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}{calc.profile ? 'Re-map' : 'Auto-map'}
          </button>
          {!approved && <button onClick={saveProfile} disabled={saving || !profile} className="flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50"><Save size={14} /> Save</button>}
          {!approved && <button onClick={approve} disabled={saving || !runnable || !calc.verification} title={!calc.verification ? 'Run a verification first' : ''} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 size={14} /> Approve</button>}
        </div>
      </div>

      {error && <div className="mb-4 text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
      {mapping && <div className="mb-4 text-[12.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Reading the workbook and proposing a cell-map…</div>}

      {!profile && !mapping && (
        <div className="text-center text-muted-foreground py-16 border border-dashed border-border rounded-xl">
          <Wand2 size={24} className="mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm">No cell-map yet. Click <b>Auto-map</b> to have the AI propose one from the workbook.</p>
          <button onClick={startBlank} className="mt-3 text-[12px] text-primary hover:underline">or set up the cell-map manually</button>
        </div>
      )}

      {profile && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="flex flex-col gap-5">
            <WorkbookSummary dump={calc.workbook_summary} sheet={profile.sheet} />
            <ProfileEditor profile={profile} setProfile={setProfile} disabled={approved} />
          </div>
          <div className="flex flex-col gap-5">
            <VerifyPanel id={id} profile={profile} runnable={runnable} defaultEff={calc.effective_date} lastVerification={calc.verification} onVerified={load} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Workbook summary (headers so the human maps column letters to labels) ─────────────
function WorkbookSummary({ dump, sheet }: { dump: Dump | null; sheet: string }) {
  if (!dump) return null
  const preview = dump.previews?.[sheet]
  return (
    <section className="border border-border rounded-xl p-4">
      <h2 className="text-[13px] font-semibold mb-2">Workbook</h2>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {dump.sheets.map(s => (
          <span key={s.name} className={`text-[11px] px-2 py-0.5 rounded-full ${s.name === sheet ? 'bg-primary/10 text-primary font-medium' : s.visible ? 'bg-slate-100 text-slate-600' : 'bg-slate-100 text-slate-400'}`}>
            {s.name}{!s.visible ? ' (hidden)' : ''}
          </span>
        ))}
      </div>
      {preview && (
        <div className="overflow-x-auto">
          <p className="text-[11px] text-muted-foreground/60 mb-1">Header rows on <b>{sheet}</b> (column letter → label):</p>
          <table className="text-[11px] border-collapse">
            <tbody>
              {preview.top_rows.filter(r => Object.values(r.cells).some(v => !String(v).startsWith('='))).slice(0, 6).map(r => (
                <tr key={r.row}>
                  <td className="pr-2 text-muted-foreground/40 align-top">{r.row}</td>
                  {Object.entries(r.cells).map(([col, val]) => (
                    <td key={col} className="border border-border/40 px-1.5 py-0.5 whitespace-nowrap max-w-[120px] truncate" title={`${col}: ${val}`}>
                      <span className="text-primary/60 font-mono">{col}</span> {String(val).startsWith('=') ? <span className="text-muted-foreground/40">ƒ</span> : val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ── Profile editor ────────────────────────────────────────────────────────────────
const colInput = 'w-14 text-[12px] font-mono text-center border border-border rounded px-1 py-0.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:bg-muted/40'
const txtInput = 'text-[12px] border border-border rounded px-2 py-0.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:bg-muted/40'

function ProfileEditor({ profile, setProfile, disabled }: { profile: CellMapProfile; setProfile: (p: CellMapProfile) => void; disabled: boolean }) {
  const up = (patch: Partial<CellMapProfile>) => setProfile({ ...profile, ...patch })
  const upMember = (field: string, col: string) => up({ member_inputs: { ...profile.member_inputs, [field]: col || undefined } })
  const upLine = (i: number, patch: Partial<CoverageLine>) => { const l = [...profile.coverage_lines]; l[i] = { ...l[i], ...patch }; up({ coverage_lines: l }) }
  const upLineInput = (i: number, field: string, col: string) => { const l = [...profile.coverage_lines]; l[i] = { ...l[i], inputs: { ...l[i].inputs, [field]: col } }; up({ coverage_lines: l }) }

  return (
    <section className="border border-border rounded-xl p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">Cell-map <span className="font-normal text-muted-foreground/60">— confirm before approving</span></h2>
      </div>

      {profile.unmapped && profile.unmapped.length > 0 && (
        <div className="text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /><span>AI was unsure about: {profile.unmapped.join(', ')}</span>
        </div>
      )}

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
            <div key={i} className="border border-border/60 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <input value={line.code} onChange={e => upLine(i, { code: e.target.value.toUpperCase() })} disabled={disabled} className={`${txtInput} w-20 font-mono`} placeholder="CODE" />
                <input value={line.label} onChange={e => upLine(i, { label: e.target.value })} disabled={disabled} className={`${txtInput} flex-1`} placeholder="Label" />
                <span className="text-[11px] text-muted-foreground/60">→ premium</span>
                <input value={line.output} onChange={e => upLine(i, { output: e.target.value.toUpperCase() })} disabled={disabled} className={colInput} placeholder="col" />
                {!disabled && <button onClick={() => up({ coverage_lines: profile.coverage_lines.filter((_, j) => j !== i) })} className="text-rose-400 hover:text-rose-600"><Trash2 size={13} /></button>}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pl-1">
                {Object.entries(line.inputs ?? {}).map(([field, col]) => (
                  <label key={field} className="text-[11.5px] flex items-center gap-1">
                    <span className="text-muted-foreground/70">{field}</span>
                    <input value={col} onChange={e => upLineInput(i, field, e.target.value.toUpperCase())} disabled={disabled} className={colInput} />
                  </label>
                ))}
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
    </section>
  )
}

// ── Verify panel — drive sample lives through the real engine ─────────────────────────
type SampleMember = { name: string; category?: string; relationship?: string; date_of_birth?: string; coverage: Record<string, Record<string, string>> }

function VerifyPanel({ id, profile, runnable, defaultEff, lastVerification, onVerified }: {
  id: string; profile: CellMapProfile; runnable: boolean; defaultEff: string | null
  lastVerification: Calc['verification']; onVerified: () => void
}) {
  const dd = profile.dropdowns ?? {}
  const blankMember = useMemo<SampleMember>(() => ({
    name: '', category: dd['category']?.[0], relationship: dd['relationship']?.[0], date_of_birth: '1985-01-01',
    coverage: Object.fromEntries(profile.coverage_lines.map(l => [l.code, Object.fromEntries(Object.keys(l.inputs).map(f => [f, dd[`${l.code}.${f}`]?.[0] ?? (f === 'plan' ? 'Plan 1' : '')]))])),
  }), [profile, dd])

  const [eff, setEff] = useState(defaultEff ?? '2026-01-01')
  const [members, setMembers] = useState<SampleMember[]>([{ ...blankMember, name: 'Sample One' }])
  const [result, setResult] = useState<{ members: RunMember[]; totals: RunTotals; warnings: string[] } | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true); setError(null); setResult(null)
    const res = await fetch(`/api/pricing-matrix/calculators/${id}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members, globals: { effective_date: eff } }),
    })
    const d = await safeJson<{ members: RunMember[]; totals: RunTotals; warnings: string[] }>(res)
    if (!res.ok) setError(d.error ?? 'Run failed')
    else { setResult(d); onVerified() }
    setRunning(false)
  }

  const shown = result ?? (lastVerification ? { members: lastVerification.members, totals: lastVerification.totals, warnings: lastVerification.warnings } : null)

  return (
    <section className="border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">Verify — run sample lives through the real workbook</h2>
        <button onClick={run} disabled={running || !runnable} className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run
        </button>
      </div>
      {!runnable && <p className="text-[11.5px] text-amber-600">Finish the cell-map (sheet, rows, DOB column, at least one coverage line with inputs + output) to enable verification.</p>}

      <label className="text-[12px] flex items-center gap-2">Policy effective date <input type="date" value={eff} onChange={e => setEff(e.target.value)} className={txtInput} /></label>

      <div className="flex flex-col gap-2">
        {members.map((m, i) => (
          <div key={i} className="border border-border/60 rounded-lg p-2.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input value={m.name} onChange={e => setMembers(ms => ms.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" className={`${txtInput} flex-1`} />
              {dd['category'] && <SelOrText value={m.category ?? ''} opts={dd['category']} onChange={v => setMembers(ms => ms.map((x, j) => j === i ? { ...x, category: v } : x))} />}
              <input type="date" value={m.date_of_birth ?? ''} onChange={e => setMembers(ms => ms.map((x, j) => j === i ? { ...x, date_of_birth: e.target.value } : x))} className={txtInput} />
              {members.length > 1 && <button onClick={() => setMembers(ms => ms.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600"><Trash2 size={13} /></button>}
            </div>
            <div className="flex flex-wrap gap-2 pl-1">
              {profile.coverage_lines.map(line => (
                <div key={line.code} className="flex items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground/60 font-medium">{line.code}:</span>
                  {Object.keys(line.inputs).map(field => {
                    const opts = dd[`${line.code}.${field}`]
                    const val = m.coverage[line.code]?.[field] ?? ''
                    const setV = (v: string) => setMembers(ms => ms.map((x, j) => j === i ? { ...x, coverage: { ...x.coverage, [line.code]: { ...x.coverage[line.code], [field]: v } } } : x))
                    return <SelOrText key={field} value={val} opts={opts} placeholder={field} onChange={setV} />
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
        <button onClick={() => setMembers(ms => [...ms, { ...blankMember, name: `Sample ${ms.length + 1}` }])} className="text-[11.5px] text-primary flex items-center gap-1 hover:underline self-start"><Plus size={12} /> add life</button>
      </div>

      {error && <p className="text-[12px] text-rose-600">{error}</p>}

      {shown && (
        <div className="mt-1 border-t border-border/50 pt-3">
          {lastVerification && !result && <p className="text-[11px] text-muted-foreground/50 mb-1">Last run {new Date(lastVerification.at).toLocaleString('en-SG')}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] border-collapse">
              <thead>
                <tr className="text-left text-muted-foreground/60 border-b border-border">
                  <th className="py-1 pr-2 font-medium">Life</th>
                  {profile.coverage_lines.map(l => <th key={l.code} className="py-1 px-2 font-medium text-right">{l.code}</th>)}
                  <th className="py-1 pl-2 font-medium text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {shown.members.map(mm => (
                  <tr key={mm.row} className="border-b border-border/40">
                    <td className="py-1 pr-2">{mm.name || `row ${mm.row}`}</td>
                    {profile.coverage_lines.map(l => <td key={l.code} className="py-1 px-2 text-right tabular-nums">{fmt(mm.lines[l.code])}</td>)}
                    <td className="py-1 pl-2 text-right tabular-nums font-medium">{fmt(mm.subtotal)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1.5 pr-2">Total</td>
                  {profile.coverage_lines.map(l => <td key={l.code} className="py-1.5 px-2 text-right tabular-nums">{fmt(shown.totals.by_line?.[l.code])}</td>)}
                  <td className="py-1.5 pl-2 text-right tabular-nums text-primary">{fmt(shown.totals.grand)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {shown.warnings?.length > 0 && <p className="text-[11px] text-amber-600 mt-1.5">{shown.warnings.join(' · ')}</p>}
          <p className="text-[11px] text-muted-foreground/50 mt-2">Eyeball these against the insurer&rsquo;s own spreadsheet, then Approve.</p>
        </div>
      )}
    </section>
  )
}

function SelOrText({ value, opts, placeholder, onChange }: { value: string; opts?: string[]; placeholder?: string; onChange: (v: string) => void }) {
  if (opts && opts.length) return (
    <select value={value} onChange={e => onChange(e.target.value)} className="text-[11px] border border-border rounded px-1 py-0.5 bg-background focus:outline-none">
      <option value="">—</option>{opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-20 text-[11px] border border-border rounded px-1 py-0.5 bg-background focus:outline-none" />
}

const fmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
