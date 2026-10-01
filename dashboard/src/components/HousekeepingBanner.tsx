'use client'

/**
 * "Since you were away" — what the filing agent did, once, then cleared.
 *
 * Built on the Alert component: informational variant, announced politely rather than as an
 * interruption. Each summary line unfurls what was actually acted on and why, so a wrong
 * decision can be found rather than only counted.
 *
 * Sits under the nav on every page rather than in a notifications panel, because the point is
 * that it is seen and cleared. Draws nothing when the agent did nothing.
 */

import { useCallback, useEffect, useState } from 'react'
import { Alert, type AlertRow } from '@/components/ui/Alert'

type Item = { action: string; text: string; count: number; detail: string[] }
type Payload = { since: string; firstRun: boolean; total: number; items: Item[]; pending: number; error?: string }

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

export function HousekeepingBanner() {
  const [d, setD] = useState<Payload | null>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/housekeeping/since', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (alive && j && !j.error) setD(j as Payload) })
      .catch(() => {})   // the banner is never worth an error on somebody's screen
    return () => { alive = false }
  }, [])

  const dismiss = useCallback(async () => {
    setGone(true)              // go immediately; the write is not worth waiting on
    try { await fetch('/api/housekeeping/since', { method: 'POST' }) }
    catch { /* the mark moves on the next dismissal */ }
  }, [])

  if (!d || gone) return null
  // The banner reports what CHANGED. The pending count is a standing to-do, not a change, so it
  // rides along as an action link but never summons the banner on its own — otherwise unfiled
  // threads would make it permanent and Dismiss would do nothing that survived a reload.
  if (d.items.length === 0) return null

  const rows: AlertRow[] = d.items.map(i => ({ summary: i.text, detail: i.detail }))

  return (
    <div className="px-4 pt-4 sm:px-6">
      <Alert
        variant="info"
        title="Since you were away"
        rows={rows}
        onDismiss={dismiss}
        dataAttr="data-housekeeping-banner"
        actionLabel={d.pending > 0 ? `Choose a client for ${d.pending} conversation${d.pending === 1 ? '' : 's'}` : undefined}
        actionHref={d.pending > 0 ? '/companies/triage' : undefined}
      >
        <span className="tabular-nums">
          {d.firstRun ? 'Last 7 days' : `Last cleared ${when(d.since)}`}
          {d.total > 0 && ` · ${d.total} action${d.total === 1 ? '' : 's'} by the filing agent`}
        </span>
      </Alert>
    </div>
  )
}
