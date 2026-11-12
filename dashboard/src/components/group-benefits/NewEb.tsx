'use client'

/**
 * New quotation (Quotes › Employment Benefits › New quotation), in two stages a broker controls.
 *
 * Documents: the company (the shared search box: pick, or + Add as a new company), then two boxes
 * side by side. Census: a file uploaded, or a spreadsheet from the company's emails, read in full
 * (every tab; the password asked for when the file is protected). Last year's policy and premium:
 * the schedule, endorsements and debit note, uploaded or picked from the emails. Under them, the
 * brochures every price comes from, each opening in Drive.
 *
 * Review: the census tabs to price, last year's policy as read (plans per category, premium per
 * cover, the changes endorsements made), the details, and what each census plan means as numbers,
 * filled from last year's policy where the plan numbers match. Confirm prices the current cover and
 * one change at a time at every insurer, measured against last year's premium, and opens the report.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { Btn, Field, inputCls, Segmented } from '@/components/crm/primitives'
import { CompanyField, type CompanyPick } from './CompanyField'
import { fmtDate, money } from '@/lib/format'
import { ALL, COVER_WORD, lifeOf, planValues, SCHEDULE_COVERS, type HospitalFacts, type LifeFacts, type Schedule, type ScheduleCover } from '@/lib/gb/current'
import { LAST_YEAR_COVERS, LAST_YEAR_COVER_WORD, scheduleFromLastYear, type LastYear } from '@/lib/gb/last-year'
import type { Member } from '@/lib/gb-quote'
import type { SheetRead } from '@/lib/gb/census-parse'
import type { CensusSource } from '@/app/api/group-benefits/census/sources/route'
import type { BrochureRow } from '@/lib/gb/brochures'

const INSURERS = ['AIA', 'Income', 'QBE', 'Raffles Health', 'Singlife']
const MUTED = '#4a5550', INK = '#0f1412', FIELD = '#f1f2ee', LINE = '#e6e8e4', GREEN = '#132c1c', PILL = '#e3efe6', PILL_FG = '#1d4a2c'

function nextMonthFirst(): string {
  const t = new Date(Date.now() + 8 * 3600_000)
  const y = t.getUTCMonth() === 11 ? t.getUTCFullYear() + 1 : t.getUTCFullYear()
  const m = (t.getUTCMonth() + 1) % 12 + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}
const dayAfter = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }
const insurerOf = (name: string | null | undefined) => { const n = (name ?? '').toLowerCase(); return INSURERS.find(i => n.includes(i.toLowerCase().split(' ')[0])) ?? (/steadfast|mcare/.test(n) ? 'QBE' : /rcc|raffles/.test(n) ? 'Raffles Health' : '') }

const DEFAULT_GHS: HospitalFacts = { hospital: 'private', beds: 4, limitKind: 'per_disability', limit: 15_000, coins: 0 }
const emptySchedule = (): Schedule => ({ GHS: {}, EMM: {}, GOPC: {}, GOSC: {}, GD: {}, GTL: {} })
type Source = { name: string; upload?: File; attachmentId?: string }
type Stage = 'documents' | 'review'
const STEPS = ['Documents', 'Review', 'Anchor', 'Compare', 'Options', 'Deliver'] as const

function Steps({ at, onDocuments }: { at: Stage; onDocuments: () => void }) {
  const idx = at === 'documents' ? 0 : 1
  return (
    <ol className="m-0 p-0 list-none flex flex-wrap gap-1.5" aria-label="Steps">
      {STEPS.map((s, i) => {
        const on = i === idx, done = i < idx
        const style = { background: on ? GREEN : done ? PILL : FIELD, color: on ? 'white' : done ? PILL_FG : MUTED }
        return <li key={s}>{done && s === 'Documents'
          ? <button type="button" onClick={onDocuments} className="h-7 px-3 rounded-full text-[12.5px] border-0 cursor-pointer" style={style}>{s}</button>
          : <span className="inline-flex items-center h-7 px-3 rounded-full text-[12.5px]" style={style} aria-current={on ? 'step' : undefined}>{s}</span>}</li>
      })}
    </ol>
  )
}

function FileRow({ name, meta, action }: { name: string; meta?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-[13.5px]" style={{ border: `1px solid ${LINE}`, background: 'white' }}>
      <span className="min-w-0"><span className="block truncate" style={{ color: INK }}>{name}</span>{meta && <span className="block text-[12px]" style={{ color: MUTED }}>{meta}</span>}</span>
      {action}
    </div>
  )
}

function DropZone({ id, label, accept, multiple, disabled, onFiles }: { id: string; label: string; accept: string; multiple?: boolean; disabled?: boolean; onFiles: (f: File[]) => void }) {
  return (
    <label htmlFor={id} className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] px-4 py-6 cursor-pointer text-center" style={{ background: FIELD, color: MUTED }}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const fs = [...e.dataTransfer.files]; if (fs.length) onFiles(multiple ? fs : fs.slice(0, 1)) }}>
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full" style={{ background: GREEN, color: 'white' }}><Plus size={18} /></span>
      <span className="text-[13.5px]" style={{ color: INK }}>{label}</span>
      <span className="text-[12px]">{accept.split(',').join(' · ')}</span>
      <input id={id} type="file" accept={accept} multiple={multiple} className="sr-only" disabled={disabled} onChange={e => { const fs = [...(e.target.files ?? [])]; if (fs.length) onFiles(fs); e.target.value = '' }} />
    </label>
  )
}

export function NewEb({ initialCompany, initialCompanyId, threadId }: { initialCompany?: string; initialCompanyId?: string | null; threadId?: string | null }) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('documents')
  const [pick, setPick] = useState<CompanyPick>({ id: initialCompanyId ?? null, name: initialCompany ?? '' })
  const [sources, setSources] = useState<CensusSource[]>([])
  const [policyDocs, setPolicyDocs] = useState<CensusSource[]>([])
  const [brochures, setBrochures] = useState<BrochureRow[] | null>(null)
  const [prior, setPrior] = useState<Schedule | null>(null)
  const [reading, setReading] = useState(false)
  const [file, setFile] = useState<Source | null>(null)
  const [needsPassword, setNeedsPassword] = useState<{ wrong: boolean } | null>(null)
  const [password, setPassword] = useState('')
  const [sheets, setSheets] = useState<SheetRead[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [uploads, setUploads] = useState<File[]>([])
  const [docIds, setDocIds] = useState<Set<string>>(new Set())
  const [lastYear, setLastYear] = useState<LastYear | null>(null)
  const [readingPolicy, setReadingPolicy] = useState(false)
  const [effDate, setEffDate] = useState(nextMonthFirst())
  const [basis, setBasis] = useState<'new_business' | 'renewal'>('renewal')
  const [current, setCurrent] = useState('')
  const [excluded, setExcluded] = useState<string[]>([])
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The company's emails: spreadsheets for the census, PDFs for last year's policy.
  useEffect(() => {
    if (!threadId && !pick.id) { setSources([]); setPolicyDocs([]); return }
    const q = new URLSearchParams(); if (threadId) q.set('thread', threadId); if (pick.id) q.set('company', pick.id)
    let cancelled = false
    fetch(`/api/group-benefits/census/sources?${q}`, { cache: 'no-store' }).then(r => r.json()).then((d: { sources?: CensusSource[]; documents?: CensusSource[]; companyId?: string | null; companyName?: string | null; schedule?: Schedule | null; currentInsurer?: string | null }) => {
      if (cancelled) return
      setSources(d.sources ?? []); setPolicyDocs(d.documents ?? [])
      setPrior(d.schedule ?? null)
      if (d.companyName) setPick(p => p.name ? p : { id: d.companyId ?? null, name: d.companyName! })
      if (d.currentInsurer) setCurrent(c => c || insurerOf(d.currentInsurer))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [threadId, pick.id])

  useEffect(() => {
    fetch('/api/group-benefits/brochures', { cache: 'no-store' }).then(r => r.json()).then((d: { rows?: BrochureRow[] }) => setBrochures(d.rows ?? [])).catch(() => setBrochures([]))
  }, [])

  async function readCensus(f: Source, pw?: string) {
    setReading(true); setError(null); setSheets(null); setFile(f)
    try {
      let res: Response
      if (f.upload) { const fd = new FormData(); fd.append('file', f.upload); if (pw) fd.append('password', pw); res = await fetch('/api/group-benefits/census/read', { method: 'POST', body: fd }) }
      else res = await fetch('/api/group-benefits/census/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachment_id: f.attachmentId, password: pw || undefined }) })
      const d = await res.json().catch(() => ({})) as { sheets?: SheetRead[]; needsPassword?: boolean; wrongPassword?: boolean; passwordHint?: string | null; error?: string }
      if (d.needsPassword) { setNeedsPassword({ wrong: !!d.wrongPassword }); if (d.passwordHint && !pw) setPassword(d.passwordHint); return }
      if (!res.ok || !d.sheets) { setError(d.error ?? `The census could not be read (${res.status}).`); return }
      setNeedsPassword(null)
      setSheets(d.sheets)
      setPicked(new Set(d.sheets.filter(s => s.members.length > 0).map(s => s.sheet)))
    } catch (e) { setError(e instanceof Error ? e.message : 'The census could not be read.') }
    finally { setReading(false) }
  }

  const policyCount = uploads.length + docIds.size

  async function readDocuments() {
    if (!pick.name.trim()) { setError('Pick the company, or add it.'); return }
    if (!sheets) { setError('Add the census.'); return }
    setError(null)
    if (policyCount) {
      setReadingPolicy(true)
      try {
        const fd = new FormData()
        for (const f of uploads) fd.append('files', f)
        for (const id of docIds) fd.append('attachment_ids', id)
        const res = await fetch('/api/group-benefits/last-year/read', { method: 'POST', body: fd })
        const d = await res.json().catch(() => ({})) as { read?: LastYear; skipped?: string[]; error?: string }
        if (!res.ok || !d.read) { setError(d.error ?? `Last year's policy could not be read (${res.status}).`); return }
        const ly = d.read
        setLastYear(ly)
        if (ly.periodTo) setEffDate(dayAfter(ly.periodTo))
        setBasis('renewal')
        if (ly.insurer || ly.product) setCurrent(insurerOf(`${ly.insurer ?? ''} ${ly.product ?? ''}`) || current)
      } catch (e) { setError(e instanceof Error ? e.message : "Last year's policy could not be read."); return }
      finally { setReadingPolicy(false) }
    }
    setStage('review'); window.scrollTo({ top: 0 })
  }

  const members: Member[] = useMemo(() => (sheets ?? []).filter(s => picked.has(s.sheet)).flatMap(s => s.members), [sheets, picked])
  const values = useMemo(() => planValues(members), [members])

  // The schedule: what was set here, else last year's policy, else what was confirmed last time, else a default.
  useEffect(() => {
    if (!members.length) return
    const fromPolicy = lastYear ? scheduleFromLastYear(lastYear, values) : {}
    setSchedule(prev => {
      const next = emptySchedule()
      for (const c of SCHEDULE_COVERS) for (const { value } of values[c]) {
        const had = (prev[c] as Record<string, unknown>)[value] ?? (fromPolicy[c] as Record<string, unknown> | undefined)?.[value] ?? (prior?.[c] as Record<string, unknown> | undefined)?.[value]
        if (had !== undefined) { (next[c] as Record<string, unknown>)[value] = had; continue }
        if (c === 'GHS') next.GHS[value] = /fw|foreign/i.test(value) ? { hospital: 'government', beds: 4, limitKind: 'per_disability', limit: 15_000, coins: 0, foreignWorker: true } : { ...DEFAULT_GHS }
        else if (c === 'GTL') next.GTL[value] = value === ALL ? { kind: 'sum', n: 100_000 } : lifeOf(value)
        else if (c === 'GOPC') next.GOPC[value] = 0
        else if (c === 'EMM') next.EMM[value] = 60_000
        else if (c === 'GOSC') next.GOSC[value] = 1_000
        else next.GD[value] = 500
      }
      return next
    })
  }, [values, prior, lastYear, members.length])

  async function analyse() {
    if (!members.length) { setError('Pick at least one tab with people on it.'); return }
    if (!pick.name.trim()) { setError('Name the company.'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/group-benefits/analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ census: members, schedule, company_name: pick.name.trim(), company_id: pick.id, effective_date: effDate, basis, current_insurer: current || null, excluded, last_year: lastYear,
          source: threadId ? { label: 'Thread', href: `/engagement?lead=${threadId}` } : undefined }),
      })
      const d = await res.json().catch(() => ({})) as { quotation_id?: string; error?: string }
      if (!res.ok || !d.quotation_id) { setError(d.error ?? `The analysis did not run (${res.status}).`); setBusy(false); return }
      router.push(`/pricing-matrix/quote/${d.quotation_id}/analysis`)
    } catch (e) { setError(e instanceof Error ? e.message : 'The analysis did not run.'); setBusy(false) }
  }

  const employees = members.filter(m => m.relationship === 'self').length
  const lives = (sheets ?? []).filter(s => picked.has(s.sheet)).reduce((n, s) => n + s.members.length, 0)
  const companyWord = pick.name.trim() ? `${pick.name.trim()}'s emails` : 'The company’s emails'

  return (
    <div className="flex flex-col gap-7">
      <Steps at={stage} onDocuments={() => setStage('documents')} />

      {stage === 'documents' && (<>
        <div className="max-w-[560px]">
          <CompanyField value={pick} onChange={setPick} allowCreate listId="neweb-company-options" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="flex flex-col gap-3 rounded-[12px] p-5 min-w-0" style={{ border: `1.5px dashed ${LINE}` }} aria-labelledby="neweb-census">
            <h3 id="neweb-census" className="m-0 text-[15px] font-medium">Census</h3>
            <DropZone id="neweb-file" label={reading ? 'Reading every tab…' : 'Add census'} accept=".xlsx,.xls,.xlsm,.csv" disabled={reading || busy} onFiles={fs => void readCensus({ name: fs[0].name, upload: fs[0] })} />
            {file && sheets && <FileRow name={file.name} meta={`${sheets.length} ${sheets.length === 1 ? 'tab' : 'tabs'} · ${sheets.reduce((n, s) => n + s.members.length, 0)} lives`} action={<span className="text-[11.5px] px-2 py-0.5 rounded-full" style={{ background: PILL, color: PILL_FG }}>Read</span>} />}
            {needsPassword && file && (
              <div className="flex items-end gap-2 flex-wrap">
                <Field label={needsPassword.wrong ? 'That password does not open the file' : 'This file is password-protected'} hint={password ? 'The password the email states is filled in' : undefined}>
                  <input id="neweb-password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="Password" />
                </Field>
                <Btn level="primary" onClick={() => readCensus(file, password)} loading={reading}>Open</Btn>
              </div>
            )}
            {sources.length > 0 && (<>
              <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>On {companyWord}</p>
              {sources.slice(0, 8).map(s => (
                <FileRow key={s.attachment_id} name={s.filename} meta={`${fmtDate(s.at)}${s.subject ? ` · ${s.subject}` : ''}`}
                  action={<Btn size="sm" level={file?.attachmentId === s.attachment_id ? 'primary' : 'secondary'} disabled={reading || busy} onClick={() => readCensus({ name: s.filename, attachmentId: s.attachment_id })}>{file?.attachmentId === s.attachment_id ? 'Added' : 'Add'}</Btn>} />
              ))}
            </>)}
          </section>

          <section className="flex flex-col gap-3 rounded-[12px] p-5 min-w-0" style={{ border: `1.5px dashed ${LINE}` }} aria-labelledby="neweb-policy">
            <h3 id="neweb-policy" className="m-0 text-[15px] font-medium">Last year&apos;s policy and premium</h3>
            <DropZone id="neweb-policy-files" label="Add policy documents" accept=".pdf,.png,.jpg,.jpeg,.xlsx" multiple disabled={readingPolicy || busy} onFiles={fs => setUploads(u => [...u, ...fs].slice(0, 12))} />
            {uploads.map((f, i) => (
              <FileRow key={`${f.name}-${i}`} name={f.name} meta={`${Math.max(1, Math.round(f.size / 1024))} KB`}
                action={<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setUploads(u => u.filter((_, j) => j !== i))} className="bg-transparent border-0 p-1 cursor-pointer" style={{ color: MUTED }}><X size={15} /></button>} />
            ))}
            {policyDocs.length > 0 && (<>
              <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>On {companyWord}</p>
              {policyDocs.slice(0, 10).map(s => { const on = docIds.has(s.attachment_id); return (
                <FileRow key={s.attachment_id} name={s.filename} meta={`${fmtDate(s.at)}${s.subject ? ` · ${s.subject}` : ''}`}
                  action={<Btn size="sm" level={on ? 'primary' : 'secondary'} disabled={readingPolicy || busy} onClick={() => setDocIds(d => { const n = new Set(d); if (on) n.delete(s.attachment_id); else n.add(s.attachment_id); return n })}>{on ? 'Added' : 'Add'}</Btn>} />
              ) })}
            </>)}
          </section>
        </div>

        <section className="flex flex-col gap-2" aria-labelledby="neweb-brochures">
          <h3 id="neweb-brochures" className="m-0 text-[15px] font-medium">Brochures</h3>
          {brochures === null ? <p className="m-0 text-[13px]" style={{ color: MUTED }}>Loading…</p> : brochures.length === 0 ? <p className="m-0 text-[13px]" style={{ color: MUTED }}>The Drive folder could not be read.</p> : (
            <div className="overflow-x-auto">
              <table className="trs-table text-[13.5px] w-full" style={{ borderCollapse: 'collapse', minWidth: 640 }}>
                <thead><tr><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-left">Brochure</th><th className="px-3 py-2 text-left">Year</th><th className="px-3 py-2 text-left">Rates from</th></tr></thead>
                <tbody>
                  {brochures.map(b => (
                    <tr key={b.product} style={{ borderTop: `1px solid ${LINE}` }}>
                      <td className="px-3 py-1.5">{b.product}</td>
                      <td className="px-3 py-1.5">{b.brochure?.url ? <a href={b.brochure.url} target="_blank" rel="noopener" style={{ color: INK }}>{b.brochure.name}</a> : <span style={{ color: MUTED }}>Not in Drive</span>}</td>
                      <td className="px-3 py-1.5">{b.brochure?.year ?? '—'}</td>
                      <td className="px-3 py-1.5">{b.rates?.url ? <a href={b.rates.url} target="_blank" rel="noopener" style={{ color: INK }}>{b.rates.name}</a> : <span style={{ color: MUTED }}>Brochure rate table</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {error && <p className="m-0 text-[13.5px]" style={{ color: '#a1242f' }} role="alert">{error}</p>}
        <div className="flex items-center gap-3">
          <Btn level="primary" onClick={readDocuments} loading={readingPolicy} disabled={!sheets || !pick.name.trim() || reading || readingPolicy}>
            {readingPolicy ? `Reading ${policyCount} ${policyCount === 1 ? 'document' : 'documents'}…` : policyCount ? 'Read documents' : 'Continue without last year'}
          </Btn>
        </div>
      </>)}

      {stage === 'review' && (<>
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-[15px] font-medium">Census · {pick.name}</h3>
          <div className="overflow-x-auto">
            <table className="trs-table text-[13.5px]" style={{ borderCollapse: 'collapse', minWidth: 560 }}>
              <thead><tr><th className="px-3 py-2 text-left" /><th className="px-3 py-2 text-left">Tab</th><th className="px-3 py-2 text-right">Employees</th><th className="px-3 py-2 text-right">Dependants</th><th className="px-3 py-2 text-left">Plan columns</th></tr></thead>
              <tbody>
                {(sheets ?? []).map(s => (
                  <tr key={s.sheet} style={{ borderTop: `1px solid ${LINE}`, color: s.members.length ? INK : MUTED }}>
                    <td className="px-3 py-1.5"><input id={`tab-${s.sheet}`} type="checkbox" aria-label={`Price tab ${s.sheet}`} disabled={!s.members.length} checked={picked.has(s.sheet)} onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(s.sheet); else n.delete(s.sheet); return n })} /></td>
                    <td className="px-3 py-1.5">{s.sheet}{!s.members.length ? <span className="text-[12px]" style={{ color: MUTED }}> · no people read</span> : null}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{s.employees}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{s.dependants}</td>
                    <td className="px-3 py-1.5 text-[12.5px]" style={{ color: MUTED }}>{s.planCovers.join(', ') || '—'}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: `1px solid ${LINE}`, fontWeight: 600 }}><td /><td className="px-3 py-1.5">Picked</td><td className="px-3 py-1.5 text-right tabular-nums">{employees}</td><td className="px-3 py-1.5 text-right tabular-nums">{members.length - employees}</td><td className="px-3 py-1.5 text-[12.5px]">{lives} lives</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {lastYear ? <LastYearPanel ly={lastYear} onChange={setLastYear} /> : (
          <section className="flex flex-col gap-1">
            <h3 className="m-0 text-[15px] font-medium">Last year&apos;s policy</h3>
            <p className="m-0 text-[13.5px]" style={{ color: MUTED }}>None added. The report prices the current cover without last year&apos;s premium.</p>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h3 className="m-0 text-[15px] font-medium">Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Policy start date"><input id="neweb-start" type="date" value={effDate} onChange={e => setEffDate(e.target.value)} className={inputCls} /></Field>
            <Field label="Basis"><Segmented size="sm" value={basis} onChange={setBasis} options={[{ value: 'renewal', label: 'Renewal' }, { value: 'new_business', label: 'New business' }]} /></Field>
            <Field label="Current insurer">
              <select id="neweb-current" value={current} onChange={e => setCurrent(e.target.value)} className={inputCls}>
                <option value="">None or not known</option>
                {INSURERS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Ruled out by the client">
            <div className="flex flex-wrap gap-2">
              {INSURERS.map(i => { const on = excluded.includes(i); return <button key={i} type="button" aria-pressed={on} onClick={() => setExcluded(x => on ? x.filter(y => y !== i) : [...x, i])} className="h-8 px-3 rounded-[999px] text-[13px] cursor-pointer" style={{ border: '1px solid #d5d9d4', background: on ? FIELD : 'white', color: on ? INK : MUTED, textDecoration: on ? 'line-through' : 'none' }}>{i}</button> })}
            </div>
          </Field>
        </section>

        {members.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="m-0 text-[15px] font-medium">Current cover</h3>
            <ScheduleEditor values={values} schedule={schedule} onChange={setSchedule} />
          </section>
        )}

        {error && <p className="m-0 text-[13.5px]" style={{ color: '#a1242f' }} role="alert">{error}</p>}
        <div className="flex items-center gap-3">
          <Btn level="primary" onClick={analyse} loading={busy} disabled={busy || !members.length}>{busy ? 'Pricing every insurer…' : `Confirm and price ${members.length} lives`}</Btn>
        </div>
      </>)}
    </div>
  )
}

/** Last year's policy as read, every figure editable; premium by cover checked against the total. */
function LastYearPanel({ ly, onChange }: { ly: LastYear; onChange: (ly: LastYear) => void }) {
  const covers = LAST_YEAR_COVERS.filter(c => ly.premiumByCover[c] != null || ly.categories.some(k => k.plans[c]))
  const sum = Object.values(ly.premiumByCover).reduce((a, b) => a + (b ?? 0), 0)
  const setPremium = (c: typeof covers[number], v: number | null) => {
    const p = { ...ly.premiumByCover }; if (v == null) delete p[c]; else p[c] = v
    const s = Object.values(p).reduce((a, b) => a + (b ?? 0), 0)
    onChange({ ...ly, premiumByCover: p, sumMatches: ly.total != null && Object.keys(p).length ? Math.abs(s - ly.total) <= Math.max(1, Object.keys(p).length) : null })
  }
  return (
    <section className="flex flex-col gap-3">
      <h3 className="m-0 text-[15px] font-medium">Last year&apos;s policy</h3>
      <div className="text-[13.5px] flex flex-wrap gap-x-6 gap-y-1">
        <span>{[ly.insurer, ly.product].filter(Boolean).join(' · ') || 'Insurer not stated'}</span>
        {ly.policyNumber && <span style={{ color: MUTED }}>Policy {ly.policyNumber}</span>}
        {(ly.periodFrom || ly.periodTo) && <span style={{ color: MUTED }}>{ly.periodFrom ? fmtDate(ly.periodFrom) : '?'} – {ly.periodTo ? fmtDate(ly.periodTo) : '?'}</span>}
        {ly.lives != null && <span style={{ color: MUTED }}>{ly.lives} lives</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="trs-table text-[13.5px]" style={{ borderCollapse: 'collapse', minWidth: 560 }}>
          <thead><tr><th className="px-3 py-2 text-left">Cover</th>{ly.categories.map(c => <th key={c.name} className="px-3 py-2 text-left">{c.name}</th>)}<th className="px-3 py-2 text-right">Premium S$</th></tr></thead>
          <tbody>
            {covers.map(c => (
              <tr key={c} style={{ borderTop: `1px solid ${LINE}` }}>
                <td className="px-3 py-1.5 whitespace-nowrap">{LAST_YEAR_COVER_WORD[c]}</td>
                {ly.categories.map(k => <td key={k.name} className="px-3 py-1.5">{k.plans[c] ?? <span style={{ color: MUTED }}>—</span>}</td>)}
                <td className="px-3 py-1 text-right">
                  <input id={`ly-premium-${c}`} aria-label={`${LAST_YEAR_COVER_WORD[c]} premium`} inputMode="decimal" value={ly.premiumByCover[c] ?? ''} placeholder="Not stated"
                    onChange={e => { const t = e.target.value.trim(); const n = Number(t.replace(/[^0-9.]/g, '')); setPremium(c, t === '' || !Number.isFinite(n) ? null : n) }}
                    className={`${inputCls} max-w-[130px] text-right tabular-nums`} />
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: `1px solid ${LINE}`, fontWeight: 600 }}>
              <td className="px-3 py-1.5">Total</td>{ly.categories.map(k => <td key={k.name} />)}
              <td className="px-3 py-1.5 text-right tabular-nums">{money(ly.total ?? sum)}{' '}
                {ly.sumMatches === true && <span className="text-[11.5px] px-2 py-0.5 rounded-full font-normal" style={{ background: PILL, color: PILL_FG }}>= debit note</span>}
                {ly.sumMatches === false && <span className="text-[11.5px] px-2 py-0.5 rounded-full font-normal" style={{ background: '#fbf1dc', color: '#8a5a00' }}>covers add to {money(sum)}</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {(ly.changes.length > 0 || ly.conflicts.length > 0) && (
        <ul className="m-0 pl-5 text-[13px] flex flex-col gap-1" style={{ color: INK }}>
          {ly.changes.map((c, i) => <li key={`c${i}`}>{c.what}<span style={{ color: MUTED }}> · {c.file}{c.date ? `, ${fmtDate(c.date)}` : ''}</span></li>)}
          {ly.conflicts.map((c, i) => <li key={`x${i}`} style={{ color: '#8a5a00' }}>{c}</li>)}
        </ul>
      )}
    </section>
  )
}

function ScheduleEditor({ values, schedule, onChange }: { values: ReturnType<typeof planValues>; schedule: Schedule; onChange: (s: Schedule) => void }) {
  const set = <C extends ScheduleCover>(c: C, v: string, val: Schedule[C][string]) => onChange({ ...schedule, [c]: { ...schedule[c], [v]: val } })
  const label = (v: string) => v === ALL ? 'Everyone' : /^\d+$/.test(v) ? `Plan ${v}` : v
  const money = (id: string, value: number | null | undefined, onSet: (n: number | null) => void, none = 'Not covered') => (
    <input id={id} inputMode="numeric" value={value == null ? '' : String(value)} placeholder={none}
      onChange={e => { const t = e.target.value.trim(); const n = Number(t.replace(/[^0-9]/g, '')); onSet(t === '' ? null : Number.isFinite(n) ? n : null) }}
      className={`${inputCls} max-w-[150px]`} />
  )
  return (
    <div className="flex flex-col gap-5">
      {SCHEDULE_COVERS.filter(c => values[c].length).map(c => (
        <div key={c}>
          <p className="m-0 mb-1.5 text-[13px] font-medium">{COVER_WORD[c]}</p>
          <div className="overflow-x-auto">
            <table className="text-[13px]" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {values[c].map(({ value, people }) => (
                  <tr key={value} style={{ borderTop: '1px solid #e6e8e4' }}>
                    <td className="pr-4 py-1.5 whitespace-nowrap align-top">{label(value)} <span style={{ color: MUTED }}>· {people}</span></td>
                    <td className="py-1.5">
                      {c === 'GHS' && (() => {
                        const h = schedule.GHS[value]
                        if (!h) return <button type="button" className="text-[13px] underline bg-transparent border-0 p-0 cursor-pointer" onClick={() => set('GHS', value, { ...DEFAULT_GHS })}>Set</button>
                        const upd = (p: Partial<HospitalFacts>) => set('GHS', value, { ...h, ...p })
                        return (
                          <div className="flex flex-wrap items-center gap-2">
                            <Segmented size="xs" value={h.hospital} onChange={v => upd({ hospital: v })} options={[{ value: 'private', label: 'Private' }, { value: 'government', label: 'Government' }]} />
                            <Segmented size="xs" value={String(h.beds)} onChange={v => upd({ beds: Number(v) as 1 | 2 | 4 })} options={[{ value: '1', label: '1-bed' }, { value: '2', label: '2-bed' }, { value: '4', label: '4-bed' }]} />
                            <Segmented size="xs" value={h.limitKind} onChange={v => upd({ limitKind: v })} options={[{ value: 'per_disability', label: 'Per stay' }, { value: 'annual', label: 'Annual' }]} />
                            <span className="inline-flex items-center gap-1">S$ {money(`ghs-${value}-limit`, h.limit, n => upd({ limit: n ?? 0 }), 'Limit')}</span>
                            <Segmented size="xs" value={String(h.coins)} onChange={v => upd({ coins: Number(v) as 0 | 20 | 25 })} options={[{ value: '0', label: 'No co-ins' }, { value: '20', label: '20%' }, { value: '25', label: '25%' }]} />
                            <label className="inline-flex items-center gap-1 text-[12.5px]" style={{ color: MUTED }}><input type="checkbox" checked={!!h.foreignWorker} onChange={e => upd({ foreignWorker: e.target.checked })} /> foreign workers</label>
                          </div>
                        )
                      })()}
                      {(c === 'EMM' || c === 'GOSC' || c === 'GD') && <span className="inline-flex items-center gap-1">S$ {money(`${c}-${value}`, schedule[c][value], n => set(c, value, n))}<span className="text-[12px]" style={{ color: MUTED }}>{c === 'EMM' ? 'limit' : 'a year'}</span></span>}
                      {c === 'GOPC' && <span className="inline-flex items-center gap-1">Co-pay S$ {money(`GOPC-${value}`, schedule.GOPC[value], n => set('GOPC', value, n))}<span className="text-[12px]" style={{ color: MUTED }}>per visit</span></span>}
                      {c === 'GTL' && (() => {
                        const l: LifeFacts | null = schedule.GTL[value] ?? null
                        return (
                          <div className="flex flex-wrap items-center gap-2">
                            <Segmented size="xs" value={l?.kind ?? 'multiple'} onChange={v => set('GTL', value, { kind: v, n: l?.n ?? (v === 'multiple' ? 12 : 100_000) })} options={[{ value: 'multiple', label: '× monthly salary' }, { value: 'sum', label: 'Sum S$' }]} />
                            {money(`GTL-${value}`, l?.n, n => set('GTL', value, n == null ? null : { kind: l?.kind ?? 'multiple', n }))}
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
