'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { freshPending, pushCrumb, readTrail, startFresh, syncHere, withTrail } from '@/lib/nav/trail'
import { locate } from './nav-sections'

/**
 * A link inside a page opens in a new tab, so the thread, list or record a person is working on
 * stays where it is (Jarod, 11 Nov 2026). Kept in the same tab: the top bar and place tabs
 * (`header`, `nav`), tab strips, breadcrumbs and pagination (both `nav`), anything marked
 * `data-same-tab`, links that only change this page's query string (a filter, the selected
 * thread), hash links, downloads, mail and phone links, and links that already set a target.
 * Modifier clicks keep the browser's own behaviour. The new tab takes the trail with it, so its
 * breadcrumbs lead back here.
 *
 * Also the trail's recorder for list pages: a page of the top bar (Inbox, Companies, Today) puts
 * itself on the trail when opened, so a record opened from it shows "← Companies". Detail pages
 * register themselves through Breadcrumbs; this never adds a step for a path that already is the
 * trail's last. A click in the top bar or the place tabs starts a new trail (`startFresh`).
 */
export function NewTabLinks() {
  const pathname = usePathname()
  useEffect(() => {
    const { place, tab } = locate(pathname)
    if (!place || !tab || tab.href !== pathname) return
    const last = readTrail().at(-1)
    if (last && last.href.split('?')[0] === pathname && !freshPending()) return
    const label = tab.title === place.label ? place.label : `${place.label} · ${tab.title}`
    pushCrumb({ label, href: pathname })
  }, [pathname])
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const el = e.target instanceof Element ? e.target : null
      const a = el?.closest('a[href]') as HTMLAnchorElement | null
      if (!a) return
      // The top bar and the place tabs start a new trail; every other link first records where
      // on this page the person is (the thread, the tab), so Back returns there.
      if (!a.closest('header, .trs-place-tabs')) syncHere()
      else if (a.pathname !== window.location.pathname) startFresh()
      if (a.target || a.hasAttribute('download') || a.closest('header, nav, [role="tablist"], [data-same-tab]')) return
      const href = a.getAttribute('href') ?? ''
      if (!href || href.startsWith('#') || /^(mailto|tel|sms|javascript):/i.test(href)) return
      let url: URL
      try { url = new URL(a.href, window.location.href) } catch { return }
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      window.open(withTrail(url.href, readTrail()), '_blank', 'noopener')
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
