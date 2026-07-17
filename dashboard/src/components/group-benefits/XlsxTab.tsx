'use client'

import React, { useState } from 'react'
import { UploadCloud, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, ChevronDown, ChevronRight } from 'lucide-react'
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
        Attach each insurer&apos;s Excel calculator to its rate table. We read the workbook and extract the
        <span className="font-medium text-foreground/70"> calculation rules</span> — age basis, GST, group-size discount,
        renewal-only bands, rider dependencies, occupation class — with a source citation each. Rate numbers still come from the rate PDF.
      </p>
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
                      <RulesPanel tableId={t.id} onChanged={onChanged} />
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
  const [saving, setSaving] = useState<'save' | 'approve' | null>(null)
  const [loading, setLoading] = useState(true)

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

  function setRuleValue(rule: string, raw: string) {
    // Accept JSON where it parses (objects/arrays/numbers), else keep the raw string.
    let v: unknown = raw
    try { v = JSON.parse(raw) } catch { /* plain string */ }
    setRules(prev => ({ ...prev, [rule]: v }))
  }

  async function save(approve: boolean) {
    setSaving(approve ? 'approve' : 'save')
    const res = await fetch(`/api/group-benefits/rate-tables/${tableId}/calculator`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules, approved: approve }),
    })
    setSaving(null)
    if (res.ok) { setStatus(approve ? 'approved' : 'in_review'); onChanged() }
  }

  if (loading) return <div className="px-6 py-4 bg-muted/20"><Loader2 size={15} className="animate-spin text-muted-foreground" /></div>

  const notDetectedCount = (log ?? []).filter(e => typeof e.value === 'string' && (e.value as string).startsWith('NOT DETECTED')).length

  return (
    <div className="px-6 py-5 bg-muted/20 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[12.5px] font-bold text-foreground uppercase tracking-wide">Detected calculation rules</h4>
        <div className="flex items-center gap-2">
          {status === 'approved'
            ? <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-700"><CheckCircle2 size={13} /> Approved</span>
            : notDetectedCount > 0 && <span className="inline-flex items-center gap-1 text-[11.5px] text-amber-700"><AlertTriangle size={13} /> {notDetectedCount} need input</span>}
          <button onClick={() => save(false)} disabled={!!saving} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-border hover:bg-white disabled:opacity-50">{saving === 'save' ? 'Saving…' : 'Save'}</button>
          <button onClick={() => save(true)} disabled={!!saving} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving === 'approve' ? 'Approving…' : 'Approve rules'}</button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mb-3 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {warnings.map((w, i) => <p key={i} className="m-0">{w}</p>)}
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden bg-white">
        <table className="data-table w-full border-collapse text-[12px]">
          <thead><tr>
            <th className="pl-4 text-left w-[150px]">Rule</th><th className="text-left">Value (editable)</th><th className="text-left w-[90px]">Confidence</th><th className="text-left">Source</th>
          </tr></thead>
          <tbody>
            {(log ?? []).map(e => {
              const val = rules[e.rule]
              const missing = typeof val === 'string' && (val as string).startsWith('NOT DETECTED')
              const asText = typeof val === 'string' ? val : JSON.stringify(val)
              return (
                <tr key={e.rule} className={cn(missing && 'bg-amber-50/60')}>
                  <td className="pl-4 font-medium text-foreground/80 align-top py-2 capitalize">{e.rule.replace(/_/g, ' ')}</td>
                  <td className="align-top py-2">
                    <textarea defaultValue={missing ? '' : asText} placeholder={missing ? NOT_DETECTED : ''}
                      onBlur={ev => setRuleValue(e.rule, ev.target.value.trim())}
                      rows={asText.length > 60 ? 3 : 1}
                      className={cn('w-full text-[11.5px] font-mono px-2 py-1 rounded border bg-white focus:outline-none focus:border-primary/40 resize-y',
                        missing ? 'border-amber-300 placeholder:text-amber-600' : 'border-border')} />
                  </td>
                  <td className="align-top py-2"><span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                    e.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' : e.confidence === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground')}>{e.confidence}</span></td>
                  <td className="align-top py-2 text-muted-foreground/70 text-[11px] max-w-[280px] break-words">{e.source_cell_or_text}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10.5px] text-muted-foreground/60">Values accept JSON (objects/arrays/numbers) or plain text. Fix any amber &ldquo;need input&rdquo; rows, then Approve to attach these rules to the rate table.</p>
    </div>
  )
}
