'use client'

import { useEffect, useState } from 'react'
import { Btn } from '@/components/crm/primitives'

declare global { interface Window { __TRS_VERSION__?: string } }

/**
 * After a deploy, an open tab still runs the old code until it reloads; its next click can fail.
 * Every minute, and when the tab comes back into view, this asks which release is live. When it
 * differs from the tab's own, a bar offers the reload. It never reloads by itself: a draft in
 * progress is kept.
 */
export function VersionWatch() {
  const [stale, setStale] = useState(false)
  useEffect(() => {
    const mine = window.__TRS_VERSION__
    if (!mine || mine === 'dev') return
    let alive = true
    const check = () => {
      if (document.visibilityState !== 'visible') return
      fetch('/api/version', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => { if (alive && j?.version && j.version !== mine) setStale(true) })
        .catch(() => {})
    }
    const t = setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', check) }
  }, [])
  if (!stale) return null
  return (
    <div role="status" className="flex items-center justify-center gap-3 border-b border-trs-line bg-trs-tint px-4 py-2 text-sm text-trs-ink">
      A new version is live.
      <Btn size="xs" level="primary" onClick={() => window.location.reload()}>Reload</Btn>
    </div>
  )
}
