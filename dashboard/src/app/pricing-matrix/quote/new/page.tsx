'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, Trash2, Play, Upload } from 'lucide-react'
import { PmComparison } from '@/components/pricing-matrix/PmComparison'
import type { CensusMember, Selection, QuoteResult } from '@/lib/pm-quote'

type Avail = {
  id: string; insurer_name: string; effective_date: string | null; version: number
  coverage_lines: { code: string; label: string; fields: string[] }[]
  dropdowns: Record<string, string[]>
}
const REL = ['Self', 'Spouse', 'Child']
const inp = 'text-[12.5px] border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25'

async function safeJson<T>(r: Response): Promise<T & { error?: string }> {
  try { return await r.json() } catch { return { error: `HTTP ${r.status}` } as T & { error?: string } }
}
function parseCensus(text: string): CensusMember[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const head = lines[0].toLowerCase().split(',').map(s => s.trim())
  const ci = (n: string) => head.indexOf(n)
  const [ni, di, ai, ri] = [ci('name'), ci('dob') >= 0 ? ci('dob') : ci('date_of_birth'), ci('age'), ci('relationship')]
  return lines.slice(1).map(l => {
    const c = l.split(',').map(s => s.trim())
    return { name: ni >= 0 ? c[ni] : c[0], date_of_birth: di >= 0 ? (c[di] || null) : null, age: ai >= 0 && c[ai] ? Number(c[ai]) : null, relationship: ri >= 0 ? (c[ri] || 'Self') : 'Self' }
  })
}

export default function NewQuotePage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [company, setCompany] = useState('')
  const [effDate, setEffDate] = useState('2026-01-01')
  const [census, setCensus] = useState<CensusMember[]>([{ name: '', relationship: 'Self', date_of_birth: null, age: null }])
  const [avail, setAvail] = useState<Avail[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [result, setResult] = useState<QuoteResult | null>(null)
  const [quoteId, setQuoteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetch('/api/pricing-matrix/quote/available', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(setAvail) }, [])

  const namedCount = census.filter(m => (m.name ?? '').trim() || m.date_of_birth || m.age != null).length
  const selectedIds = useMemo(() => avail.filter(a => selected[a.id]).map(a => a.id), [avail, selected])

  function toggleInsurer(a: Avail) {
    setSelected(s => ({ ...s, [a.id]: !s[a.id] }))
    setSelections(prev => {
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
    setSelections(prev => ({ ...prev, [calcId]: { ...prev[calcId], [code]: { ...prev[calcId]?.[code], [field]: value } } }))

  async function run() {
    setBusy(true); setError(null)
    const res = await fetch('/api/pricing-matrix/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: company, effective_date: effDate, census, calculator_ids: selectedIds, selections }),
    })
    const d = await safeJson<{ id?: string; results?: QuoteResult }>(res)
    if (!res.ok || !d.results) setError(d.error ?? 'Quote failed')
    else { setResult(d.results); setQuoteId(d.id ?? null); setStep(2) }
    setBusy(false)
  }

  const steps = ['Census', 'Insurers & plans', 'Comparison']
  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Pricing Matrix</Link>
      <h1 className="text-[18px] font-semibold text-foreground mb-3">New quote</h1>

      <div className="flex items-center gap-2 text-[12px] mb-5">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full font-medium ${i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{i + 1}. {s}</span>
            {i < steps.length - 1 && <span className="text-muted-foreground/30">›</span>}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" className={inp} />
            <input type="date" value={effDate} onChange={e => setEffDate(e.target.value)} title="Policy effective date" className={inp} />
          </div>

          <div className="border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_130px_70px_110px_32px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground/70">
              <span>Name</span><span>Date of birth</span><span>Age</span><span>Relationship</span><span />
            </div>
            {census.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_130px_70px_110px_32px] gap-2 px-3 py-1.5 border-t border-border/40 items-center">
                <input value={m.name ?? ''} onChange={e => setCensus(c => c.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Full name" className={inp} />
                <input type="date" value={m.date_of_birth ?? ''} onChange={e => setCensus(c => c.map((x, j) => j === i ? { ...x, date_of_birth: e.target.value || null } : x))} className={inp} />
                <input type="number" value={m.age ?? ''} onChange={e => setCensus(c => c.map((x, j) => j === i ? { ...x, age: e.target.value ? Number(e.target.value) : null } : x))} placeholder="—" className={inp} title="Used only if no DOB" />
                <select value={m.relationship ?? 'Self'} onChange={e => setCensus(c => c.map((x, j) => j === i ? { ...x, relationship: e.target.value } : x))} className={inp}>{REL.map(r => <option key={r}>{r}</option>)}</select>
                {census.length > 1 && <button onClick={() => setCensus(c => c.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600"><Trash2 size={13} /></button>}
              </div>
            ))}
            <div className="flex items-center gap-3 px-3 py-2 border-t border-border/40">
              <button onClick={() => setCensus(c => [...c, { name: '', relationship: 'Self', date_of_birth: null, age: null }])} className="text-[12px] text-primary flex items-center gap-1 hover:underline"><Plus size={12} /> add life</button>
              <label className="text-[12px] text-muted-foreground flex items-center gap-1 cursor-pointer hover:text-foreground">
                <Upload size={12} /> upload CSV
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) setCensus(parseCensus(await f.text())) }} />
              </label>
              <span className="text-[11px] text-muted-foreground/50 ml-auto">CSV headers: name, dob, age, relationship</span>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setStep(1)} disabled={namedCount === 0} className="text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Next: insurers →</button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          {avail.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-8 text-center border border-dashed border-border rounded-xl">No approved calculators yet. Add + approve an insurer calculator first.</p>
          ) : avail.map(a => (
            <div key={a.id} className={`border rounded-xl p-3 ${selected[a.id] ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!selected[a.id]} onChange={() => toggleInsurer(a)} className="accent-primary" />
                <span className="text-[13.5px] font-semibold">{a.insurer_name}</span>
                <span className="text-[11px] text-muted-foreground/50">v{a.version}{a.effective_date ? ` · eff. ${a.effective_date}` : ''}</span>
              </label>
              {selected[a.id] && (
                <div className="mt-2.5 pl-6 flex flex-col gap-2">
                  {a.coverage_lines.map(l => (
                    <div key={l.code} className="flex items-center gap-2 flex-wrap text-[11.5px]">
                      <span className="w-40 text-muted-foreground/80">{l.label}</span>
                      {l.fields.map(f => {
                        const opts = a.dropdowns[`${l.code}.${f}`]
                        const val = selections[a.id]?.[l.code]?.[f] ?? ''
                        return (
                          <label key={f} className="flex items-center gap-1">
                            <span className="text-muted-foreground/50">{f}</span>
                            {opts?.length
                              ? <select value={val} onChange={e => setSel(a.id, l.code, f, e.target.value)} className="text-[11px] border border-border rounded px-1 py-0.5 bg-background"><option value="">—</option>{opts.map(o => <option key={o}>{o}</option>)}</select>
                              : <input value={val} onChange={e => setSel(a.id, l.code, f, e.target.value)} className="w-20 text-[11px] border border-border rounded px-1 py-0.5 bg-background" />}
                          </label>
                        )
                      })}
                    </div>
                  ))}
                  <p className="text-[10.5px] text-muted-foreground/40">Applied to all {namedCount} lives (dependants priced on their own age).</p>
                </div>
              )}
            </div>
          ))}
          <div className="flex justify-between">
            <button onClick={() => setStep(0)} className="text-[13px] px-4 py-1.5 rounded-lg border border-border hover:bg-muted">← Back</button>
            <button onClick={run} disabled={busy || selectedIds.length === 0 || !effDate} title={!effDate ? 'Set a policy effective date (Census step) — ages are computed from it' : ''} className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{busy ? 'Running…' : `Run ${selectedIds.length} insurer${selectedIds.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {step === 2 && result && (
        <div className="flex flex-col gap-4">
          <PmComparison result={result} />
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="text-[13px] px-4 py-1.5 rounded-lg border border-border hover:bg-muted">← Adjust</button>
            <button onClick={() => router.push(quoteId ? `/pricing-matrix/quote/${quoteId}` : '/pricing-matrix/quote')} className="text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
              Downloads &amp; recommendation →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
