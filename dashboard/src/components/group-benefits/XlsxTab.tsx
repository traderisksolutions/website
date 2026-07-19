'use client'

import React, { useState } from 'react'
import { UploadCloud, Loader2, CheckCircle2, FileSpreadsheet, ChevronDown, ChevronRight, Trash2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const NOT_DETECTED = 'NOT DETECTED — requires human input'

async function safeJson<T = Record<string, unknown>>(r: Response): Promise<T & { error?: string }> {
  const t = await r.text().catch(() => '')
  try { return (t ? JSON.parse(t) : {}) as T & { error?: string } }
  catch { return { error: t.slice(0, 160) || 'Server error' } as T & { error?: string } }
}

type Table = {
  id: string; insurer_name: string | null; product_code: string; status: string
  calculator_filename?: string | null; rules_status?: string | null; rules_updated_at?: string | null
}
type DetLog = { rule: string; value: unknown; source_cell_or_text: string; confidence: string }

const RULES_TONE: Record<string, string> = {
  none: 'bg-muted text-muted-foreground', analyzing: 'bg-amber-100 text-amber-700',
  in_review: 'bg-blue-100 text-blue-700', approved: 'bg-emerald-100 text-emerald-700', error: 'bg-rose-100 text-rose-700',
}
const RULES_LABEL: Record<string, string> = {
  none: 'No calculator', analyzing: 'Analyzing…', in_review: 'Review rules', approved: 'Rules approved', error: 'Failed',
}

export function XlsxTab({ tables, loading, onChanged }: { tables: Table[]; loading: boolean; onChanged: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (tables.length === 0) return (
    <div className="text-center py-16 text-muted-foreground">
      <FileSpreadsheet size={28} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm">No rate tables yet. Upload an insurer rate PDF first, then attach its Excel calculator here.</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-muted-foreground/80 -mt-1">
        Attach each insurer&apos;s Excel calculator to its rate table. We read the workbook and pull out the
        <span className="font-medium text-foreground/70"> calculation rules</span> the rate PDF doesn&apos;t contain. Rate numbers still come from the rate PDF.
      </p>
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70 mb-2">What we extract from the calculator</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[11.5px]">
          {[
            ['Age basis', 'how the insurer counts age (last vs next birthday)'],
            ['GST treatment', 'whether printed rates include GST'],
            ['Group-size discount', 'loading or discount based on headcount'],
            ['Renewal-only ages', 'age bands sold only on renewal, not new business'],
            ['Occupation class', 'which occupation classes are ineligible'],
            ['Coverage dependencies', 'a cover that requires another first (for reference)'],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-1.5">
              <span className="text-primary/50 mt-px">•</span>
              <span><span className="font-semibold text-foreground/80">{t}</span> <span className="text-muted-foreground/70">— {d}</span></span>
            </div>
          ))}
        </div>
        <p className="text-[10.5px] text-muted-foreground/60 mt-2.5">Each is shown with where we found it and how confident we are — you review and approve before it&apos;s used in quotes.</p>
      </div>
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="data-table w-full border-collapse text-[13px]">
          <thead><tr>
            <th className="pl-4 text-left w-6" /><th className="text-left">Insurer</th><th className="text-left">Products</th>
            <th className="text-left">Rate status</th><th className="text-left">Calculator</th><th className="text-right pr-4">Action</th>
          </tr></thead>
          <tbody>
            {tables.map(t => {
              const rs = t.rules_status ?? 'none'
              const open = openId === t.id
              return (
                <React.Fragment key={t.id}>
                  <tr className="cursor-pointer" onClick={() => setOpenId(open ? null : t.id)}>
                    <td className="pl-4 text-muted-foreground/50">{rs === 'none' ? <span className="inline-block w-3" /> : open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td className="font-medium text-foreground whitespace-nowrap">{t.insurer_name || 'Unknown insurer'}</td>
                    <td className="text-muted-foreground max-w-[320px] truncate">{t.product_code}</td>
                    <td className="text-muted-foreground capitalize">{t.status.replace('_', ' ')}</td>
                    <td>
                      <span className={cn('text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full', RULES_TONE[rs] ?? 'bg-muted')}>{RULES_LABEL[rs] ?? rs}</span>
                      {t.calculator_filename && <span className="ml-2 text-[11px] text-muted-foreground/60">{t.calculator_filename}</span>}
                    </td>
                    <td className="text-right pr-4" onClick={e => e.stopPropagation()}>
                      <UploadXlsx tableId={t.id} status={rs} onDone={onChanged} />
                    </td>
                  </tr>
                  {open && rs !== 'none' && (
                    <tr><td colSpan={6} className="!p-0">
                      {/* key on rules_updated_at so the panel refetches after a re-analysis/save */}
                      <RulesPanel key={t.rules_updated_at ?? t.id} tableId={t.id} onChanged={onChanged} />
                    </td></tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UploadXlsx({ tableId, status, onDone }: { tableId: string; status: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function pick(file: File) {
    if (!file.name.toLowerCase().endsWith('.xlsx')) { setErr('Must be an .xlsx file'); return }
    if (file.size > 25 * 1024 * 1024) { setErr('File too large (max 25 MB)'); return }
    setBusy(true); setErr(null)
    try {
      const uu = await fetch(`/api/group-benefits/rate-tables/${tableId}/calculator/upload-url`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name }) })
      const ud = await safeJson<{ path?: string; token?: string }>(uu)
      if (!uu.ok || !ud.path || !ud.token) { setErr(ud.error ?? 'Could not start upload'); return }
      const { error: upErr } = await createClient().storage.from('group-benefits').uploadToSignedUrl(ud.path, ud.token, file, { contentType: XLSX_MIME })
      if (upErr) { setErr(`Upload failed: ${upErr.message}`); return }
      const an = await fetch(`/api/group-benefits/rate-tables/${tableId}/calculator`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storage_path: ud.path, filename: file.name }) })
      const ad = await safeJson(an)
      if (!an.ok) { setErr(ad.error ?? 'Analysis failed'); return }
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally { setBusy(false) }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {err && <span className="text-[11px] text-rose-600 max-w-[200px] truncate" title={err}>{err}</span>}
      <label className={cn('inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border cursor-pointer',
        busy ? 'opacity-60 pointer-events-none border-border' : 'border-primary/30 text-primary hover:bg-primary/5')}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
        {busy ? 'Analyzing…' : status === 'none' ? 'Upload xlsx' : 'Replace'}
        <input type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) pick(f) }} />
      </label>
    </span>
  )
}

function RulesPanel({ tableId, onChanged }: { tableId: string; onChanged: () => void }) {
  const [log, setLog] = useState<DetLog[] | null>(null)
  const [rules, setRules] = useState<Record<string, unknown>>({})
  const [warnings, setWarnings] = useState<string[]>([])
  const [status, setStatus] = useState<string>('in_review')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/group-benefits/rate-tables/${tableId}`, { cache: 'no-store' })
    const d = await safeJson<{ table?: { rules?: Record<string, unknown>; rules_log?: { detection_log?: DetLog[]; warnings?: string[] }; rules_status?: string } }>(res)
    setRules(d.table?.rules ?? {})
    setLog(d.table?.rules_log?.detection_log ?? [])
    setWarnings(d.table?.rules_log?.warnings ?? [])
    setStatus(d.table?.rules_status ?? 'in_review')
    setLoading(false)
  }, [tableId])
  React.useEffect(() => { load() }, [load])

  const setRule = React.useCallback((rule: string, value: unknown) => setRules(prev => ({ ...prev, [rule]: value })), [])

  const editable = status !== 'approved' || editing

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/group-benefits/rate-tables/${tableId}/calculator`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules, approved: true }),
    })
    setSaving(false)
    if (res.ok) { setStatus('approved'); setEditing(false); onChanged() }
  }
  function cancel() { setEditing(false); load() }   // discard edits — reload from server

  if (loading) return <div className="px-6 py-4 bg-muted/20"><Loader2 size={15} className="animate-spin text-muted-foreground" /></div>

  const confOf = (rule: string) => (log ?? []).find(e => e.rule === rule)?.confidence ?? 'n/a'
  const srcOf = (rule: string) => (log ?? []).find(e => e.rule === rule)?.source_cell_or_text ?? ''

  return (
    <div className="px-6 py-5 bg-muted/20 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-[13px] font-bold text-foreground">Calculation rules from this calculator</h4>
          <p className="text-[11.5px] text-muted-foreground/70 mt-0.5">{editable
            ? 'We read the workbook and filled these in. Check each one, adjust if needed, then Save — they’ll be applied automatically when you quote this insurer.'
            : 'These rules are applied automatically when you quote this insurer. Click Edit to change them.'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status === 'approved' && !editing && <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-700"><CheckCircle2 size={13} /> Approved</span>}
          {editable
            ? <>
                {editing && <button onClick={cancel} disabled={saving} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted/40 disabled:opacity-50">Cancel</button>}
                <button onClick={save} disabled={saving} className="text-[12px] font-semibold px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              </>
            : <button onClick={() => setEditing(true)} className="text-[12px] font-semibold px-3.5 py-1.5 rounded-lg border border-border bg-white hover:bg-muted/40">Edit</button>}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mb-3 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {warnings.map((w, i) => <p key={i} className="m-0">{w}</p>)}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <RuleCard title="How is age counted?" blurb="Sets each member's age from their date of birth. “Next birthday” makes everyone a year older." confidence={confOf('age_basis')} source={srcOf('age_basis')} editable={editable} found={confOf('age_basis') !== 'n/a' || hasVal(rules.age_basis)}>
          <AgeBasisEditor value={rules.age_basis} onChange={v => setRule('age_basis', v)} />
        </RuleCard>

        <RuleCard title="Do the rates include GST?" blurb="Comparisons are shown net of GST. If the printed rates include GST, we divide them down." confidence={confOf('gst_treatment')} source={srcOf('gst_treatment')} editable={editable} found={confOf('gst_treatment') !== 'n/a' || hasVal(rules.gst_treatment)}>
          <GstEditor value={rules.gst_treatment} onChange={v => setRule('gst_treatment', v)} />
        </RuleCard>

        <RuleCard title="Discount or loading by group size?" blurb="Adjusts every premium based on the total number of lives (e.g. −5% for 5+ employees)." confidence={confOf('group_size_discount')} source={srcOf('group_size_discount')} editable={editable} found={confOf('group_size_discount') !== 'n/a' || hasVal(rules.group_size_discount)}>
          <GroupDiscountEditor value={rules.group_size_discount} onChange={v => setRule('group_size_discount', v)} />
        </RuleCard>

        <RuleCard title="Ages only available on renewal?" blurb="On a New Business quote these ages are left unpriced; on a Renewal quote they're priced." confidence={confOf('renewal_only_bands')} source={srcOf('renewal_only_bands')} editable={editable} found={confOf('renewal_only_bands') !== 'n/a' || hasVal(rules.renewal_only_bands)}>
          <RenewalBandsEditor value={rules.renewal_only_bands} onChange={v => setRule('renewal_only_bands', v)} />
        </RuleCard>

        <RuleCard title="Occupation classes not eligible" blurb="Members whose occupation class is ticked here are marked ineligible for this insurer." confidence={confOf('occupation_class_rules')} source={srcOf('occupation_class_rules')} editable={editable} found={confOf('occupation_class_rules') !== 'n/a' || hasVal(rules.occupation_class_rules)}>
          <OccClassEditor value={rules.occupation_class_rules} onChange={v => setRule('occupation_class_rules', v)} />
        </RuleCard>

        <RuleCard title="Coverage dependencies" blurb="Note where one coverage can only be taken alongside another (for your reference)." confidence={confOf('rider_dependencies')} source={srcOf('rider_dependencies')} editable={editable} found={confOf('rider_dependencies') !== 'n/a' || hasVal(rules.rider_dependencies)}>
          <RiderEditor value={rules.rider_dependencies} onChange={v => setRule('rider_dependencies', v)} />
        </RuleCard>
      </div>
    </div>
  )
}

// True when a rule holds a real value (either detected or added by hand), across the
// various rule shapes — used so manually-added rules stay visible after reload.
function hasVal(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') return v !== '' && !v.startsWith('NOT DETECTED')
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (Array.isArray(o.tiers)) return o.tiers.length > 0
    if (Array.isArray(o.excluded_classes)) return o.excluded_classes.length > 0
    if (Array.isArray(o.classes_present)) return o.classes_present.length > 0
    if (typeof o.treatment === 'string' && o.treatment) return true
  }
  return false
}

// ── Guided rule editors (no JSON) ──────────────────────────────────────────────────
const CONF_META: Record<string, { label: string; cls: string }> = {
  high:   { label: 'Detected',      cls: 'bg-emerald-100 text-emerald-700' },
  medium: { label: 'Likely',        cls: 'bg-blue-100 text-blue-700' },
  low:    { label: 'Please check',  cls: 'bg-amber-100 text-amber-700' },
  'n/a':  { label: 'Not found',     cls: 'bg-muted text-muted-foreground' },
}

function RuleCard({ title, blurb, confidence, source, editable, found, children }: { title: string; blurb: string; confidence: string; source: string; editable: boolean; found: boolean; children: React.ReactNode }) {
  const [showSrc, setShowSrc] = useState(false)
  const [adding, setAdding] = useState(false)
  const cm = CONF_META[confidence] ?? CONF_META['n/a']
  // Not-found rules don't show an empty editable form — only what the sheet actually
  // contained. In edit mode a broker can still opt to add one manually.
  const show = found || adding
  return (
    <div className="rounded-lg border border-border bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-foreground">{title}</span>
            <span className={cn('text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded', cm.cls)}>{cm.label}</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">{blurb}</p>
        </div>
        {source && (
          <button type="button" onClick={() => setShowSrc(s => !s)} className="text-[10.5px] text-muted-foreground/50 hover:text-primary shrink-0 mt-0.5">{showSrc ? 'hide' : 'where?'}</button>
        )}
      </div>
      {showSrc && source && <p className="text-[10.5px] text-muted-foreground/60 mt-1.5 bg-muted/40 rounded px-2 py-1 break-words">Found in: {source}</p>}
      {/* Disabling the fieldset makes every control inside read-only when not editing. */}
      {show
        ? <fieldset disabled={!editable} className="mt-2.5 min-w-0">{children}</fieldset>
        : (
          <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted-foreground/60">
            <span>Not found in this calculator.</span>
            {editable && <button type="button" onClick={() => setAdding(true)} className="text-primary hover:underline">Add manually</button>}
          </div>
        )}
    </div>
  )
}

const pill = 'text-[12px] px-3 py-1.5 rounded-lg border font-medium'
const numInput = 'w-16 text-[12px] px-2 py-1 rounded border border-border focus:outline-none focus:border-primary/40'

function AgeBasisEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const cur = value === 'last birthday' || value === 'next birthday' ? value : ''
  const opts: [string, string][] = [['last birthday', 'Age last birthday'], ['next birthday', 'Age next birthday']]
  return (
    <div className="flex items-center gap-1.5">
      {opts.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={cn(pill, cur === v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30')}>{label}</button>
      ))}
      <button onClick={() => onChange(NOT_DETECTED)} className={cn(pill, cur === '' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-border text-muted-foreground/60 hover:border-amber-300')}>Not sure</button>
    </div>
  )
}

function GstEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const v = (value && typeof value === 'object') ? value as { treatment?: string; conversion_factor?: number | null } : {}
  const treatment = v.treatment === 'inclusive' || v.treatment === 'exclusive' ? v.treatment : ''
  const factor = typeof v.conversion_factor === 'number' ? v.conversion_factor : 1.09
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button onClick={() => onChange({ treatment: 'inclusive', conversion_factor: factor })} className={cn(pill, treatment === 'inclusive' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30')}>Rates include GST</button>
      <button onClick={() => onChange({ treatment: 'exclusive', conversion_factor: null })} className={cn(pill, treatment === 'exclusive' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30')}>Rates exclude GST (net)</button>
      {treatment === 'inclusive' && (
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground ml-1">
          divide by
          <input type="number" step="0.01" defaultValue={factor} onBlur={e => onChange({ treatment: 'inclusive', conversion_factor: Number(e.target.value) || 1.09 })} className={numInput} />
          <span className="text-muted-foreground/50">(9% GST = 1.09)</span>
        </span>
      )}
    </div>
  )
}

type Tier = { min_lives: number; factor: number }
function GroupDiscountEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const tiers: Tier[] = (value && typeof value === 'object' && Array.isArray((value as { tiers?: Tier[] }).tiers)) ? (value as { tiers: Tier[] }).tiers : []
  const set = (next: Tier[]) => onChange(next.length ? { tiers: next } : {})
  const pctOf = (f: number) => Math.round(Math.abs(f - 1) * 100)
  return (
    <div className="flex flex-col gap-1.5">
      {tiers.length === 0 && <p className="text-[11.5px] text-muted-foreground/60">No group-size adjustment.</p>}
      {tiers.map((t, i) => {
        const kind = t.factor >= 1 ? 'loading' : 'discount'
        return (
          <div key={i} className="flex items-center gap-1.5 text-[12px]">
            <span className="text-muted-foreground">From</span>
            <input type="number" defaultValue={t.min_lives} onBlur={e => { const n = [...tiers]; n[i] = { ...t, min_lives: Number(e.target.value) || 1 }; set(n) }} className={numInput} />
            <span className="text-muted-foreground">lives →</span>
            <select value={kind} onChange={e => { const p = pctOf(t.factor); const f = e.target.value === 'loading' ? 1 + p / 100 : 1 - p / 100; const n = [...tiers]; n[i] = { ...t, factor: f }; set(n) }} className="text-[12px] px-1.5 py-1 rounded border border-border">
              <option value="discount">discount</option><option value="loading">loading</option>
            </select>
            <input type="number" defaultValue={pctOf(t.factor)} onBlur={e => { const p = Number(e.target.value) || 0; const f = kind === 'loading' ? 1 + p / 100 : 1 - p / 100; const n = [...tiers]; n[i] = { ...t, factor: f }; set(n) }} className={numInput} />
            <span className="text-muted-foreground">%</span>
            <button onClick={() => set(tiers.filter((_, j) => j !== i))} className="text-muted-foreground/30 hover:text-rose-600 ml-1"><Trash2 size={13} /></button>
          </div>
        )
      })}
      <button onClick={() => set([...tiers, { min_lives: (tiers.at(-1)?.min_lives ?? 0) + 1, factor: 0.95 }])} className="inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline w-fit"><Plus size={12} /> Add a tier</button>
    </div>
  )
}

type Band = { band: [number, number] | null; text?: string }
function RenewalBandsEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const bands: Band[] = Array.isArray(value) ? value as Band[] : []
  const set = (next: Band[]) => onChange(next)
  return (
    <div className="flex flex-col gap-1.5">
      {bands.length === 0 && <p className="text-[11.5px] text-muted-foreground/60">No renewal-only ages.</p>}
      {bands.map((b, i) => {
        const from = b.band?.[0] ?? '', to = b.band?.[1] ?? ''
        return (
          <div key={i} className="flex items-center gap-1.5 text-[12px]">
            <span className="text-muted-foreground">Ages</span>
            <input type="number" placeholder="from" defaultValue={from === '' ? '' : from} onBlur={e => { const n = [...bands]; n[i] = { ...b, band: [Number(e.target.value) || 0, Number(to) || 999] }; set(n) }} className={numInput} />
            <span className="text-muted-foreground">to</span>
            <input type="number" placeholder="to" defaultValue={to === '' ? '' : to} onBlur={e => { const n = [...bands]; n[i] = { ...b, band: [Number(from) || 0, Number(e.target.value) || 999] }; set(n) }} className={numInput} />
            <span className="text-muted-foreground">— renewal only</span>
            {b.text && <span className="text-[10.5px] text-muted-foreground/50 truncate max-w-[220px]" title={b.text}>· {b.text}</span>}
            <button onClick={() => set(bands.filter((_, j) => j !== i))} className="text-muted-foreground/30 hover:text-rose-600 ml-1"><Trash2 size={13} /></button>
          </div>
        )
      })}
      <button onClick={() => set([...bands, { band: [65, 999] }])} className="inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline w-fit"><Plus size={12} /> Add an age range</button>
    </div>
  )
}

function OccClassEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const v = (value && typeof value === 'object') ? value as { excluded_classes?: (number | string)[]; classes_present?: number[] } : {}
  const excluded = new Set((v.excluded_classes ?? []).map(Number))
  const present = v.classes_present ?? []
  const toggle = (c: number) => {
    const next = new Set(excluded); next.has(c) ? next.delete(c) : next.add(c)
    onChange({ ...v, excluded_classes: Array.from(next).sort() })
  }
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4].map(c => (
          <button key={c} onClick={() => toggle(c)} className={cn(pill, excluded.has(c) ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-border text-muted-foreground hover:border-rose-300')}>Class {c}{excluded.has(c) ? ' ✕' : ''}</button>
        ))}
      </div>
      <p className="text-[10.5px] text-muted-foreground/50 mt-1.5">{excluded.size === 0 ? 'All classes eligible (tick a class to exclude it).' : `Excluded: Class ${Array.from(excluded).sort().join(', ')}.`}{present.length ? ` Classes seen in the sheet: ${present.join(', ')}.` : ''}</p>
    </div>
  )
}

type Dep = { coverage: string; requires: string }
function RiderEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const deps: Dep[] = Array.isArray(value) ? value as Dep[] : []
  const set = (next: Dep[]) => onChange(next)
  const ti = 'text-[12px] px-2 py-1 rounded border border-border focus:outline-none focus:border-primary/40 w-40'
  return (
    <div className="flex flex-col gap-1.5">
      {deps.length === 0 && <p className="text-[11.5px] text-muted-foreground/60">No dependencies.</p>}
      {deps.map((d, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[12px]">
          <input placeholder="coverage" defaultValue={d.coverage} onBlur={e => { const n = [...deps]; n[i] = { ...d, coverage: e.target.value }; set(n) }} className={ti} />
          <span className="text-muted-foreground">requires</span>
          <input placeholder="other coverage" defaultValue={d.requires} onBlur={e => { const n = [...deps]; n[i] = { ...d, requires: e.target.value }; set(n) }} className={ti} />
          <button onClick={() => set(deps.filter((_, j) => j !== i))} className="text-muted-foreground/30 hover:text-rose-600"><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={() => set([...deps, { coverage: '', requires: '' }])} className="inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline w-fit"><Plus size={12} /> Add a dependency</button>
    </div>
  )
}
