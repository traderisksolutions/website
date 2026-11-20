'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MarketingPage, Note, INK } from '@/components/marketing/page-shell'
import { useSites, withSite } from '@/components/marketing/site-switch'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { timeAgo } from '@/lib/format'
import type { WebsiteOverview } from '@/lib/marketing/website'
import { MEASUREMENT_IDS } from '@/lib/marketing/ga4-types'

export default function WebsitePage() {
  return <Suspense fallback={null}><Website /></Suspense>
}

type Row = { area: string; state: React.ReactNode; figures: React.ReactNode; links: { title: string; href: string }[] }

/** Marketing › one website: its analytics, articles, enquiries and newsletter, and the tools for each. */
function Website() {
  const { key } = useParams<{ key: string }>()
  const router = useRouter()
  const { sites } = useSites()
  const [data, setData] = useState<WebsiteOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setData(null); setError(null)
    fetch(`/api/marketing/websites/${encodeURIComponent(key)}`, { cache: 'no-store' })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Could not load this website'); if (alive) setData(j as WebsiteOverview) })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [key])

  const site = data?.site ?? sites.find(s => s.key === key) ?? null
  const rows: Row[] = data ? [
    {
      area: 'Google Analytics',
      state: MEASUREMENT_IDS[key] ?? 'No tag recorded',
      figures: '—',
      links: MEASUREMENT_IDS[key] ? [{ title: 'Google Analytics', href: withSite('/marketing/analytics', key) }] : [],
    },
    {
      area: 'Search Console',
      state: data.analytics.gsc.connected ? data.analytics.gsc.property : data.analytics.gsc.lastError ?? 'Not connected',
      figures: data.analytics.gsc.lastSynced ? `Synced ${timeAgo(data.analytics.gsc.lastSynced)}` : '—',
      links: [{ title: data.analytics.gsc.connected ? 'Search Console' : 'Connect', href: withSite('/marketing/search-console', key) }],
    },
    {
      area: 'Articles',
      state: `${data.articles.published} published`,
      figures: `${data.articles.pending} awaiting approval · ${data.articles.draft} drafts`,
      links: [
        { title: 'Articles', href: withSite('/marketing/articles', key) },
        { title: 'Generate', href: withSite('/marketing/generate', key) },
        { title: 'Schedule', href: withSite('/marketing/schedule', key) },
      ],
    },
    {
      area: 'Enquiries',
      state: `${data.enquiries.total} received`,
      figures: `${data.enquiries.open} new`,
      links: [data.enquiries.source === 'inbound_leads'
        ? { title: 'Inbound', href: '/inbound/email' }
        : { title: 'Enquiries', href: withSite('/sales/enquiries', key) }],
    },
    {
      area: 'Newsletter',
      state: `${data.newsletter.confirmed} subscribers`,
      figures: `${data.newsletter.pending} awaiting confirmation`,
      links: [{ title: 'Newsletter', href: withSite('/marketing/newsletter', key) }],
    },
    {
      area: 'Settings',
      state: site?.domain ?? '—',
      figures: '—',
      links: [
        { title: 'Knowledge', href: withSite('/marketing/knowledge', key) },
        { title: 'Competitors', href: withSite('/marketing/competitors', key) },
        { title: 'Site settings', href: withSite('/marketing/sites', key) },
      ],
    },
  ] : []

  return (
    <MarketingPage
      title={site?.name ?? 'Website'}
      line={site ? <a href={site.base_url} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: INK }}>{site.domain}</a> : (error ?? 'Loading…')}
      sites={sites} siteKey={key} onSite={k => router.push(`/websites/${k}`)}
    >
      {error && <Note role="alert">{error}</Note>}
      {!data && !error && <Note>Loading…</Note>}
      {data && (
        <Register label={`${site?.name ?? 'Website'} overview`} minWidth={720}>
          <RegisterHead>
            <RegisterTh first>Area</RegisterTh>
            <RegisterTh>State</RegisterTh>
            <RegisterTh>Figures</RegisterTh>
            <RegisterTh last>Open</RegisterTh>
          </RegisterHead>
          <tbody>
            {rows.map(r => (
              <RegisterRow key={r.area}>
                <RegisterCell first align="left" primary={r.area} />
                <RegisterCell align="left">{r.state}</RegisterCell>
                <RegisterCell>{r.figures}</RegisterCell>
                <RegisterCell last>
                  <span className="inline-flex gap-3">
                    {r.links.length === 0 ? '—' : r.links.map(l => <a key={l.title} href={l.href} className="underline underline-offset-2" style={{ color: INK }}>{l.title}</a>)}
                  </span>
                </RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
    </MarketingPage>
  )
}
