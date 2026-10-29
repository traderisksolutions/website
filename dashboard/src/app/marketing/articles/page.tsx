'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DataTableSearch } from '@/components/data-table/toolbar'
import { Segmented } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { MarketingPage, MUTED, Note } from '@/components/marketing/page-shell'
import { useSiteKey, useSites, withSite } from '@/components/marketing/site-switch'
import { ArticleStatusChip, CategoryChip } from '@/components/marketing/chips'
import { NewArticleDialog } from '@/components/marketing/NewArticleDialog'
import { fmtDay, n } from '@/lib/marketing/labels'
import type { ArticleListRow, ArticleStatus, SiteSummary } from '@/lib/marketing/types'

type Payload = { site: SiteSummary; rows: ArticleListRow[]; total: number; counts: Record<ArticleStatus, number> }
type Filter = 'all' | ArticleStatus

export default function ArticlesPage() {
  return <Suspense fallback={null}><Articles /></Suspense>
}

/** Every article for one site. Awaiting approval first: that is where the work is. */
function Articles() {
  const router = useRouter()
  const search = useSearchParams()
  const { sites, error: sitesError } = useSites()
  const [siteKey, setSiteKey] = useSiteKey(sites)
  const filter = (search.get('status') as Filter) || 'all'
  const [q, setQ] = useState(search.get('q') ?? '')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const reqId = useRef(0)
  const query = search.get('q') ?? ''

  const load = useCallback(async () => {
    if (!siteKey) return
    const id = ++reqId.current
    setLoading(true)
    try {
      const p = new URLSearchParams({ site: siteKey })
      if (filter !== 'all') p.set('status', filter)
      if (query) p.set('q', query)
      const res = await fetch(`/api/marketing/articles?${p}`, { cache: 'no-store' })
      const j = await res.json()
      if (id !== reqId.current) return
      if (!res.ok) throw new Error(j.error ?? 'Could not load articles')
      setData(j); setError(null)
    } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (id === reqId.current) setLoading(false) }
  }, [siteKey, filter, query])
  useEffect(() => { void load() }, [load])

  const go = useCallback((next: { status?: Filter; q?: string }) => {
    const p = new URLSearchParams(Array.from(search.entries()))
    if (siteKey) p.set('site', siteKey)
    const status = next.status ?? filter
    if (status === 'all') p.delete('status'); else p.set('status', status)
    const nq = next.q ?? query
    if (nq) p.set('q', nq); else p.delete('q')
    router.replace(`/marketing/articles?${p}`, { scroll: false })
  }, [filter, query, router, search, siteKey])

  useEffect(() => {
    if (q.trim() === query) return
    const t = setTimeout(() => go({ q: q.trim() }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const counts = data?.counts
  const all = counts ? counts.draft + counts.pending + counts.published + counts.archived : 0
  const rows = data?.rows ?? []
  const options = useMemo(() => [
    { value: 'all' as Filter, label: 'All', count: counts ? all : undefined },
    { value: 'pending' as Filter, label: 'Awaiting approval', count: counts?.pending },
    { value: 'published' as Filter, label: 'Published', count: counts?.published },
    { value: 'draft' as Filter, label: 'Drafts', count: counts?.draft },
    { value: 'archived' as Filter, label: 'Archived', count: counts?.archived },
  ], [counts, all])

  return (
    <MarketingPage
      title="Articles"
      line={!counts ? (sitesError ?? 'Loading…') : <>
        <button type="button" onClick={() => go({ status: 'pending' })} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-2 text-[15px]" style={{ color: '#0f1412' }}>{n(counts.pending)} awaiting approval</button>
        {' '}· {n(counts.published)} published · {n(counts.draft)} drafts · {n(counts.archived)} archived
      </>}
      line2={data && <>Public feed <a href={`/api/public/blog?site=${data.site.domain}`} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: '#0f1412' }}>/api/public/blog?site={data.site.domain}</a> · articles render at {data.site.domain}{data.site.blog_base_path}/…</>}
      sites={sites} siteKey={siteKey} onSite={setSiteKey}
      actions={<>
        <Button size="lg" variant="outline" asChild><a href={withSite('/marketing/generate', siteKey)}>Generate</a></Button>
        <Button size="lg" onClick={() => setCreating(true)}>New article</Button>
      </>}
      filters={<>
        <Segmented value={filter} onChange={v => go({ status: v })} options={options} />
        <DataTableSearch value={q} onChange={setQ} placeholder="Search title, slug or topic" className="flex-shrink-0" />
      </>}
    >
      {error && <Note role="alert">{error}</Note>}
      <Register label="Articles" minWidth={900} className={cn(loading && 'opacity-60')}>
        <RegisterHead>
          <RegisterTh first hint="Title, slug and topic">Article</RegisterTh>
          <RegisterTh hint="Draft, awaiting approval, published or archived">Status</RegisterTh>
          <RegisterTh hint="Engine run, written here, or imported from the site's code">Source</RegisterTh>
          <RegisterTh align="right" hint="Words in the body">Words</RegisterTh>
          <RegisterTh hint="Last change">Updated</RegisterTh>
          <RegisterTh last hint="First published">Published</RegisterTh>
        </RegisterHead>
        <tbody>
          {!data && loading ? null : rows.length === 0 ? (
            <RegisterEmpty colSpan={6}>{all === 0 ? 'No articles for this site yet. Generate one, write one, or import the site\'s existing articles.' : 'No articles match.'}</RegisterEmpty>
          ) : rows.map(r => (
            <RegisterRow key={r.id} onClick={() => router.push(withSite(`/marketing/articles/${r.id}`, siteKey))}>
              <RegisterCell first identityWidth={320} primary={r.title} secondary={[`/${r.slug}`, r.topic].filter(Boolean).join(' · ')} />
              <RegisterCell><ArticleStatusChip status={r.status} /></RegisterCell>
              <RegisterCell><CategoryChip category={r.category} /></RegisterCell>
              <RegisterCell align="right"><span className="tabular-nums" style={{ color: MUTED }}>{r.word_count ?? '–'}</span></RegisterCell>
              <RegisterCell><span style={{ color: MUTED }}>{fmtDay(r.updated_at)}</span></RegisterCell>
              <RegisterCell last><span style={{ color: MUTED }}>{fmtDay(r.published_at) ?? '–'}</span></RegisterCell>
            </RegisterRow>
          ))}
        </tbody>
      </Register>
      {data && <p className="m-0 mt-4 text-[13px] tabular-nums" style={{ color: MUTED }} aria-live="polite">{loading ? 'Loading…' : `${n(rows.length)} of ${n(all)} articles`}</p>}
      <NewArticleDialog open={creating} onOpenChange={setCreating} siteKey={siteKey} topics={data?.site.topics ?? []}
        onCreated={id => { setCreating(false); router.push(withSite(`/marketing/articles/${id}`, siteKey)) }} />
    </MarketingPage>
  )
}
