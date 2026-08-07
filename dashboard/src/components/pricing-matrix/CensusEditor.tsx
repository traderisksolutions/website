'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import type { CensusMember } from '@/lib/pm-quote'
import { ageAsOfToday, parseCensusCsv } from '@/lib/pm-census'

const REL = ['Self', 'Spouse', 'Child']
const inp = 'text-[12.5px] border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25'

/** The census input table — name/DOB (age auto-calculated)/relationship, CSV import — shared by the
 *  "New quote" wizard and editing an already-saved quote's census. */
export function CensusEditor({ census, setCensus }: { census: CensusMember[]; setCensus: Dispatch<SetStateAction<CensusMember[]>> }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-[1fr_130px_70px_110px_32px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground/70">
        <span>Name</span><span>Date of birth</span><span>Age</span><span>Relationship</span><span />
      </div>
      {census.map((m, i) => (
        <div key={i} className="grid grid-cols-[1fr_130px_70px_110px_32px] gap-2 px-3 py-1.5 border-t border-border/40 items-center">
          <input value={m.name ?? ''} onChange={e => setCensus(c => c.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Full name" className={inp} />
          <input type="date" value={m.date_of_birth ?? ''} onChange={e => { const dob = e.target.value || null; setCensus(c => c.map((x, j) => j === i ? { ...x, date_of_birth: dob, age: dob ? ageAsOfToday(dob) : x.age } : x)) }} className={inp} />
          <input type="number" value={m.age ?? ''} disabled={!!m.date_of_birth} onChange={e => setCensus(c => c.map((x, j) => j === i ? { ...x, age: e.target.value ? Number(e.target.value) : null } : x))} placeholder="—" className={`${inp} disabled:opacity-60 disabled:bg-muted/40`} title={m.date_of_birth ? 'Calculated from date of birth' : 'Used only if no date of birth'} />
          <select value={m.relationship ?? 'Self'} onChange={e => setCensus(c => c.map((x, j) => j === i ? { ...x, relationship: e.target.value } : x))} className={inp}>{REL.map(r => <option key={r}>{r}</option>)}</select>
          {census.length > 1 && <button onClick={() => setCensus(c => c.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600"><Trash2 size={13} /></button>}
        </div>
      ))}
      <div className="flex items-center gap-3 px-3 py-2 border-t border-border/40">
        <button onClick={() => setCensus(c => [...c, { name: '', relationship: 'Self', date_of_birth: null, age: null }])} className="text-[12px] text-primary flex items-center gap-1 hover:underline"><Plus size={12} /> add life</button>
        <label className="text-[12px] text-muted-foreground flex items-center gap-1 cursor-pointer hover:text-foreground">
          <Upload size={12} /> upload CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) setCensus(parseCensusCsv(await f.text())) }} />
        </label>
        <span className="text-[11px] text-muted-foreground/50 ml-auto">CSV headers: name, dob, age, relationship</span>
      </div>
    </div>
  )
}
