'use client'

import { useEffect } from 'react'

/**
 * A link inside a page opens in a new tab, so the thread, list or record a person is working on
 * stays where it is (Jarod, 11 Nov 2026). Kept in the same tab: the top bar and place tabs
 * (`header`, `nav`), tab strips, breadcrumbs and pagination (both `nav`), anything marked
 * `data-same-tab`, links that only change this page's query string (a filter, the selected
 * thread), hash links, downloads, mail and phone links, and links that already set a target.
 * Modifier clicks keep the browser's own behaviour.
 */
export function NewTabLinks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const el = e.target instanceof Element ? e.target : null
      const a = el?.closest('a[href]') as HTMLAnchorElement | null
      if (!a || a.target || a.hasAttribute('download') || a.closest('header, nav, [role="tablist"], [data-same-tab]')) return
      const href = a.getAttribute('href') ?? ''
      if (!href || href.startsWith('#') || /^(mailto|tel|sms|javascript):/i.test(href)) return
      let url: URL
      try { url = new URL(a.href, window.location.href) } catch { return }
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      window.open(url.href, '_blank', 'noopener')
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
