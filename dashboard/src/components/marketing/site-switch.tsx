'use client'

// Every Marketing page is scoped to one of the business's websites. The choice lives in the URL
// (?site=<key>) so links carry it, and in localStorage so the next visit opens on the same site.
import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { inputCls } from '@/components/crm/primitives'
import type { MarketingStatus, Site } from '@/lib/marketing/types'

const STORAGE_KEY = 'trs_site'
type SitesPayload = { sites: Site[]; status: MarketingStatus }
let cached: Promise<SitesPayload> | null = null

export function useSites(): { sites: Site[]; status: MarketingStatus | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<SitesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!cached) cached = fetch('/api/marketing/sites', { cache: 'no-store' }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Could not load sites'); return j as SitesPayload })
    let alive = true
    cached.then(j => { if (alive) setData(j) }).catch(e => { cached = null; if (alive) setError(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [tick])
  return { sites: data?.sites ?? [], status: data?.status ?? null, error, reload: () => { cached = null; setTick(t => t + 1) } }
}

/** The current site key and a setter that updates the URL and remembers the choice. */
export function useSiteKey(sites: Site[]): [string | null, (key: string) => void] {
  const search = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [stored, setStored] = useState<string | null>(null)
  useEffect(() => { try { setStored(localStorage.getItem(STORAGE_KEY)) } catch { /* private mode */ } }, [])
  const param = search.get('site')
  const valid = (k: string | null) => (k && sites.some(s => s.key === k) ? k : null)
  const key = valid(param) ?? valid(stored) ?? sites[0]?.key ?? null
  const set = useCallback((k: string) => {
    try { localStorage.setItem(STORAGE_KEY, k) } catch { /* ignore */ }
    setStored(k)
    const p = new URLSearchParams(Array.from(search.entries()))
    p.set('site', k)
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
  }, [pathname, router, search])
  return [key, set]
}

export function SiteSelect({ sites, value, onChange, className }: { sites: Site[]; value: string | null; onChange: (k: string) => void; className?: string }) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-[13.5px]', className)} style={{ color: '#5f6368' }}>
      Site
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} aria-label="Site" className={cn(inputCls, 'h-9 w-auto text-[13.5px] pr-8 font-medium')}>
        {sites.length === 0 && <option value="">Loading…</option>}
        {sites.map(s => <option key={s.key} value={s.key}>{s.domain}</option>)}
      </select>
    </label>
  )
}

/** Appends the site to an in-app link. */
export const withSite = (href: string, key: string | null) => (key ? `${href}${href.includes('?') ? '&' : '?'}site=${key}` : href)
