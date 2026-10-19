'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Btn, Chip, Segmented } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { MarketingPage, MUTED, Note } from '@/components/marketing/page-shell'
import { useSiteKey, useSites } from '@/components/marketing/site-switch'
import { fmtDay, n } from '@/lib/marketing/labels'
import type { Competitor, GeoAnalysis, GeoPrompt, GeoPromptResult, SiteSummary } from '@/lib/marketing/types'

const INK = '#202124'
const INK2 = '#3c4043'
const RULE = '#e8eaed'
const FAINT = '#9aa0a6'
const MIGRATION_LINE = 'Migration 20261019_marketing_v2 is not applied yet.'
const TONE_LABEL: Record<string, string> = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative', not_mentioned: 'Not mentioned' }

type Tab = 'companies' | 'prompts' | 'history'
type Payload = { site: SiteSummary; competitors: Competitor[]; prompts: GeoPrompt[]; results: Record<string, GeoPromptResult>; analyses: GeoAnalysis[]; latest: GeoAnalysis | null; migrationPending?: boolean }

/** "Sun 19 Oct 03:10", Singapore time. */
const fmtWhen = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore' }).format(new Date(iso)).replace(',', '') : null
const pathOf = (u: string | null | undefined) => { if (!u) return null; try { const p = new URL(u); return p.pathname.replace(/\/$/, '') || '/' } catch { return u } }
const usd = (x: number | null | undefined) => typeof x === 'number' ? `US$${x.toFixed(2)}` : '–'
const modelLabel = (m: string | null) => !m ? '–' : m.replace(/^gemini-/, 'Gemini ').replace(/-flash$/, ' Flash').replace(/-pro$/, ' Pro')

export default function CompetitorsPage() {
  return <Suspense fallback={null}><Competitors /></Suspense>
}

/** The rival sites per website, the prompts worth writing for, and every analysis the engine ran. */
function Competitors() {
  const { sites } = useSites()
  const [siteKey, setSiteKey] = useSiteKey(sites)
  const search = useSearchParams()
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const initialTab = search.get('tab')
  const [tab, setTab] = useState<Tab>(initialTab === 'prompts' || initialTab === 'history' ? initialTab : 'companies')
  const [busy, setBusy] = useState(false)
  const reqId = useRef(0)

  const load = useCallback(async () => {
    if (!siteKey) return
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch(`/api/marketing/competitors?site=${siteKey}`, { cache: 'no-store' })
      const j = await res.json()
      if (id !== reqId.current) return
      if (!res.ok) throw new Error(j.error ?? 'Could not load competitors')
      setData(j); setError(null)
    } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (id === reqId.current) setLoading(false) }
  }, [siteKey])
  useEffect(() => { setNote(null); void load() }, [load])

  const running = (data?.analyses ?? []).some(a => a.status === 'queued' || a.status === 'running')
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => load(), 5000)
    return () => clearInterval(t)
  }, [running, load])

  /** One call, one error line. Returns the JSON on success, null on failure. */
  async function api<T = Record<string, unknown>>(path: string, init: RequestInit): Promise<T | null> {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/marketing/competitors${path}${path.includes('?') ? '&' : '?'}site=${siteKey}`, { ...init, headers: { 'content-type': 'application/json' } })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? 'Request failed'); return null }
      return j as T
    } finally { setBusy(false) }
  }

  async function addCompetitor(url: string) {
    const r = await api('', { method: 'POST', body: JSON.stringify({ url }) })
    if (r) { setNote(null); await load() }
    return !!r
  }
  async function removeCompetitor(c: Competitor) {
    if (!confirm(`Remove ${c.name} (${c.domain}) from the list?`)) return
    const r = await api('', { method: 'DELETE', body: JSON.stringify({ id: c.id }) })
    if (r) await load()
  }
  async function runAnalysis() {
    const r = await api<{ version: number; note: string | null }>('/analyse', { method: 'POST' })
    if (r) { setNote(`Analysis v${r.version} queued${r.note ? ` · ${r.note}` : ''}`); await load() }
  }
  async function addPrompt(prompt: string, search_query: string) {
    const r = await api('/prompts', { method: 'POST', body: JSON.stringify({ prompt, search_query }) })
    if (r) await load()
    return !!r
  }
  async function toggleSelected(p: GeoPrompt) {
    const next = !p.selected
    setData(d => d && { ...d, prompts: d.prompts.map(x => x.id === p.id ? { ...x, selected: next } : x) })
    const r = await api('/prompts', { method: 'PATCH', body: JSON.stringify({ id: p.id, selected: next }) })
    if (!r) setData(d => d && { ...d, prompts: d.prompts.map(x => x.id === p.id ? { ...x, selected: p.selected } : x) })
  }
  async function removePrompt(p: GeoPrompt) {
    const r = await api('/prompts', { method: 'DELETE', body: JSON.stringify({ id: p.id }) })
    if (r) await load()
  }

  const site = data?.site
  const latest = data?.latest ?? null
  const line = !data ? 'Loading…' : (
    <>{site!.name} · {data.competitors.length} {data.competitors.length === 1 ? 'company' : 'companies'}
      {latest ? <> · analysis v{latest.version} ran {fmtWhen(latest.completed_at ?? latest.created_at)} · {n(latest.pages_read)} blog pages read · {n(latest.prompts_checked)} prompts checked</> : <> · no analysis yet</>}
    </>
  )

  return (
    <MarketingPage
      title="Competitors"
      line={line}
      sites={sites} siteKey={siteKey} onSite={setSiteKey}
      actions={<Btn level="primary" disabled={busy || running || !data || data.migrationPending} onClick={runAnalysis}>{running ? 'Analysis running…' : 'Run analysis'}</Btn>}
      filters={data && !data.migrationPending && (
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'companies', label: 'Companies', count: data.competitors.length },
          { value: 'prompts', label: 'Prompts', count: data.prompts.length },
          { value: 'history', label: 'History', count: data.analyses.length },
        ]} />
      )}
    >
      {error && <Note role="alert">{error}</Note>}
      {note && <Note role="status">{note}</Note>}
      {data?.migrationPending ? <Note>{MIGRATION_LINE}</Note> : !data ? null : (
        <div className={cn(loading && 'opacity-60 transition-opacity')}>
          {tab === 'companies' && <CompaniesTab data={data} busy={busy} onAdd={addCompetitor} onRemove={removeCompetitor} />}
          {tab === 'prompts' && <PromptsTab data={data} busy={busy} onAdd={addPrompt} onToggle={toggleSelected} onRemove={removePrompt} />}
          {tab === 'history' && <HistoryTab analyses={data.analyses} siteName={data.site.name} />}
        </div>
      )}
    </MarketingPage>
  )
}

// ── The ask: one question, one underlined field, one button ──────────────

function Ask({ question, hint, children, small }: { question: string; hint: string; children: React.ReactNode; small?: boolean }) {
  return (
    <div className="max-w-[760px]">
      <p className={cn('m-0 font-medium tracking-[-0.02em] leading-[1.25]', small ? 'text-[20px] mb-3.5' : 'text-[26px] mb-[18px]')} style={{ textWrap: 'balance' }}>
        {question}
        <small className="block text-[14px] font-normal tracking-normal mt-1.5" style={{ color: MUTED }}>{hint}</small>
      </p>
      {children}
    </div>
  )
}

const askField = (big: boolean) => cn('flex-1 min-w-0 border-0 bg-transparent px-0 pt-2 pb-2.5 outline-none placeholder:text-[#c4c7cb]', big ? 'text-[22px]' : 'text-[17px]')
const askFieldStyle = { color: INK, borderBottom: `2px solid ${INK}`, borderRadius: 0 } as const

function RegisterFoot({ colSpan, left, right }: { colSpan: number; left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <tfoot>
      <tr>
        <td colSpan={colSpan} className="px-6 py-3 text-[13px]" style={{ color: MUTED }}>
          <div className="flex items-center justify-between gap-3 flex-wrap"><span>{left}</span>{right && <span>{right}</span>}</div>
        </td>
      </tr>
    </tfoot>
  )
}

// ── Companies ────────────────────────────────────────────────────────────

function CompaniesTab({ data, busy, onAdd, onRemove }: { data: Payload; busy: boolean; onAdd: (url: string) => Promise<boolean>; onRemove: (c: Competitor) => void }) {
  const [url, setUrl] = useState('')
  const latest = data.latest
  const siteLine = latest?.summary?.site
  const checked = latest?.prompts_checked ?? 0
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || busy) return
    if (await onAdd(url.trim())) setUrl('')
  }
  return (
    <>
      <Ask question="Add a competitor" hint="Paste the company's website. The blog is found from the sitemap.">
        <form onSubmit={submit} className="flex items-end gap-4 flex-wrap">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" aria-label="Competitor website URL" autoComplete="off" spellCheck={false} className={askField(true)} style={{ ...askFieldStyle, flexBasis: 360 }} />
          <Btn type="submit" level="primary" disabled={busy || !url.trim()} className="h-11 px-[18px] text-[15px]">Add <kbd className="text-[12px] opacity-70 font-[inherit]">↵</kbd></Btn>
        </form>
      </Ask>

      <div className="h-12" />
      <Register label="Competitors" minWidth={1040}>
        <RegisterHead>
          <RegisterTh first>Company</RegisterTh>
          <RegisterTh align="right" hint="Blog pages found in the sitemap at the last analysis">Blog pages</RegisterTh>
          <RegisterTh hint="Most cited in AI answers, then most top-10 searches">Best page</RegisterTh>
          <RegisterTh align="right" hint="Prompts whose AI answer cited this domain">Cited in AI answers</RegisterTh>
          <RegisterTh align="right" hint="Searches with this domain in the top 10">Searches shared</RegisterTh>
          <RegisterTh hint="When the company was added">Added</RegisterTh>
          <RegisterTh last />
        </RegisterHead>
        <tbody>
          {data.competitors.length === 0 ? <RegisterEmpty colSpan={7}>No competitors yet. Add the first above.</RegisterEmpty> : data.competitors.map(c => {
            const blog = pathOf(c.blog_url)
            const best = pathOf(c.best_page_url)
            return (
              <RegisterRow key={c.id}>
                <RegisterCell first identityWidth={240} primary={c.name} secondary={<>{c.domain}{blog ? ` · blog at ${blog}` : c.last_analysed_at ? ' · no blog found' : ' · not analysed yet'}</>} />
                <RegisterCell align="right"><span className="tabular-nums">{c.last_analysed_at ? n(c.pages_count) : '–'}</span></RegisterCell>
                <RegisterCell nowrap={false} className="min-w-[240px] max-w-[420px]">
                  {best ? <>
                    <span className="block text-[13.5px] leading-[1.4] break-all" style={{ color: INK2 }}>{best}</span>
                    {c.best_page_note && <span className="block text-[12.5px] mt-0.5" style={{ color: MUTED }}>{c.best_page_note}</span>}
                  </> : <span style={{ color: FAINT }}>–</span>}
                </RegisterCell>
                <RegisterCell align="right"><span className="tabular-nums">{c.last_analysed_at && checked ? `${c.cited_count} of ${checked}` : '–'}</span></RegisterCell>
                <RegisterCell align="right"><span className="tabular-nums">{c.last_analysed_at ? n(c.search_hits) : '–'}</span></RegisterCell>
                <RegisterCell><span style={{ color: MUTED }}>{fmtDay(c.created_at)}</span></RegisterCell>
                <RegisterCell last><Btn level="tertiary" size="xs" disabled={busy} onClick={() => onRemove(c)}>Remove</Btn></RegisterCell>
              </RegisterRow>
            )
          })}
        </tbody>
        <RegisterFoot colSpan={7}
          left={latest && siteLine ? <>{data.site.name}: {n(siteLine.pages ?? 0)} pages · cited in {siteLine.cited ?? latest.cited_count} of {checked} answers · top 10 for {siteLine.top10 ?? 0} searches</> : <>{data.site.name}: no analysis yet</>}
          right="Best page = most cited in AI answers, then most top-10 searches" />
      </Register>
    </>
  )
}

// ── Prompts ──────────────────────────────────────────────────────────────

function PromptsTab({ data, busy, onAdd, onToggle, onRemove }: { data: Payload; busy: boolean; onAdd: (prompt: string, search: string) => Promise<boolean>; onToggle: (p: GeoPrompt) => void; onRemove: (p: GeoPrompt) => void }) {
  const [prompt, setPrompt] = useState('')
  const [search, setSearch] = useState('')
  const ticked = data.prompts.filter(p => p.selected).length
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (prompt.trim().length < 8 || busy) return
    if (await onAdd(prompt.trim(), search.trim())) { setPrompt(''); setSearch('') }
  }
  return (
    <>
      <Ask small question="Add a prompt" hint="The question as a buyer asks an AI assistant, and the same question as typed into Google.">
        <form onSubmit={submit} className="flex items-end gap-4 flex-wrap">
          <input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Which insurance is compulsory for a small business in Singapore?" aria-label="Prompt" autoComplete="off" className={askField(false)} style={{ ...askFieldStyle, flexBasis: 320 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="compulsory business insurance singapore" aria-label="Search query" autoComplete="off" className={askField(false)} style={{ ...askFieldStyle, flexBasis: 240 }} />
          <Btn type="submit" level="primary" disabled={busy || prompt.trim().length < 8} className="h-10 px-4">Add <kbd className="text-[12px] opacity-70 font-[inherit]">↵</kbd></Btn>
        </form>
      </Ask>

      <div className="h-12" />
      <Register label="GEO prompts and searches" minWidth={1100}>
        <RegisterHead>
          <RegisterTh width={48} hint="Ticked prompts are the ones the nightly batch may write for" />
          <RegisterTh>Prompt</RegisterTh>
          <RegisterTh>Search</RegisterTh>
          <RegisterTh hint="Domains the AI answer cited at the latest analysis">Cited</RegisterTh>
          <RegisterTh hint="How the AI answer spoke of the site at the latest analysis">Tone toward {data.site.name}</RegisterTh>
          <RegisterTh align="right" hint="Search Console impressions when the search matches a query">Impressions</RegisterTh>
          <RegisterTh last />
        </RegisterHead>
        <tbody>
          {data.prompts.length === 0 ? <RegisterEmpty colSpan={7}>No prompts yet. Run an analysis, or add one above.</RegisterEmpty> : data.prompts.map(p => {
            const r = data.results[p.id]
            return (
              <RegisterRow key={p.id}>
                <RegisterCell className="pl-5 pr-1">
                  <input type="checkbox" checked={p.selected} disabled={busy} onChange={() => onToggle(p)} aria-label={`Write for: ${p.prompt}`} className="block w-4 h-4 cursor-pointer" style={{ accentColor: INK }} />
                </RegisterCell>
                <RegisterCell nowrap={false} className="min-w-[260px] max-w-[420px]"><span className="block text-[13.5px] leading-[1.4]" style={{ color: INK2 }}>{p.prompt}</span></RegisterCell>
                <RegisterCell nowrap={false} className="min-w-[200px] max-w-[320px]"><span className="block text-[13.5px] leading-[1.4]" style={{ color: INK2 }}>{p.search_query || <span style={{ color: FAINT }}>–</span>}</span></RegisterCell>
                <RegisterCell nowrap={false} className="min-w-[200px] max-w-[360px]"><span className="block text-[13.5px] leading-[1.4]" style={{ color: INK2 }}>{r?.cited_domains?.length ? r.cited_domains.join(' · ') : <span style={{ color: FAINT }}>–</span>}</span></RegisterCell>
                <RegisterCell>{r ? <Chip>{TONE_LABEL[r.tone] ?? r.tone}</Chip> : <span style={{ color: FAINT }}>–</span>}</RegisterCell>
                <RegisterCell align="right"><span className="tabular-nums">{p.impressions == null ? '–' : n(p.impressions)}</span></RegisterCell>
                <RegisterCell last><Btn level="tertiary" size="xs" disabled={busy} onClick={() => onRemove(p)}>Remove</Btn></RegisterCell>
              </RegisterRow>
            )
          })}
        </tbody>
        <RegisterFoot colSpan={7}
          left={<>{n(data.prompts.length)} prompts · {ticked} ticked for tonight · Gemini with search grounding</>}
          right="Prompts come from the analysis and Search Console; add your own above the table" />
      </Register>
    </>
  )
}

// ── History ──────────────────────────────────────────────────────────────

function HistoryTab({ analyses, siteName }: { analyses: GeoAnalysis[]; siteName: string }) {
  if (analyses.length === 0) return <Note>No analysis yet. Run analysis reads every competitor blog and checks the prompts.</Note>
  return (
    <ul className="list-none m-0 p-0 max-w-[980px]">
      {analyses.map(a => {
        const status = a.status === 'completed' ? null : a.status === 'failed' ? 'Failed' : a.status === 'running' ? 'Running' : 'Queued'
        const detail = a.status === 'failed'
          ? (a.error ?? 'failed').slice(0, 200)
          : a.status === 'completed'
            ? `${n(a.pages_read)} pages · ${n(a.prompts_checked)} prompts · ${siteName} cited ${a.cited_count} of ${a.prompts_checked}`
            : a.status === 'running' ? `started ${fmtWhen(a.started_at) ?? ''}` : 'waiting for the engine'
        return (
          <li key={a.id} className="grid gap-4 items-baseline py-3.5 text-[14px] grid-cols-2 sm:grid-cols-[120px_minmax(0,1fr)_150px_120px]" style={{ borderBottom: `1px solid ${RULE}` }}>
            <span className="tabular-nums" style={{ color: MUTED }}>{fmtWhen(a.completed_at ?? a.created_at)}</span>
            <span className="font-medium min-w-0">
              Analysis v{a.version}{status && <> <Chip className="ml-1.5 align-middle">{status}</Chip></>}
              <small className="block font-normal text-[12.5px] mt-0.5 break-words" style={{ color: MUTED }}>{detail}</small>
            </span>
            <span style={{ color: MUTED }}>{modelLabel(a.model)}</span>
            <span className="tabular-nums sm:text-right" style={{ color: MUTED }}>{usd(a.cost_usd)}</span>
          </li>
        )
      })}
    </ul>
  )
}
