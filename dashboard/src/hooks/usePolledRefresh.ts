'use client'

import { useEffect, useRef } from 'react'

/**
 * Re-runs a loader on an interval, replacing the realtime subscriptions we had on Supabase.
 * Cloud SQL cannot push, so the inbox, Nexus and the chat dock poll instead.
 *
 * Two behaviours that matter in practice:
 *  - it pauses while the tab is hidden, so a backgrounded tab costs nothing, and refreshes once
 *    immediately when the tab is focused again, which is when a stale view is actually noticed;
 *  - it never overlaps runs, so a slow response cannot pile up requests behind it.
 */
export function usePolledRefresh(
  load: () => void | Promise<void>,
  opts: { enabled?: boolean; intervalMs?: number; deps?: unknown[] } = {},
) {
  const { enabled = true, intervalMs = 15000 } = opts
  const loadRef = useRef(load)
  loadRef.current = load
  const running = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const tick = async () => {
      if (cancelled || running.current) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      running.current = true
      try { await loadRef.current() } catch { /* transient: try again next tick */ }
      finally { running.current = false }
    }

    const id = window.setInterval(tick, intervalMs)
    const onVisible = () => { if (document.visibilityState === 'visible') void tick() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...(opts.deps ?? [])])
}
