'use client'

import { useEffect } from 'react'
import { Btn, LinkBtn } from '@/components/crm/primitives'
import { PageFrame } from '@/components/page-frame'
import { PageHeader } from '@/components/page-header'

const RELOADED = 'trs.stale-reload'

/** A stale tab after a deploy asks for code that no longer exists; one reload fixes it. */
const isStale = (e: Error) => /ChunkLoadError|Loading chunk|Failed to load chunk|Failed to find Server Action/i.test(`${e.name} ${e.message}`)

/** Any page that throws while rendering shows this instead of a blank screen. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!isStale(error)) return
    try {
      const last = Number(sessionStorage.getItem(RELOADED) ?? 0)
      if (Date.now() - last > 60_000) { sessionStorage.setItem(RELOADED, String(Date.now())); window.location.reload() }
    } catch { /* storage blocked: the button below still works */ }
  }, [error])

  return (
    <PageFrame width="read">
      <PageHeader title="This page could not load" meta={error.digest ? `Reference ${error.digest}` : undefined}
        actions={<><LinkBtn href="/today">Today</LinkBtn><Btn level="primary" onClick={reset}>Try again</Btn></>} />
      <p className="m-0 text-sm text-trs-muted">{isStale(error) ? 'A new version went live while this tab was open. Reload the page.' : error.message || 'An unexpected error.'}</p>
    </PageFrame>
  )
}
