'use client'

import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Plus, Trash2, Upload, Settings2, Pencil, Check, X } from 'lucide-react'
import type { CensusMember } from '@/lib/pm-quote'
import { ageAsOfToday, detectCsvColumns, parseCensusCsvWithMapping } from '@/lib/pm-census'
import type { CensusCsvField } from '@/lib/pm-census'
import { CsvMappingModal } from '@/components/pricing-matrix/CsvMappingModal'

const REL = ['Self', 'Spouse', 'Child']
const ADD_CUSTOM = '__add_custom__'
const inp = 'text-[12.5px] border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25'
const FALLBACK_DEFAULT = ['Director', 'Manager', 'Employee']

type Tier = { id: string; name: string; sort_order: number }

/** Classification tiers now persist per CLIENT COMPANY (pm_classification_tiers, see
 *  /api/pricing-matrix/classification-tiers) instead of one global app_settings list — a renewal
 *  quote for the same company reuses last year's custom tiers automatically. Before a company is
 *  picked (companyId null), tiers are a session-only default (nothing to persist to yet); "+ add
 *  custom" in that state stays local, matching the CompanyContactPicker-not-yet-picked convention
 *  used elsewhere in the wizard. */
function useClassificationTiers(companyId: string | null) {
  const [tiers, setTiers] = useState<Tier[]>(FALLBACK_DEFAULT.map((name, i) => ({ id: `local-${i}`, name, sort_order: i })))

  useEffect(() => {
    if (!companyId) return
    fetch(`/api/pricing-matrix/classification-tiers?company_id=${companyId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: Tier[]) => { if (Array.isArray(rows) && rows.length) setTiers(rows) })
  }, [companyId])

  async function addTier(name: string) {
    if (tiers.some(t => t.name === name)) return
    if (!companyId) { setTiers(t => [...t, { id: `local-${Date.now()}`, name, sort_order: t.length }]); return }
    const res = await fetch('/api/pricing-matrix/classification-tiers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: companyId, name }),
    })
    const row = res.ok ? await res.json() : null
    setTiers(t => row ? [...t, row] : t)
  }

  async function renameTier(id: string, name: string, onRenamed?: (oldName: string, newName: string) => void) {
    const old = tiers.find(t => t.id === id)
    if (!old || old.name === name) return
    setTiers(t => t.map(x => x.id === id ? { ...x, name } : x))
    onRenamed?.(old.name, name)
    if (!id.startsWith('local-')) await fetch(`/api/pricing-matrix/classification-tiers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).catch(() => {})
  }

  async function removeTier(id: string) {
    setTiers(t => t.filter(x => x.id !== id))
    if (!id.startsWith('local-')) await fetch(`/api/pricing-matrix/classification-tiers/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  return { tiers, addTier, renameTier, removeTier }
}

/** The census input table — name/DOB (age auto-calculated)/relationship/classification tier, CSV
 *  import with a column-mapping confirmation step — shared by the "New quote" wizard and editing
 *  an already-saved quote's census. `companyId` scopes the classification tier list to that CRM
 *  company (null before one is picked); `onRenameTier` lets the parent cascade a tier rename into
 *  its own category_overrides state, which CensusEditor has no visibility into. */
export function CensusEditor({ census, setCensus, companyId = null, onRenameTier }: {
  census: CensusMember[]; setCensus: Dispatch<SetStateAction<CensusMember[]>>
  companyId?: string | null
  onRenameTier?: (oldName: string, newName: string) => void
}) {
  const { tiers, addTier, renameTier, removeTier } = useClassificationTiers(companyId)
  const [csvPending, setCsvPending] = useState<{ text: string; headers: string[]; guesses: Record<CensusCsvField, number | null>; previewRows: string[][] } | null>(null)
  const [managingTiers, setManagingTiers] = useState(false)
  const [editingTierId, setEditingTierId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [newTierName, setNewTierName] = useState('')

  function onPickCsv(file: File) {
    file.text().then(text => {
      const { headers, guesses, previewRows } = detectCsvColumns(text)
      setCsvPending({ text, headers, guesses, previewRows })
    })
  }

  async function pickCategory(i: number, value: string) {
    if (value !== ADD_CUSTOM) {
      setCensus(c => c.map((x, j) => j === i ? { ...x, employee_category: value || null } : x))
      return
    }
    const custom = window.prompt('New classification tier (e.g. "Senior Management"):')?.trim()
    if (!custom) return
    await addTier(custom)
    setCensus(c => c.map((x, j) => j === i ? { ...x, employee_category: custom } : x))
  }

  function submitRename(id: string) {
    const name = editingValue.trim()
    setEditingTierId(null)
    if (!name) return
    renameTier(id, name, (oldName, newName) => {
      setCensus(c => c.map(m => m.employee_category === oldName ? { ...m, employee_category: newName } : m))
      onRenameTier?.(oldName, newName)
    })
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-[1fr_130px_70px_100px_140px_32px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground/70">
        <span>Name</span><span>Date of birth</span><span>Age</span><span>Relationship</span>
        <span className="flex items-center gap-1">Classification <button onClick={() => setManagingTiers(v => !v)} title="Manage classification tiers" className="text-muted-foreground/50 hover:text-foreground"><Settings2 size={11} /></button></span>
        <span />
      </div>

      {managingTiers && (
        <div className="px-3 py-2.5 bg-muted/20 border-b border-border/40 flex flex-col gap-1.5">
          {!companyId && <p className="text-[11px] text-muted-foreground/70">Pick a company above to save custom tiers for future quotes — for now, changes here are only for this quote.</p>}
          <div className="flex flex-wrap gap-1.5">
            {tiers.map(t => (
              <div key={t.id} className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5">
                {editingTierId === t.id ? (
                  <>
                    <input autoFocus value={editingValue} onChange={e => setEditingValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitRename(t.id); if (e.key === 'Escape') setEditingTierId(null) }}
                      className="text-[11.5px] w-24 bg-transparent focus:outline-none" />
                    <button onClick={() => submitRename(t.id)} className="text-emerald-600"><Check size={11} /></button>
                  </>
                ) : (
                  <>
                    <span className="text-[11.5px]">{t.name}</span>
                    <button onClick={() => { setEditingTierId(t.id); setEditingValue(t.name) }} className="text-muted-foreground/50 hover:text-foreground"><Pencil size={10} /></button>
                    <button onClick={() => removeTier(t.id)} className="text-muted-foreground/50 hover:text-rose-500"><X size={11} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input value={newTierName} onChange={e => setNewTierName(e.target.value)} placeholder="New tier name…"
              onKeyDown={e => { if (e.key === 'Enter' && newTierName.trim()) { addTier(newTierName.trim()); setNewTierName('') } }}
              className="text-[11.5px] border border-border rounded-md px-2 py-1 bg-background w-40" />
            <button onClick={() => { if (newTierName.trim()) { addTier(newTierName.trim()); setNewTierName('') } }} className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"><Plus size={10} /> Add</button>
          </div>
        </div>
      )}

      {census.map((m, i) => (
        <div key={i} className="grid grid-cols-[1fr_130px_70px_100px_140px_32px] gap-2 px-3 py-1.5 border-t border-border/40 items-center">
          <input value={m.name ?? ''} onChange={e => setCensus(c => c.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Full name" className={inp} />
          <input type="date" value={m.date_of_birth ?? ''} onChange={e => { const dob = e.target.value || null; setCensus(c => c.map((x, j) => j === i ? { ...x, date_of_birth: dob, age: dob ? ageAsOfToday(dob) : x.age } : x)) }} className={inp} />
          <input type="number" value={m.age ?? ''} disabled={!!m.date_of_birth} onChange={e => setCensus(c => c.map((x, j) => j === i ? { ...x, age: e.target.value ? Number(e.target.value) : null } : x))} placeholder="—" className={`${inp} disabled:opacity-60 disabled:bg-muted/40`} title={m.date_of_birth ? 'Calculated from date of birth' : 'Used only if no date of birth'} />
          <select value={m.relationship ?? 'Self'} onChange={e => setCensus(c => c.map((x, j) => j === i ? { ...x, relationship: e.target.value } : x))} className={inp}>{REL.map(r => <option key={r}>{r}</option>)}</select>
          <select value={m.employee_category ?? ''} onChange={e => pickCategory(i, e.target.value)} className={inp}>
            <option value="">—</option>
            {tiers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            <option value={ADD_CUSTOM}>+ add custom…</option>
          </select>
          {census.length > 1 && <button onClick={() => setCensus(c => c.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600"><Trash2 size={13} /></button>}
        </div>
      ))}
      <div className="flex items-center gap-3 px-3 py-2 border-t border-border/40">
        <button onClick={() => setCensus(c => [...c, { name: '', relationship: 'Self', date_of_birth: null, age: null }])} className="text-[12px] text-primary flex items-center gap-1 hover:underline"><Plus size={12} /> add life</button>
        <label className="text-[12px] text-muted-foreground flex items-center gap-1 cursor-pointer hover:text-foreground">
          <Upload size={12} /> upload CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPickCsv(f); e.target.value = '' }} />
        </label>
        <span className="text-[11px] text-muted-foreground/50 ml-auto">Click "upload CSV" to match your file's columns</span>
      </div>

      {csvPending && (
        <CsvMappingModal
          headers={csvPending.headers}
          guesses={csvPending.guesses}
          previewRows={csvPending.previewRows}
          onCancel={() => setCsvPending(null)}
          onConfirm={mapping => { setCensus(parseCensusCsvWithMapping(csvPending.text, mapping)); setCsvPending(null) }}
        />
      )}
    </div>
  )
}
