'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Btn, Field, SectionCard, Segmented, inputCls, textareaCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { MarketingPage, MUTED, Note } from '@/components/marketing/page-shell'
import { useSiteKey, useSites, withSite } from '@/components/marketing/site-switch'
import { GateChip, RunStatusChip } from '@/components/marketing/chips'
import { MARKETS, computeReadiness, marketLabel, type KnowledgeEntry } from '@/lib/marketing/knowledge-schema'
import { fmtDuration } from '@/lib/marketing/engine'
import { TRIGGER_LABEL, fmtDate } from '@/lib/marketing/labels'
import type { MarketingStatus, RunListRow, SiteSummary } from '@/lib/marketing/types'

const INK = '#202124'
type Option = { id: string; label: string }
type Payload = { site: SiteSummary; runs: RunListRow[]; options: { products: Option[]; caseStudies: Option[] }; entries: Pick<KnowledgeEntry, 'section' | 'status' | 'markets'>[]; status: MarketingStatus }
type FocusType = 'product' | 'case_study' | 'market' | 'topic' | 'question'

export default function GeneratePage() {
  return <Suspense fallback={null}><Generate /></Suspense>
}

/** Start an engine run for one site, then follow it. Everything the engine writes is held for approval. */
function Generate() {
  const router = useRouter()
  const search = useSearchParams()
  const { sites } = useSites()
  const [siteKey, setSiteKey] = useSiteKey(sites)
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reqId = useRef(0)

  const presetQuery = search.get('query') ?? ''
  const [focusType, setFocusType] = useState<FocusType>(presetQuery ? 'question' : 'topic')
  const [focusId, setFocusId] = useState('')
  const [topic, setTopic] = useState(presetQuery)
  const [question, setQuestion] = useState(presetQuery)
  const [topicLabel, setTopicLabel] = useState('')
  const [market, setMarket] = useState('SG')
  const [language, setLanguage] = useState<'' | 'en' | 'id'>('')
  const [length, setLength] = useState<'standard' | 'long'>('standard')
  const [instructions, setInstructions] = useState('')

  const load = useCallback(async (probe: boolean) => {
    if (!siteKey) return
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch(`/api/marketing/runs?site=${siteKey}${probe ? '&probe=1' : ''}`, { cache: 'no-store' })
      const j = await res.json()
      if (id !== reqId.current) return
      if (!res.ok) throw new Error(j.error ?? 'Could not load runs')
      setData(j); setError(null)
      const s = j.site as SiteSummary
      setMarket(m => (s.markets.includes(m) ? m : s.markets[0] ?? 'SG'))
      if (!focusId && (j.options.products[0] || j.options.caseStudies[0])) {
        setFocusType(t => (t === 'topic' && !presetQuery && j.options.products.length ? 'product' : t))
        setFocusId(j.options.products[0]?.id ?? j.options.caseStudies[0]?.id ?? '')
      }
    } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (id === reqId.current) setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey])
  useEffect(() => { void load(true) }, [load])

  // Keep the list fresh while a run is active.
  const active = (data?.runs ?? []).some(r => r.status === 'queued' || r.status === 'running')
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => load(false), 5000)
    return () => clearInterval(t)
  }, [active, load])

  const site = data?.site
  const options: Option[] = focusType === 'product' ? data?.options.products ?? [] : focusType === 'case_study' ? data?.options.caseStudies ?? [] : []
  const readiness = useMemo(() => computeReadiness(data?.entries ?? [], market), [data, market])
  const missing = [!readiness.business && 'business facts', !readiness.product && 'a product', !readiness.case_study && 'a case study', !readiness.claim && 'approved claims', !readiness.market && `${marketLabel(market)} market notes`].filter(Boolean) as string[]
  const focusLabel = options.find(o => o.id === focusId)?.label ?? (focusType === 'market' ? marketLabel(market) : focusType === 'question' ? question.trim() : topic.trim())
  const canSubmit = !busy && !!siteKey && readiness.total > 0 && (focusType === 'topic' ? topic.trim().length > 3 : focusType === 'question' ? question.trim().length > 3 : focusType === 'market' || Boolean(focusId))

  function changeFocus(t: FocusType) {
    setFocusType(t)
    setFocusId(t === 'product' ? data?.options.products[0]?.id ?? '' : t === 'case_study' ? data?.options.caseStudies[0]?.id ?? '' : '')
  }

  async function generate() {
    if (!siteKey) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/marketing/runs?site=${siteKey}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          focus: { type: focusType, id: focusType === 'product' || focusType === 'case_study' ? focusId : '', label: focusLabel },
          market, language, topic: focusType === 'question' ? question : topic, reader_question: question, length, extra_instructions: instructions, topic_label: topicLabel,
          target_query: focusType === 'question' ? question.trim() : '', target_position: Number(search.get('position')) || 0,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.runId) { setError(j.error ?? 'Could not start the run'); return }
      router.push(withSite(`/marketing/generate/runs/${j.runId}`, siteKey))
    } finally { setBusy(false) }
  }

  const engineLine = !data ? null : !data.status.engine ? 'Engine not connected: runs queue until CONTENT_ENGINE_URL is set' : data.status.engineReachable === false ? 'Engine connected · not reachable right now; runs queue for its poll loop' : 'Engine connected'

  return (
    <MarketingPage
      title="Generate"
      line={!data ? 'Loading…' : <>{readiness.total} knowledge entries · {readiness.verified} verified · {data.runs.filter(r => r.status === 'completed').length} of {data.runs.length} recent runs completed</>}
      line2={engineLine && <>{engineLine}{site && <> · {site.require_approval ? 'every article is held for approval' : 'articles that pass the gate publish at once'} · nightly {site.nightly_count}</>}</>}
      sites={sites} siteKey={siteKey} onSite={setSiteKey}
      actions={<Btn level="secondary" onClick={() => router.push(withSite('/marketing/knowledge', siteKey))}>Knowledge bank</Btn>}
    >
      {error && <Note role="alert">{error}</Note>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] mb-8">
        <SectionCard title="1. Focus">
          <div className="flex flex-col gap-3">
            <Segmented value={focusType} onChange={changeFocus} options={[
              { value: 'product', label: 'A product or service', count: data?.options.products.length },
              { value: 'case_study', label: 'A case study', count: data?.options.caseStudies.length },
              { value: 'market', label: 'The market itself' },
              { value: 'topic', label: 'A topic' },
              { value: 'question', label: 'A search' },
            ]} />
            {options.length > 0 && (
              <Field label={focusType === 'product' ? 'Product or service' : 'Case study'}>
                <select value={focusId} onChange={e => setFocusId(e.target.value)} className={inputCls}>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
              </Field>
            )}
            {(focusType === 'product' || focusType === 'case_study') && options.length === 0 && <p className="m-0 text-[13.5px]" style={{ color: MUTED }}>No entries of this kind in the knowledge bank yet. <Link href={withSite('/marketing/knowledge', siteKey)} className="underline underline-offset-2" style={{ color: INK }}>Add one</Link></p>}
            {focusType === 'question'
              ? <Field label="The search to rank for" hint="Written as the reader types it into Google"><input value={question} onChange={e => setQuestion(e.target.value)} className={inputCls} placeholder="work injury compensation insurance for contractors" /></Field>
              : <>
                <Field label={focusType === 'topic' ? 'Topic' : 'Topic or angle (optional)'}><input value={topic} onChange={e => setTopic(e.target.value)} className={inputCls} placeholder="When a public liability policy excess is worth raising" /></Field>
                <Field label="The question a reader would ask (optional)"><input value={question} onChange={e => setQuestion(e.target.value)} className={inputCls} placeholder="Does my contractor need work injury cover from me?" /></Field>
              </>}
            {(site?.topics.length ?? 0) > 0 && (
              <Field label="Site topic" hint="The label the site files it under">
                <select value={topicLabel} onChange={e => setTopicLabel(e.target.value)} className={inputCls}>
                  <option value="">Decide at approval</option>
                  {site!.topics.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            )}
          </div>
        </SectionCard>
        <div className="flex flex-col gap-6">
          <SectionCard title="2. Market and length">
            <div className="flex flex-col gap-3">
              <Segmented value={market} onChange={setMarket} options={(site?.markets ?? ['SG']).map(m => ({ value: m, label: marketLabel(m) }))} />
              <Segmented value={language} onChange={setLanguage} options={[{ value: '', label: `${MARKETS.find(m => m.code === market)?.language === 'id' ? 'Bahasa' : 'English'} (market default)` }, { value: 'en', label: 'English' }, { value: 'id', label: 'Bahasa Indonesia' }]} />
              <Segmented value={length} onChange={setLength} options={[{ value: 'standard', label: 'About 1,200 words' }, { value: 'long', label: 'About 2,000 words' }]} />
              {data && missing.length > 0 && <p className="m-0 text-[13.5px]" style={{ color: MUTED }}>Knowledge bank missing {missing.join(', ')}. <Link href={withSite('/marketing/knowledge', siteKey)} className="underline underline-offset-2" style={{ color: INK }}>Add them</Link></p>}
            </div>
          </SectionCard>
          <SectionCard title="3. Extra instructions (optional)">
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3} className={textareaCls} placeholder="Mention the statutory limit; do not mention premiums." />
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <Btn level="primary" disabled={!canSubmit} onClick={generate}>{busy ? 'Starting…' : 'Generate article'}</Btn>
              {data && readiness.total === 0 && <span className="text-[13.5px]" style={{ color: MUTED }}>The knowledge bank is empty: nothing to write from.</span>}
            </div>
          </SectionCard>
        </div>
      </div>

      <h2 className="m-0 mb-3 text-[17px] font-medium">Recent runs</h2>
      <Register label="Runs" minWidth={900} className={cn(loading && 'opacity-60')}>
        <RegisterHead>
          <RegisterTh first hint="When the run was started, Singapore time">Started</RegisterTh>
          <RegisterTh hint="What the article focuses on">Focus</RegisterTh>
          <RegisterTh hint="Market and language">Market</RegisterTh>
          <RegisterTh hint="Queued, running, completed, failed or cancelled">Status</RegisterTh>
          <RegisterTh hint="The deterministic quality gate">Gate</RegisterTh>
          <RegisterTh align="right" hint="Wall-clock time">Time</RegisterTh>
          <RegisterTh align="right" hint="Model spend, USD">Cost</RegisterTh>
          <RegisterTh last hint="Started here, or by the nightly schedule">By</RegisterTh>
        </RegisterHead>
        <tbody>
          {!data && loading ? null : (data?.runs.length ?? 0) === 0 ? <RegisterEmpty colSpan={8}>No runs for this site yet.</RegisterEmpty> : data!.runs.map(r => {
            const g = r.geo_quality?.engine
            return (
              <RegisterRow key={r.id} onClick={() => router.push(withSite(`/marketing/generate/runs/${r.id}`, siteKey))}>
                <RegisterCell first identityWidth={170} primary={fmtDate(r.created_at, true)} />
                <RegisterCell primary={r.setup.focus?.label || r.setup.topic || r.primary_target_name || '(no focus)'} secondary={r.error ? r.error.slice(0, 100) : r.setup.target_query ? `Search: ${r.setup.target_query}` : undefined} />
                <RegisterCell>{r.setup.market ?? '–'}{r.setup.language ? ` · ${r.setup.language.toUpperCase()}` : ''}</RegisterCell>
                <RegisterCell><RunStatusChip status={r.status} /></RegisterCell>
                <RegisterCell><GateChip passed={g?.passed_gate ?? null} /></RegisterCell>
                <RegisterCell align="right"><span className="tabular-nums" style={{ color: MUTED }}>{fmtDuration(r.total_duration_ms)}</span></RegisterCell>
                <RegisterCell align="right"><span className="tabular-nums" style={{ color: MUTED }}>{typeof g?.cost_usd === 'number' ? `$${g.cost_usd.toFixed(2)}` : '–'}</span></RegisterCell>
                <RegisterCell last><span style={{ color: MUTED }}>{TRIGGER_LABEL[r.triggered_by] ?? r.triggered_by}</span></RegisterCell>
              </RegisterRow>
            )
          })}
        </tbody>
      </Register>
    </MarketingPage>
  )
}
