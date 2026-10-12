'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Btn, Chip, inputCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { MarketingPage, MUTED, Note } from '@/components/marketing/page-shell'
import { useSiteKey, useSites, withSite } from '@/components/marketing/site-switch'
import { GscStatusChip } from '@/components/marketing/chips'
import { ACTION_KIND_LABEL, fmtDate, n } from '@/lib/marketing/labels'
import type { GscOverview, SiteSummary } from '@/lib/marketing/types'

const INK = '#202124'
type Payload = GscOverview & { site: SiteSummary; configured: boolean }

const ERROR_TEXT: Record<string, string> = {
  not_configured: 'Search Console is not set up: GOOGLE_GSC_CLIENT_ID and GOOGLE_GSC_CLIENT_SECRET (or the Gmail OAuth client with the callback URL registered) are missing.',
  bad_state: 'That connection link expired. Connect again.',
  oauth_failed: 'Google did not complete the connection. Connect again.',
  access_denied: 'Google access was declined.',
  no_site: 'Choose a site first.',
}

export default function SearchConsolePage() {
  return <Suspense fallback={null}><SearchConsole /></Suspense>
}

/** Google Search Console for one site: 28-day totals, what to write or fix next, top queries and pages. */
function SearchConsole() {
  const router = useRouter()
  const search = useSearchParams()
  const { sites } = useSites()
  const [siteKey, setSiteKey] = useSiteKey(sites)
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [property, setProperty] = useState('')
  const reqId = useRef(0)
  const urlError = search.get('error')

  const load = useCallback(async () => {
    if (!siteKey) return
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch(`/api/marketing/gsc?site=${siteKey}`, { cache: 'no-store' })
      const j = await res.json()
      if (id !== reqId.current) return
      if (!res.ok) throw new Error(j.error ?? 'Could not load Search Console data')
      setData(j); setError(null)
    } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (id === reqId.current) setLoading(false) }
  }, [siteKey])
  useEffect(() => { void load() }, [load])

  async function post(path: string, body?: Record<string, unknown>, label?: string) {
    if (!siteKey) return
    setBusy(true); setNote(null); setError(null)
    try {
      const res = await fetch(`/api/marketing/gsc/${path}?site=${siteKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setError(j.error ?? 'Request failed')
      else setNote(label ?? (j.queries != null ? `Synced ${n(j.queries)} queries, ${n(j.pages)} pages, ${n(j.days)} days` : 'Done'))
      await load()
    } finally { setBusy(false) }
  }

  const c = data?.connection
  const status = c?.status ?? 'disconnected'
  const t = data?.totals

  return (
    <MarketingPage
      title="Search Console"
      line={!data ? 'Loading…' : <span className="inline-flex items-center gap-2 flex-wrap">
        <GscStatusChip status={status} />
        {c?.google_email && <span>{c.google_email}</span>}
        {c?.property_url && <span>· {c.property_url}</span>}
        {c?.last_synced_at && <span>· synced {fmtDate(c.last_synced_at, true)}</span>}
        {c?.last_error && <span>· {c.last_error}</span>}
      </span>}
      line2={t && status === 'connected' && <>{n(t.impressions)} impressions · {n(t.clicks)} clicks · {(t.ctr * 100).toFixed(1)}% click rate · position {t.position.toFixed(1)} · last 28 days ({t.days} days of data)</>}
      sites={sites} siteKey={siteKey} onSite={setSiteKey}
      actions={data && (status === 'disconnected'
        ? <Button size="lg" asChild={data.configured} disabled={!data.configured}>{data.configured ? <a href={`/api/marketing/gsc/connect?site=${siteKey}`}>Connect Google Search Console</a> : <span>Connect Google Search Console</span>}</Button>
        : <>
          <Button size="lg" variant="outline" disabled={busy} onClick={() => post('disconnect', undefined, 'Disconnected')}>Disconnect</Button>
          <Button size="lg" disabled={busy || status === 'needs_property'} onClick={() => post('sync')}>{busy ? 'Syncing…' : 'Sync now'}</Button>
        </>)}
    >
      {urlError && <Note role="alert">{ERROR_TEXT[urlError] ?? `Connection failed: ${urlError}`}</Note>}
      {error && <Note role="alert">{error}</Note>}
      {note && <Note role="status">{note}</Note>}
      {data && !data.configured && status === 'disconnected' && <Note>{ERROR_TEXT.not_configured}</Note>}

      {status === 'needs_property' && c && (
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <select value={property} onChange={e => setProperty(e.target.value)} className={`${inputCls} w-auto`}>
            <option value="">Choose a property…</option>
            {c.available_sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <Btn level="primary" disabled={busy || !property} onClick={() => post('select-property', { property }, 'Property set')}>Use this property</Btn>
        </div>
      )}

      {data && status === 'connected' && (
        <div className={cn('flex flex-col gap-8', loading && 'opacity-60')}>
          <section>
            <h2 className="m-0 mb-3 text-[17px] font-medium">Next actions <span className="font-normal" style={{ color: MUTED }}>· ranked by impressions, brand searches excluded</span></h2>
            <Register label="Actions" minWidth={900}>
              <RegisterHead>
                <RegisterTh first hint="The Google search, and the page of ours it lands on">Search</RegisterTh>
                <RegisterTh hint="Rewrite the snippet (page one, few clicks), strengthen the page (page two), or write a new article (beyond 20)">Action</RegisterTh>
                <RegisterTh align="right" hint="28-day impressions">Impressions</RegisterTh>
                <RegisterTh align="right" hint="28-day clicks, and what the position should earn">Clicks</RegisterTh>
                <RegisterTh align="right" hint="Average position of our best page">Position</RegisterTh>
                <RegisterTh last />
              </RegisterHead>
              <tbody>
                {data.actions.length === 0 ? <RegisterEmpty colSpan={6}>No actions yet: sync first, or the site has fewer than 10 impressions per search.</RegisterEmpty> : data.actions.map(a => (
                  <RegisterRow key={a.query}>
                    <RegisterCell first identityWidth={360} primary={a.query} secondary={a.page ? a.page.replace(/^https?:\/\/[^/]+/, '') : undefined} />
                    <RegisterCell><Chip>{ACTION_KIND_LABEL[a.kind]}</Chip></RegisterCell>
                    <RegisterCell align="right"><span className="tabular-nums">{n(a.impressions)}</span></RegisterCell>
                    <RegisterCell align="right"><span className="tabular-nums">{n(a.clicks)}<span style={{ color: MUTED }}> of {a.expectedClicks}</span></span></RegisterCell>
                    <RegisterCell align="right"><span className="tabular-nums">{a.position.toFixed(1)}</span></RegisterCell>
                    <RegisterCell last>{a.kind === 'write' && <Btn level="tertiary" size="xs" onClick={() => router.push(withSite(`/marketing/generate?query=${encodeURIComponent(a.query)}&position=${a.position}`, siteKey))}>Generate</Btn>}</RegisterCell>
                  </RegisterRow>
                ))}
              </tbody>
            </Register>
          </section>

          <section>
            <h2 className="m-0 mb-3 text-[17px] font-medium">Top searches <span className="font-normal" style={{ color: MUTED }}>· last 28 days</span></h2>
            <Register label="Top searches" minWidth={720}>
              <RegisterHead><RegisterTh first>Search</RegisterTh><RegisterTh align="right">Impressions</RegisterTh><RegisterTh align="right">Clicks</RegisterTh><RegisterTh align="right">Click rate</RegisterTh><RegisterTh align="right" last>Position</RegisterTh></RegisterHead>
              <tbody>
                {data.topQueries.length === 0 ? <RegisterEmpty colSpan={5}>No data yet.</RegisterEmpty> : data.topQueries.slice(0, 25).map(r => <MetricRow key={r.label} {...r} />)}
              </tbody>
            </Register>
          </section>

          <section>
            <h2 className="m-0 mb-3 text-[17px] font-medium">Top pages <span className="font-normal" style={{ color: MUTED }}>· last 28 days</span></h2>
            <Register label="Top pages" minWidth={720}>
              <RegisterHead><RegisterTh first>Page</RegisterTh><RegisterTh align="right">Impressions</RegisterTh><RegisterTh align="right">Clicks</RegisterTh><RegisterTh align="right">Click rate</RegisterTh><RegisterTh align="right" last>Position</RegisterTh></RegisterHead>
              <tbody>
                {data.topPages.length === 0 ? <RegisterEmpty colSpan={5}>No data yet.</RegisterEmpty> : data.topPages.slice(0, 25).map(r => <MetricRow key={r.label} {...r} label={r.label.replace(/^https?:\/\/[^/]+/, '') || '/'} />)}
              </tbody>
            </Register>
          </section>
        </div>
      )}
    </MarketingPage>
  )
}

function MetricRow({ label, impressions, clicks, ctr, position }: { label: string; impressions: number; clicks: number; ctr: number; position: number }) {
  return (
    <RegisterRow>
      <RegisterCell first identityWidth={420} primary={<span className="truncate" style={{ color: INK }}>{label}</span>} />
      <RegisterCell align="right"><span className="tabular-nums">{n(impressions)}</span></RegisterCell>
      <RegisterCell align="right"><span className="tabular-nums">{n(clicks)}</span></RegisterCell>
      <RegisterCell align="right"><span className="tabular-nums" style={{ color: MUTED }}>{(ctr * 100).toFixed(1)}%</span></RegisterCell>
      <RegisterCell align="right" last><span className="tabular-nums" style={{ color: MUTED }}>{position.toFixed(1)}</span></RegisterCell>
    </RegisterRow>
  )
}
