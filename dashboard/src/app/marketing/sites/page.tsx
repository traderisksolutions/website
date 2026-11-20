'use client'

import { Suspense, useEffect, useState } from 'react'
import { Btn, Field, SectionCard, textareaCls } from '@/components/crm/primitives'
import { Input } from '@/components/ui/input'
import { MarketingPage, MUTED, Note } from '@/components/marketing/page-shell'
import { useSiteKey, useSites } from '@/components/marketing/site-switch'
import { marketLabel } from '@/lib/marketing/knowledge-schema'
import type { Site } from '@/lib/marketing/types'
import { updateMarketingSite } from '../actions'

const ALL_MARKETS = ['SG', 'HK', 'MY', 'ID']

export default function SitesPage() {
  return <Suspense fallback={null}><Sites /></Suspense>
}

/** The settings the engine and the public feed read for one site. */
function Sites() {
  const { sites, status, error, reload } = useSites()
  const [siteKey, setSiteKey] = useSiteKey(sites)
  const site = sites.find(s => s.key === siteKey) ?? null
  return (
    <MarketingPage
      title="Sites"
      line={!status ? (error ?? 'Loading…') : <>{sites.length} sites · engine {status.engine ? 'connected' : 'not connected'} · Search Console {status.gsc ? 'configured' : 'not configured'}</>}
      line2={site && <>Public feed <a href={`/api/public/blog?site=${site.domain}`} target="_blank" rel="noreferrer" className="underline underline-offset-2 text-trs-ink">/api/public/blog?site={site.domain}</a></>}
      sites={sites} siteKey={siteKey} onSite={setSiteKey}
    >
      {site ? <SiteForm key={`${site.id}:${site.updated_at}`} site={site} onSaved={reload} /> : <Note>Loading…</Note>}
    </MarketingPage>
  )
}

const lines = (xs: string[]) => xs.join('\n')
const parseLines = (s: string) => s.split(/\n|,/).map(x => x.trim()).filter(Boolean)

function SiteForm({ site, onSaved }: { site: Site; onSaved: () => void }) {
  const [f, setF] = useState({
    name: site.name, business_name: site.business_name, base_url: site.base_url, blog_base_path: site.blog_base_path, contact_url: site.contact_url,
    markets: site.markets, topics: lines(site.topics), brand_terms: lines(site.brand_terms), topic_terms: lines(site.topic_terms), banned_terms: lines(site.banned_terms),
    pillar_pages: site.pillar_pages.map(p => `${p.url} | ${p.title}`).join('\n'), require_approval: site.require_approval, nightly_count: site.nightly_count,
  })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setNote(null) }, [f])

  async function save() {
    setBusy(true); setError(null); setNote(null)
    try {
      const body = {
        ...f, topics: parseLines(f.topics), brand_terms: parseLines(f.brand_terms), topic_terms: parseLines(f.topic_terms), banned_terms: parseLines(f.banned_terms),
        pillar_pages: f.pillar_pages.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [url, ...rest] = l.split('|'); return { url: url.trim(), title: rest.join('|').trim() } }),
      }
      const r = await updateMarketingSite(site.id, body)
      if (!r.ok) { setError(r.error); return }
      setNote('Saved'); onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 max-w-[1100px]">
      <div className="flex flex-col gap-6">
      <SectionCard title="Identity">
        <div className="flex flex-col gap-3">
          <Field label="Name"><Input value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} /></Field>
          <Field label="Business name" hint="Named as the author and publisher in the article's structured data"><Input value={f.business_name} onChange={e => setF(x => ({ ...x, business_name: e.target.value }))} /></Field>
          <Field label="Domain"><Input value={site.domain} disabled /></Field>
          <Field label="Base URL"><Input value={f.base_url} onChange={e => setF(x => ({ ...x, base_url: e.target.value }))} /></Field>
          <Field label="Blog path" hint="Articles live at base URL + path + /slug"><Input value={f.blog_base_path} onChange={e => setF(x => ({ ...x, blog_base_path: e.target.value }))} className="font-mono text-body" /></Field>
          <Field label="Contact URL" hint="Every call to action links here"><Input value={f.contact_url} onChange={e => setF(x => ({ ...x, contact_url: e.target.value }))} /></Field>
        </div>
      </SectionCard>
      <SectionCard title="Search targets">
        <div className="flex flex-col gap-3">
          <Field label="Brand terms" hint="One per line: searches containing these are never targets"><textarea value={f.brand_terms} onChange={e => setF(x => ({ ...x, brand_terms: e.target.value }))} rows={3} className={textareaCls} /></Field>
          <Field label="Topic terms" hint="One per line: a nightly search target must contain one; empty = any"><textarea value={f.topic_terms} onChange={e => setF(x => ({ ...x, topic_terms: e.target.value }))} rows={4} className={textareaCls} /></Field>
        </div>
      </SectionCard>
      </div>
      <div className="flex flex-col gap-6">
      <SectionCard title="Engine">
        <div className="flex flex-col gap-3">
          <Field label="Markets" hint="First selected is the home market">
            <div className="flex flex-wrap gap-3 text-body">
              {ALL_MARKETS.map(m => <label key={m} className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="accent-trs-green" checked={f.markets.includes(m)} onChange={e => setF(x => ({ ...x, markets: e.target.checked ? [...x.markets, m] : x.markets.filter(y => y !== m) }))} />{marketLabel(m)}</label>)}
            </div>
          </Field>
          <Field label="Topics" hint="One per line: the labels the site files articles under"><textarea value={f.topics} onChange={e => setF(x => ({ ...x, topics: e.target.value }))} rows={3} className={textareaCls} /></Field>
          <Field label="Banned terms" hint="One per line: the quality gate holds any article naming these"><textarea value={f.banned_terms} onChange={e => setF(x => ({ ...x, banned_terms: e.target.value }))} rows={3} className={textareaCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Approval"><label className="inline-flex items-center gap-2 h-10 text-body cursor-pointer"><input type="checkbox" className="accent-trs-green" checked={f.require_approval} onChange={e => setF(x => ({ ...x, require_approval: e.target.checked }))} />Hold every article for approval</label></Field>
            <Field label="Articles per night" hint="0 switches the nightly batch off"><Input type="number" min={0} max={12} value={f.nightly_count} onChange={e => setF(x => ({ ...x, nightly_count: Number(e.target.value) }))} /></Field>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Pillar pages">
        <Field label="Service pages to link to" hint="One per line: URL | title. Articles link to these first."><textarea value={f.pillar_pages} onChange={e => setF(x => ({ ...x, pillar_pages: e.target.value }))} rows={5} className={`${textareaCls} font-mono text-small`} /></Field>
      </SectionCard>
      </div>
      <div className="lg:col-span-2 flex items-center gap-3 flex-wrap">
        <Btn level="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn>
        {note && <span className="text-body text-trs-muted" role="status">{note}</span>}
        {error && <span className="text-body" role="alert">{error}</span>}
      </div>
    </div>
  )
}
