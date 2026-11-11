'use client'

/**
 * + New EB: one census file in, one analysis out. The file is read by rule (no model), the
 * company, start date, basis and current insurer are set here, and Analyse prices every package
 * at every insurer in one run and opens the report.
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud } from 'lucide-react'
import { Btn, Field, inputCls, Segmented } from '@/components/crm/primitives'
import { CompanyField, type CompanyPick } from './CompanyField'
import { fmtDate } from '@/lib/format'

type Member = { name: string; category: string; relationship: string; dob?: string | null; age?: number | null; occupation_class?: string | null }
type Read = { members: Member[]; unread: string[]; found: Record<string, string>; sheet: string | null; filename: string }

const INSURERS = ['AIA', 'Income', 'QBE', 'Raffles Health', 'Singlife']
const MUTED = '#4a5550'

function nextMonthFirst(): string {
  const t = new Date(Date.now() + 8 * 3600_000)
  const y = t.getUTCMonth() === 11 ? t.getUTCFullYear() + 1 : t.getUTCFullYear()
  const m = (t.getUTCMonth() + 1) % 12 + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

export function NewEb({ initialCompany, initialCompanyId }: { initialCompany?: string; initialCompanyId?: string | null }) {
  const router = useRouter()
  const [read, setRead] = useState<Read | null>(null)
  const [reading, setReading] = useState(false)
  const [pick, setPick] = useState<CompanyPick>({ id: initialCompanyId ?? null, name: initialCompany ?? '' })
  const [effDate, setEffDate] = useState(nextMonthFirst())
  const [basis, setBasis] = useState<'new_business' | 'renewal'>('renewal')
  const [current, setCurrent] = useState('')
  const [excluded, setExcluded] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setReading(true); setError(null); setRead(null)
    try {
      const fd = new FormData(); fd.append('file', f)
      const res = await fetch('/api/group-benefits/census/parse', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({})) as Partial<Read> & { error?: string }
      if (!res.ok || !Array.isArray(d.members)) { setError(d.error ?? `Could not read the file (${res.status}).`); return }
      setRead({ members: d.members, unread: d.unread ?? [], found: d.found ?? {}, sheet: d.sheet ?? null, filename: f.name })
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read the file.') }
    finally { setReading(false); e.target.value = '' }
  }

  async function analyse() {
    if (!read?.members.length) { setError('Read a census file first.'); return }
    if (!pick.name.trim()) { setError('Name the company.'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/group-benefits/analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ census: read.members, company_name: pick.name.trim(), company_id: pick.id, effective_date: effDate, basis, current_insurer: current || null, excluded }),
      })
      const d = await res.json().catch(() => ({})) as { quotation_id?: string; error?: string }
      if (!res.ok || !d.quotation_id) { setError(d.error ?? `The analysis did not run (${res.status}).`); setBusy(false); return }
      router.push(`/pricing-matrix/quote/${d.quotation_id}/analysis`)
    } catch (err) { setError(err instanceof Error ? err.message : 'The analysis did not run.'); setBusy(false) }
  }

  const employees = read?.members.filter(m => !/spouse|child|dependa/i.test(m.relationship)).length ?? 0
  const dependants = (read?.members.length ?? 0) - employees

  return (
    <div className="flex flex-col gap-6 max-w-[760px]">
      <div>
        <h2 className="m-0 text-[20px] font-medium tracking-[-0.01em]">New EB</h2>
        <p className="m-0 mt-1 text-[13.5px]" style={{ color: MUTED }}>A census file, a company and a start date. Every package is priced at every insurer in one run.</p>
      </div>

      <label className="flex items-center gap-3 rounded-[10px] px-4 py-3 cursor-pointer" style={{ border: '1px dashed #c9cfc7' }}>
        <UploadCloud size={18} style={{ color: MUTED }} />
        <span className="text-[13.5px]">{reading ? 'Reading…' : read ? `${read.filename} · ${read.members.length} members read${read.sheet ? ` from ${read.sheet}` : ''}` : 'Census file: .xlsx, .xls or .csv with a name and date of birth per person'}</span>
        <input type="file" accept=".csv,.txt,.xlsx,.xls" className="sr-only" onChange={onFile} disabled={reading || busy} />
      </label>
      {read && (
        <div className="text-[13px]" style={{ color: MUTED }}>
          {employees} employee{employees === 1 ? '' : 's'}{dependants ? ` · ${dependants} dependant${dependants === 1 ? '' : 's'}` : ''}
          {read.unread.length > 0 && <> · {read.unread.length} date{read.unread.length === 1 ? '' : 's'} not read</>}
          {Object.keys(read.found).length > 0 && <> · columns: {Object.entries(read.found).map(([k, v]) => `${k} ← ${v}`).join(', ')}</>}
          <div className="mt-2 overflow-x-auto">
            <table className="text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {read.members.slice(0, 5).map((m, i) => (
                  <tr key={i}><td className="pr-4 py-0.5">{m.name}</td><td className="pr-4 py-0.5">{m.relationship}</td><td className="pr-4 py-0.5">{m.dob ? fmtDate(m.dob) : m.age != null ? `age ${m.age}` : '—'}</td><td className="py-0.5">{m.category}</td></tr>
                ))}
                {read.members.length > 5 && <tr><td colSpan={4} className="py-0.5">… {read.members.length - 5} more</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CompanyField value={pick} onChange={setPick} allowCreate listId="neweb-company-options" />
        <Field label="Policy start date"><input id="neweb-start" type="date" value={effDate} onChange={e => setEffDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Basis"><Segmented size="sm" value={basis} onChange={setBasis} options={[{ value: 'renewal', label: 'Renewal' }, { value: 'new_business', label: 'New business' }]} /></Field>
        <Field label="Current insurer" hint="Priced on its renewal card; the others as new business">
          <select id="neweb-current" value={current} onChange={e => setCurrent(e.target.value)} className={inputCls}>
            <option value="">None or not known</option>
            {INSURERS.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Ruled out by the client" hint="Still priced and shown, greyed">
        <div className="flex flex-wrap gap-2">
          {INSURERS.map(i => {
            const on = excluded.includes(i)
            return <button key={i} type="button" aria-pressed={on} onClick={() => setExcluded(x => on ? x.filter(y => y !== i) : [...x, i])} className="h-8 px-3 rounded-[999px] text-[13px] cursor-pointer" style={{ border: '1px solid #d5d9d4', background: on ? '#f1f2ee' : 'white', color: on ? '#0f1412' : MUTED, textDecoration: on ? 'line-through' : 'none' }}>{i}</button>
          })}
        </div>
      </Field>

      {error && <p className="m-0 text-[13.5px]" style={{ color: '#a1242f' }} role="alert">{error}</p>}
      <div className="flex items-center gap-3">
        <Btn level="primary" onClick={analyse} loading={busy} disabled={!read || busy}>{busy ? 'Pricing five packages at every insurer…' : 'Analyse'}</Btn>
        {busy && <span className="text-[12.5px]" style={{ color: MUTED }}>About a minute.</span>}
      </div>
    </div>
  )
}
