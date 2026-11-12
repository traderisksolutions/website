'use client'

/**
 * New quotation, in four steps a broker controls:
 *   1. The census: a file uploaded here, or a spreadsheet from the client's emails, read in full
 *      from the original (the password asked for when the file is protected).
 *   2. The tabs: every sheet with its headcount; the broker ticks the ones that make the census.
 *   3. The details: company, start date, basis, current insurer, insurers ruled out.
 *   4. The current cover: what each plan number on the census means, as numbers. Prefilled from
 *      the schedule confirmed for this company last time.
 * Analyse prices the current cover and one change at a time at every insurer, and opens the report.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud } from 'lucide-react'
import { Btn, Field, inputCls, Segmented } from '@/components/crm/primitives'
import { CompanyField, type CompanyPick } from './CompanyField'
import { fmtDate } from '@/lib/format'
import { ALL, COVER_WORD, lifeOf, planValues, SCHEDULE_COVERS, type HospitalFacts, type LifeFacts, type Schedule, type ScheduleCover } from '@/lib/gb/current'
import type { Member } from '@/lib/gb-quote'
import type { SheetRead } from '@/lib/gb/census-parse'
import type { CensusSource } from '@/app/api/group-benefits/census/sources/route'

const INSURERS = ['AIA', 'Income', 'QBE', 'Raffles Health', 'Singlife']
const MUTED = '#4a5550', INK = '#0f1412', FIELD = '#f1f2ee'

function nextMonthFirst(): string {
  const t = new Date(Date.now() + 8 * 3600_000)
  const y = t.getUTCMonth() === 11 ? t.getUTCFullYear() + 1 : t.getUTCFullYear()
  const m = (t.getUTCMonth() + 1) % 12 + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

const DEFAULT_GHS: HospitalFacts = { hospital: 'private', beds: 4, limitKind: 'per_disability', limit: 15_000, coins: 0 }
const emptySchedule = (): Schedule => ({ GHS: {}, EMM: {}, GOPC: {}, GOSC: {}, GD: {}, GTL: {} })
type Source = { name: string; upload?: File; attachmentId?: string }

export function NewEb({ initialCompany, initialCompanyId, threadId }: { initialCompany?: string; initialCompanyId?: string | null; threadId?: string | null }) {
  const router = useRouter()
  const [sources, setSources] = useState<CensusSource[] | null>(null)
  const [prior, setPrior] = useState<Schedule | null>(null)
  const [reading, setReading] = useState(false)
  const [file, setFile] = useState<Source | null>(null)
  const [needsPassword, setNeedsPassword] = useState<{ wrong: boolean } | null>(null)
  const [password, setPassword] = useState('')
  const [sheets, setSheets] = useState<SheetRead[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pick, setPick] = useState<CompanyPick>({ id: initialCompanyId ?? null, name: initialCompany ?? '' })
  const [effDate, setEffDate] = useState(nextMonthFirst())
  const [basis, setBasis] = useState<'new_business' | 'renewal'>('renewal')
  const [current, setCurrent] = useState('')
  const [excluded, setExcluded] = useState<string[]>([])
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!threadId && !initialCompanyId) { setSources([]); return }
    const q = new URLSearchParams(); if (threadId) q.set('thread', threadId); if (initialCompanyId) q.set('company', initialCompanyId)
    fetch(`/api/group-benefits/census/sources?${q}`, { cache: 'no-store' }).then(r => r.json()).then((d: { sources?: CensusSource[]; companyId?: string | null; companyName?: string | null; schedule?: Schedule | null; currentInsurer?: string | null }) => {
      setSources(d.sources ?? [])
      setPrior(d.schedule ?? null)
      if (d.companyName) setPick(p => p.name ? p : { id: d.companyId ?? null, name: d.companyName! })
      if (d.currentInsurer) setCurrent(INSURERS.find(i => d.currentInsurer!.toLowerCase().includes(i.toLowerCase().split(' ')[0])) ?? '')
    }).catch(() => setSources([]))
  }, [threadId, initialCompanyId])

  async function read(f: Source, pw?: string) {
    setReading(true); setError(null); setSheets(null); setFile(f)
    try {
      let res: Response
      if (f.upload) { const fd = new FormData(); fd.append('file', f.upload); if (pw) fd.append('password', pw); res = await fetch('/api/group-benefits/census/read', { method: 'POST', body: fd }) }
      else res = await fetch('/api/group-benefits/census/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachment_id: f.attachmentId, password: pw || undefined }) })
      const d = await res.json().catch(() => ({})) as { sheets?: SheetRead[]; needsPassword?: boolean; wrongPassword?: boolean; passwordHint?: string | null; error?: string }
      if (d.needsPassword) { setNeedsPassword({ wrong: !!d.wrongPassword }); if (d.passwordHint && !pw) setPassword(d.passwordHint); return }
      if (!res.ok || !d.sheets) { setError(d.error ?? `The file could not be read (${res.status}).`); return }
      setNeedsPassword(null)
      setSheets(d.sheets)
      setPicked(new Set(d.sheets.filter(s => s.members.length > 0).map(s => s.sheet)))
    } catch (e) { setError(e instanceof Error ? e.message : 'The file could not be read.') }
    finally { setReading(false) }
  }

  const members: Member[] = useMemo(() => (sheets ?? []).filter(s => picked.has(s.sheet)).flatMap(s => s.members), [sheets, picked])
  const values = useMemo(() => planValues(members), [members])

  // The schedule: what was set here, else what was confirmed for this company last time, else a default.
  useEffect(() => {
    if (!members.length) return
    setSchedule(prev => {
      const next = emptySchedule()
      for (const c of SCHEDULE_COVERS) for (const { value } of values[c]) {
        const had = (prev[c] as Record<string, unknown>)[value] ?? (prior?.[c] as Record<string, unknown> | undefined)?.[value]
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
  }, [values, prior, members.length])

  async function analyse() {
    if (!members.length) { setError('Pick at least one tab with people on it.'); return }
    if (!pick.name.trim()) { setError('Name the company.'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/group-benefits/analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ census: members, schedule, company_name: pick.name.trim(), company_id: pick.id, effective_date: effDate, basis, current_insurer: current || null, excluded,
          source: threadId ? { label: 'Thread', href: `/engagement?lead=${threadId}` } : undefined }),
      })
      const d = await res.json().catch(() => ({})) as { quotation_id?: string; error?: string }
      if (!res.ok || !d.quotation_id) { setError(d.error ?? `The analysis did not run (${res.status}).`); setBusy(false); return }
      router.push(`/pricing-matrix/quote/${d.quotation_id}/analysis`)
    } catch (e) { setError(e instanceof Error ? e.message : 'The analysis did not run.'); setBusy(false) }
  }

  const employees = members.filter(m => m.relationship === 'self').length

  return (
    <div className="flex flex-col gap-8 max-w-[980px]">
      <div>
        <h2 className="m-0 text-[20px] font-medium tracking-[-0.01em]">New quotation</h2>
        <p className="m-0 mt-1 text-[13.5px]" style={{ color: MUTED }}>The census, the tabs that make it up, the current cover. Every insurer is priced on the current cover and on one change at a time.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="m-0 text-[15px] font-medium">1 · Census</h3>
        {sources && sources.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="m-0 text-[13px]" style={{ color: MUTED }}>Spreadsheets on the client&apos;s emails</p>
            {sources.map(s => (
              <button key={s.attachment_id} type="button" onClick={() => read({ name: s.filename, attachmentId: s.attachment_id })} disabled={reading || busy}
                className="text-left rounded-[8px] px-3 py-2 cursor-pointer text-[13.5px]" style={{ border: '1px solid #e6e8e4', background: file?.attachmentId === s.attachment_id ? FIELD : 'white', color: INK }}>
                {s.filename} <span style={{ color: MUTED }}>· {fmtDate(s.at)}{s.subject ? ` · ${s.subject}` : ''}</span>
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-3 rounded-[10px] px-4 py-3 cursor-pointer" style={{ border: '1px dashed #c9cfc7' }}>
          <UploadCloud size={18} style={{ color: MUTED }} />
          <span className="text-[13.5px]">{reading ? 'Reading every tab…' : file?.upload ? file.name : 'Upload a census: .xlsx, .xls or .csv'}</span>
          <input id="neweb-file" type="file" accept=".csv,.txt,.xlsx,.xls,.xlsm" className="sr-only" disabled={reading || busy} onChange={e => { const f = e.target.files?.[0]; if (f) void read({ name: f.name, upload: f }); e.target.value = '' }} />
        </label>
        {needsPassword && file && (
          <div className="flex items-end gap-2 flex-wrap">
            <Field label={needsPassword.wrong ? 'That password does not open the file' : 'This file is password-protected'} hint={password ? 'The password the email states is filled in' : undefined}>
              <input id="neweb-password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="Password" />
            </Field>
            <Btn level="primary" onClick={() => read(file, password)} loading={reading}>Open</Btn>
          </div>
        )}
      </section>

      {sheets && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-[15px] font-medium">2 · Tabs</h3>
          <div className="overflow-x-auto">
            <table className="trs-table text-[13.5px]" style={{ borderCollapse: 'collapse', minWidth: 560 }}>
              <thead><tr><th className="px-3 py-2 text-left" /><th className="px-3 py-2 text-left">Tab</th><th className="px-3 py-2 text-right">Employees</th><th className="px-3 py-2 text-right">Dependants</th><th className="px-3 py-2 text-left">Plan columns</th></tr></thead>
              <tbody>
                {sheets.map(s => (
                  <tr key={s.sheet} style={{ borderTop: '1px solid #e6e8e4', color: s.members.length ? INK : MUTED }}>
                    <td className="px-3 py-1.5"><input id={`tab-${s.sheet}`} type="checkbox" disabled={!s.members.length} checked={picked.has(s.sheet)} onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(s.sheet); else n.delete(s.sheet); return n })} /></td>
                    <td className="px-3 py-1.5">{s.sheet}{!s.members.length ? <span className="text-[12px]" style={{ color: MUTED }}> · no people read</span> : null}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{s.employees}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{s.dependants}</td>
                    <td className="px-3 py-1.5 text-[12.5px]" style={{ color: MUTED }}>{s.planCovers.join(', ') || '—'}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1px solid #e6e8e4', fontWeight: 600 }}><td /><td className="px-3 py-1.5">Picked</td><td className="px-3 py-1.5 text-right tabular-nums">{employees}</td><td className="px-3 py-1.5 text-right tabular-nums">{members.length - employees}</td><td className="px-3 py-1.5 text-[12.5px]">{members.length} lives</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {members.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="m-0 text-[15px] font-medium">3 · Details</h3>
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
              {INSURERS.map(i => { const on = excluded.includes(i); return <button key={i} type="button" aria-pressed={on} onClick={() => setExcluded(x => on ? x.filter(y => y !== i) : [...x, i])} className="h-8 px-3 rounded-[999px] text-[13px] cursor-pointer" style={{ border: '1px solid #d5d9d4', background: on ? FIELD : 'white', color: on ? INK : MUTED, textDecoration: on ? 'line-through' : 'none' }}>{i}</button> })}
            </div>
          </Field>
        </section>
      )}

      {members.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="m-0 text-[15px] font-medium">4 · Current cover</h3>
          <p className="m-0 text-[13px]" style={{ color: MUTED }}>What each plan on the census means today, as numbers. {prior ? 'Filled from the schedule confirmed last time; check it.' : 'Check each line against the client’s benefit summary.'}</p>
          <ScheduleEditor values={values} schedule={schedule} onChange={setSchedule} />
        </section>
      )}

      {error && <p className="m-0 text-[13.5px]" style={{ color: '#a1242f' }} role="alert">{error}</p>}
      {members.length > 0 && (
        <div className="flex items-center gap-3">
          <Btn level="primary" onClick={analyse} loading={busy} disabled={busy}>{busy ? 'Pricing every insurer…' : `Analyse ${members.length} lives`}</Btn>
        </div>
      )}
    </div>
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
