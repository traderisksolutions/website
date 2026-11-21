'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Btn, Chip } from '@/components/crm/primitives'
import { Input } from '@/components/ui/input'
import { MarketingPage, MUTED, Note } from '@/components/marketing/page-shell'
import { useSiteKey, useSites, withSite } from '@/components/marketing/site-switch'
import { fmtDate, n } from '@/lib/marketing/labels'
import type { Cadence, NightGroup, SiteSummary, TonightPlan } from '@/lib/marketing/types'
import { runScheduleNow, saveCadence as saveCadenceAction, schedule } from '../actions'

const MIGRATION_LINE = 'Migration 20261019_marketing_v2 is not applied yet.'
const HOUR = 3_600_000
const LENGTH_WORDS: Record<Cadence['length'], string> = { standard: '1,200 words', long: '2,000 words' }

type Payload = { site: SiteSummary; cadence: Cadence; tonight: TonightPlan; nights: NightGroup[]; spendMonthUsd: number; postedMonth: number; migrationPending?: boolean }
type Part = 'count' | 'length' | 'post'

const usd = (x: number | null | undefined) => typeof x === 'number' ? `US$${x.toFixed(2)}` : '–'
const shortDate = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }).format(new Date(iso)) : null

/** "Mon 20 Oct · 02:00 SGT": the next time the nightly clock passes `time` (HH:MM SGT). */
function nextRun(time: string): { label: string; tonight: boolean } {
  const [hh, mm] = time.split(':').map(Number)
  const sgtNow = new Date(Date.now() + 8 * HOUR)
  const nowMin = sgtNow.getUTCHours() * 60 + sgtNow.getUTCMinutes()
  const past = nowMin >= (hh || 0) * 60 + (mm || 0)
  const day = new Date(Date.UTC(sgtNow.getUTCFullYear(), sgtNow.getUTCMonth(), sgtNow.getUTCDate() + (past ? 1 : 0)))
  const label = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(day).replace(',', '')
  return { label: `${label} · ${time} SGT`, tonight: past }
}

export default function SchedulePage() {
  return <Suspense fallback={null}><Schedule /></Suspense>
}

/** One sentence sets the cadence. Each night: latest analysis + current knowledge → prompts → articles → post. */
function Schedule() {
  const { sites } = useSites()
  const [siteKey, setSiteKey] = useSiteKey(sites)
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reqId = useRef(0)

  const load = useCallback(async () => {
    if (!siteKey) return
    const id = ++reqId.current
    setLoading(true)
    try {
      const r = await schedule(siteKey)
      if (id !== reqId.current) return
      if (!r.ok) throw new Error(r.error)
      const j = r.data
      setData(j); setError(null)
    } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (id === reqId.current) setLoading(false) }
  }, [siteKey])
  useEffect(() => { setNote(null); void load() }, [load])

  const active = (data?.nights ?? []).some(g => g.rows.some(r => r.status === 'Running' || r.status === 'Queued'))
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => load(), 5000)
    return () => clearInterval(t)
  }, [active, load])

  async function saveCadence(patch: Partial<Cadence>) {
    if (!data) return
    const before = data.cadence
    setData(d => d && { ...d, cadence: { ...d.cadence, ...patch } })
    setBusy(true); setError(null); setNote(null)
    try {
      const r = await saveCadenceAction(siteKey, patch)
      if (!r.ok) { setError(r.error); setData(d => d && { ...d, cadence: before }); return }
      setNote('Saved')
      await load()
    } finally { setBusy(false) }
  }

  async function runNow() {
    setBusy(true); setError(null); setNote(null)
    try {
      const r = await runScheduleNow(siteKey)
      if (!r.ok) { setError(r.error); return }
      const j = r.data
      const count = Number(j.count ?? 0)
      setNote(count === 0 ? 'Nothing to write: no prompt left to tackle and no Search Console target.' : `${count} ${count === 1 ? 'run' : 'runs'} started. Follow them on Generate.`)
      await load()
    } finally { setBusy(false) }
  }

  const site = data?.site
  const cad = data?.cadence
  const plan = data?.tonight
  const next = cad ? nextRun(cad.time) : null
  const blocked = !data ? 'Loading' : data.migrationPending ? MIGRATION_LINE : !plan?.analysis ? 'No analysis yet. Run one on Competitors first.' : !plan?.knowledge ? 'No knowledge file yet. Save one on Knowledge first.' : cad!.count === 0 ? 'Nightly writing is off. Set a number of articles first.' : null
  const line = !data ? 'Loading…' : (
    <>{site!.name} · {cad!.count === 0 ? 'nightly writing off' : `next run ${next!.tonight ? 'tonight' : 'today'} ${cad!.time} SGT`} · {data.postedMonth} posted this month · {usd(data.spendMonthUsd)} spent</>
  )

  return (
    <MarketingPage
      title="Schedule"
      line={line}
      sites={sites} siteKey={siteKey} onSite={setSiteKey}
      actions={<Btn level="secondary" disabled={busy || !!blocked} title={blocked ?? undefined} onClick={runNow}>Run now</Btn>}
    >
      {error && <Note role="alert">{error}</Note>}
      {note && <Note role="status">{note}</Note>}
      {data?.migrationPending ? <Note>{MIGRATION_LINE}</Note> : !data ? null : (
        <div className={cn(loading && 'opacity-60 transition-opacity')}>
          <Sentence cadence={data.cadence} site={data.site} busy={busy} onSave={saveCadence} />

          <div className="h-12" />
          <Tonight plan={data.tonight} cadence={data.cadence} site={data.site} when={next!.label} siteKey={siteKey} />

          <div className="h-12" />
          <h2 className="m-0 mb-3.5 text-heading font-semibold">Nights</h2>
          <Nights groups={data.nights} siteKey={siteKey} />
        </div>
      )}
    </MarketingPage>
  )
}

// ── The cadence as one sentence ──────────────────────────────────────────

function Sentence({ cadence, site, busy, onSave }: { cadence: Cadence; site: SiteSummary; busy: boolean; onSave: (patch: Partial<Cadence>) => Promise<void> }) {
  const [editing, setEditing] = useState<Part | null>(null)
  const [count, setCount] = useState(String(cadence.count))
  useEffect(() => { setCount(String(cadence.count)) }, [cadence.count])

  // A word in the sentence that opens its control: the tertiary button, inline, underlined in ink, in the sentence's own size.
  const partCls = 'inline-block h-auto align-baseline border-0 border-b-2 border-trs-ink rounded-none bg-transparent p-0 px-0.5 mx-px font-medium leading-[1.15] text-[length:inherit] tracking-[inherit] whitespace-normal text-trs-ink hover:bg-transparent hover:text-trs-ink'
  const Term = ({ part, children, title }: { part: Part; children: React.ReactNode; title?: string }) => (
    <Btn level="tertiary" className={partCls} title={title ?? 'Change'} disabled={busy} onClick={() => setEditing(part)}>{children}</Btn>
  )
  const controlCls = 'inline-block align-baseline h-9 rounded border border-trs-ink bg-white px-2.5 text-heading font-semibold outline-none'

  function commitCount() {
    const v = Math.max(0, Math.min(12, Math.floor(Number(count)) || 0))
    setEditing(null)
    if (v !== cadence.count) void onSave({ count: v })
    else setCount(String(cadence.count))
  }

  const countControl = editing === 'count'
    ? <Input type="number" min={0} max={12} value={count} autoFocus onChange={e => setCount(e.target.value)} onBlur={commitCount} onKeyDown={e => { if (e.key === 'Enter') commitCount(); if (e.key === 'Escape') { setCount(String(cadence.count)); setEditing(null) } }} aria-label="Articles per night" className={cn(controlCls, 'w-[72px] tabular-nums')} />
    : <Term part="count">{cadence.count === 0 ? 'a number' : cadence.count}</Term>
  const lengthControl = editing === 'length'
    ? <select autoFocus value={cadence.length} aria-label="Article length" onBlur={() => setEditing(null)} onChange={e => { setEditing(null); void onSave({ length: e.target.value === 'long' ? 'long' : 'standard' }) }} className={controlCls}>
      <option value="standard">1,200 words</option><option value="long">2,000 words</option>
    </select>
    : <Term part="length">{LENGTH_WORDS[cadence.length]}</Term>
  const postControl = editing === 'post'
    ? <select autoFocus value={cadence.post ? 'post' : 'hold'} aria-label="Post or hold" onBlur={() => setEditing(null)} onChange={e => { setEditing(null); void onSave({ post: e.target.value === 'post' }) }} className={controlCls}>
      <option value="post">post them</option><option value="hold">hold them for approval</option>
    </select>
    : <Term part="post">{cadence.post ? 'post them' : 'hold them for approval'}</Term>
  const time = <span className="inline-block px-0.5 mx-px font-medium leading-[1.15] text-trs-ink border-b-2 border-trs-line-2" title="Set by the nightly scheduler">{cadence.time} SGT</span>

  return (
    <>
      <p className="m-0 text-heading sm:text-title font-semibold leading-[1.7] max-w-[920px] text-trs-ink-2 [text-wrap:balance]">
        {cadence.count === 0
          ? <>Nightly writing is off. Set {countControl} of articles to start.</>
          : <>Every night at {time}, write {countControl} {cadence.count === 1 ? 'article' : 'articles'} of about {lengthControl} on the prompts ticked in the latest analysis, then {postControl} to {site.domain}{site.blog_base_path}.</>}
      </p>
      <p className="m-0 mt-3.5 text-body text-trs-muted">Click an underlined part to change it.</p>
    </>
  )
}

// ── Tonight ──────────────────────────────────────────────────────────────

function Step({ done, title, children, last }: { done: boolean; title: React.ReactNode; children?: React.ReactNode; last?: boolean }) {
  return (
    <li className="flex gap-4">
      <span className="flex flex-col items-center w-[18px] flex-shrink-0">
        <span className={cn('block rounded-full mt-[7px] w-2.5 h-2.5', done ? 'bg-trs-ink' : 'bg-white border-2 border-trs-line-2')} aria-hidden />
        {!last && <span className="block flex-1 w-px mt-1.5 bg-trs-line" aria-hidden />}
      </span>
      <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-[26px]')}>
        <b className="block text-body font-medium">{title}</b>
        {children}
      </div>
    </li>
  )
}

const stepNote = (text: React.ReactNode) => <span className="block text-body leading-[1.5] mt-0.5 max-w-[70ch] text-trs-muted">{text}</span>

function Tonight({ plan, cadence, site, when, siteKey }: { plan: TonightPlan; cadence: Cadence; site: SiteSummary; when: string; siteKey: string | null }) {
  const a = plan.analysis
  const k = plan.knowledge
  const inputs = a && k
  return (
    <div className="grid gap-x-7 gap-y-4 max-w-[980px] grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)]">
      <div className="text-body pt-[3px] text-trs-muted">
        <b className="block text-heading font-semibold text-trs-ink">Tonight</b>
        {when}
      </div>
      <ol className="list-none m-0 p-0 flex flex-col">
        <Step done={!!inputs} title={inputs ? <>Analysis v{a.version} and Knowledge v{k.version}</> : !a ? 'No analysis yet' : 'No knowledge file yet'}>
          {stepNote(inputs
            ? <>Competitors analysis from {shortDate(a.completed_at ?? a.created_at)}, knowledge file saved {fmtDate(k.created_at, true)?.replace(' SGT', '')}{k.created_by ? ` by ${k.created_by.split('@')[0]}` : ''}. Both current.</>
            : !a
              ? <>Run one on <Link href={withSite('/marketing/competitors', siteKey)} className="underline underline-offset-2 text-trs-ink">Competitors</Link>.{!k && ' No knowledge file yet either.'}</>
              : <>Save one on <Link href={withSite('/marketing/knowledge', siteKey)} className="underline underline-offset-2 text-trs-ink">Knowledge</Link>.</>)}
        </Step>
        <Step done={plan.prompts.length > 0} title={plan.prompts.length > 0 ? `${plan.prompts.length} ${plan.prompts.length === 1 ? 'prompt' : 'prompts'} to tackle` : cadence.count === 0 ? 'No articles tonight' : 'No prompts to tackle'}>
          {plan.prompts.length > 0 ? <>
            {stepNote('Ticked in Competitors, not yet covered by an article, highest impressions first.')}
            <ul className="list-none m-0 mt-2 p-0 flex flex-col gap-1.5">
              {plan.prompts.map(p => (
                <li key={p.id} className="text-body text-trs-ink-2">
                  {p.prompt}
                  <em className="not-italic ml-2 text-trs-subtle">{p.impressions == null ? '–' : n(p.impressions)}{p.cited_domains.length ? ` · cited: ${p.cited_domains.join(', ')}` : ''}</em>
                </li>
              ))}
            </ul>
          </> : stepNote(cadence.count === 0
            ? 'Set a number of articles in the sentence above.'
            : <>No prompts ticked. Tick prompts on <Link href={withSite('/marketing/competitors?tab=prompts', siteKey)} className="underline underline-offset-2 text-trs-ink">Competitors</Link>. The night falls back to Search Console targets.</>)}
        </Step>
        <Step done={false} title="Write">
          {stepNote(<>Twelve-step engine, every fact cited from Knowledge {k ? `v${k.version}` : '(no file yet)'}, quality gate on.</>)}
        </Step>
        <Step done={false} last title={cadence.post ? 'Post' : 'Hold for approval'}>
          {stepNote(cadence.post
            ? <>Published to {site.domain}{site.blog_base_path}. Appears in Articles with the prompt it targets. The gate still holds an article that names a banned term or an uncited number.</>
            : <>Saved as awaiting approval. Approve on Articles to publish to {site.domain}{site.blog_base_path}.</>)}
        </Step>
      </ol>
    </div>
  )
}

// ── Nights ───────────────────────────────────────────────────────────────

function Nights({ groups, siteKey }: { groups: NightGroup[]; siteKey: string | null }) {
  if (groups.length === 0) return <Note>No nightly runs yet.</Note>
  return (
    <ul className="list-none m-0 p-0 max-w-[980px]">
      {groups.flatMap(g => g.rows.map((r, i) => (
        <li key={r.run_id} className="grid gap-4 items-baseline py-3.5 text-body grid-cols-2 sm:grid-cols-[120px_minmax(0,1fr)_150px_120px] border-b border-trs-line">
          <span className="tabular-nums text-trs-muted">{i === 0 ? g.label : ''}</span>
          <span className="font-medium min-w-0">
            <Link href={withSite(r.article_id ? `/marketing/articles/${r.article_id}` : `/marketing/generate/runs/${r.run_id}`, siteKey)} className="no-underline hover:underline underline-offset-2 block truncate text-trs-ink">{r.title}</Link>
            <small className="block text-small mt-0.5 truncate text-trs-muted">{r.detail}</small>
          </span>
          <span><Chip>{r.status}</Chip></span>
          <span className="tabular-nums sm:text-right text-trs-muted">{usd(r.cost_usd)}</span>
        </li>
      )))}
    </ul>
  )
}
