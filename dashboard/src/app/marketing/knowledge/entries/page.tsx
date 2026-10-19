'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip, Segmented } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { MarketingPage, MUTED, Note } from '@/components/marketing/page-shell'
import Link from 'next/link'
import { useSiteKey, useSites, withSite } from '@/components/marketing/site-switch'
import { KnowledgeStatusChip } from '@/components/marketing/chips'
import { EntryDrawer } from '@/components/marketing/EntryDrawer'
import { PasteDialog } from '@/components/marketing/PasteDialog'
import { SECTIONS, computeReadiness, marketLabel, type KnowledgeEntry, type KnowledgeSection } from '@/lib/marketing/knowledge-schema'
import { fmtDay, n } from '@/lib/marketing/labels'
import type { SiteSummary } from '@/lib/marketing/types'

type Payload = { site: SiteSummary; entries: KnowledgeEntry[] }

export default function KnowledgeEntriesPage() {
  return <Suspense fallback={null}><Knowledge /></Suspense>
}

/** What the engine may write from, per site. Six sections; verified entries become facts, drafts are flagged. */
function Knowledge() {
  const router = useRouter()
  const search = useSearchParams()
  const { sites } = useSites()
  const [siteKey, setSiteKey] = useSiteKey(sites)
  const section = (search.get('section') as KnowledgeSection) || 'business'
  const openId = search.get('entry')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [market, setMarket] = useState('SG')
  const [pasting, setPasting] = useState(false)
  const reqId = useRef(0)

  const load = useCallback(async () => {
    if (!siteKey) return
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch(`/api/marketing/knowledge?site=${siteKey}`, { cache: 'no-store' })
      const j = await res.json()
      if (id !== reqId.current) return
      if (!res.ok) throw new Error(j.error ?? 'Could not load the knowledge bank')
      setData(j); setError(null)
      setMarket(m => ((j.site as SiteSummary).markets.includes(m) ? m : (j.site as SiteSummary).markets[0] ?? 'SG'))
    } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (id === reqId.current) setLoading(false) }
  }, [siteKey])
  useEffect(() => { void load() }, [load])

  const go = useCallback((next: { section?: KnowledgeSection; entry?: string | null }) => {
    const p = new URLSearchParams(Array.from(search.entries()))
    if (siteKey) p.set('site', siteKey)
    p.set('section', next.section ?? section)
    const e = next.entry === undefined ? openId : next.entry
    if (e) p.set('entry', e); else p.delete('entry')
    router.replace(`/marketing/knowledge/entries?${p}`, { scroll: false })
  }, [openId, router, search, section, siteKey])

  const entries = data?.entries ?? []
  const readiness = useMemo(() => computeReadiness(entries, market), [entries, market])
  const visible = entries.filter(e => e.section === section)
  const ids = visible.map(e => e.id)
  const idx = openId ? ids.indexOf(openId) : -1
  const open = openId === 'new' ? 'new' : entries.find(e => e.id === openId) ?? null
  const missing = [!readiness.business && 'business facts', !readiness.product && 'a product', !readiness.case_study && 'a case study', !readiness.claim && 'approved claims', !readiness.market && `${marketLabel(market)} market notes`].filter(Boolean) as string[]

  return (
    <MarketingPage
      back={<Link href={withSite('/marketing/knowledge', siteKey)} className="no-underline hover:underline" style={{ color: MUTED }}>Knowledge file</Link>}
      title="Knowledge sections"
      line={!data ? 'Loading…' : <>{n(readiness.total)} entries · {n(readiness.verified)} verified · {missing.length === 0 ? `ready to write for ${marketLabel(market)}` : `missing for ${marketLabel(market)}: ${missing.join(', ')}`}</>}
      line2={data && data.site.markets.length > 1 && <span className="inline-flex items-center gap-2">Check readiness for <Segmented value={market} onChange={setMarket} options={data.site.markets.map(m => ({ value: m, label: marketLabel(m) }))} /></span>}
      sites={sites} siteKey={siteKey} onSite={setSiteKey}
      actions={<>
        <Button size="lg" variant="outline" onClick={() => setPasting(true)}>Paste text</Button>
        <Button size="lg" onClick={() => go({ entry: 'new' })}>Add entry</Button>
      </>}
      filters={<Segmented value={section} onChange={v => go({ section: v, entry: null })} options={SECTIONS.map(s => ({ value: s.key, label: s.label, count: readiness.counts[s.key] ?? 0 }))} />}
    >
      {error && <Note role="alert">{error}</Note>}
      {note && <Note role="status">{note}</Note>}
      <Register label={SECTIONS.find(s => s.key === section)?.label ?? 'Entries'} minWidth={760} className={cn(loading && 'opacity-60')}>
        <RegisterHead>
          <RegisterTh first hint="Title and the first line of the entry">Entry</RegisterTh>
          <RegisterTh hint="Verified entries become facts; drafts are flagged as unverified">Status</RegisterTh>
          <RegisterTh hint="Markets the entry applies to">Markets</RegisterTh>
          <RegisterTh align="right" hint="0 to 10; higher loads first">Priority</RegisterTh>
          <RegisterTh last hint="Last change">Updated</RegisterTh>
        </RegisterHead>
        <tbody>
          {!data && loading ? null : visible.length === 0 ? (
            <RegisterEmpty colSpan={5}>Nothing in this section yet. Add an entry or paste text.</RegisterEmpty>
          ) : visible.map(e => {
            const on = e.id === openId
            return (
              <RegisterRow key={e.id} selected={on} onClick={() => go({ entry: on ? null : e.id })}>
                <RegisterCell first selected={on} identityWidth={360} primary={e.title} secondary={e.body.replace(/\s+/g, ' ').slice(0, 140)} />
                <RegisterCell><KnowledgeStatusChip status={e.status} /></RegisterCell>
                <RegisterCell>{e.markets.length ? e.markets.map(m => <Chip key={m} className="mr-1">{m}</Chip>) : <span style={{ color: MUTED }}>All</span>}</RegisterCell>
                <RegisterCell align="right"><span className="tabular-nums" style={{ color: MUTED }}>{e.priority}</span></RegisterCell>
                <RegisterCell last><span style={{ color: MUTED }}>{fmtDay(e.updated_at)}</span></RegisterCell>
              </RegisterRow>
            )
          })}
        </tbody>
      </Register>

      <EntryDrawer entry={open} siteKey={siteKey} defaultSection={section} markets={data?.site.markets ?? ['SG']}
        onClose={() => go({ entry: null })} onChanged={msg => { setNote(msg); void load() }}
        onPrev={idx > 0 ? () => go({ entry: ids[idx - 1] }) : undefined} onNext={idx >= 0 && idx < ids.length - 1 ? () => go({ entry: ids[idx + 1] }) : undefined} />
      <PasteDialog open={pasting} onOpenChange={setPasting} siteKey={siteKey} defaultSection={section} markets={data?.site.markets ?? ['SG']}
        onDone={count => { setPasting(false); setNote(`Added ${count} ${count === 1 ? 'entry' : 'entries'} as drafts`); void load() }} />
    </MarketingPage>
  )
}
