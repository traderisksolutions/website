'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Drag/keyboard-resizable width for the engagement rail (the left conversation-list sidebar on
 * /engagement), persisted to localStorage and shared with ConditionalShell's `marginLeft` via a
 * CSS custom property (--engagement-rail-w) that both read — no prop-threading needed between
 * the two sibling components (see engagement-rail.tsx / ConditionalShell.tsx).
 *
 * Follows the same SSR-safe pattern useNarrowViewport already uses elsewhere in this app:
 * render a fixed default on first paint, then correct from localStorage in a client-only effect,
 * so no new class of hydration mismatch is introduced.
 */
export const RAIL_MIN     = 260
export const RAIL_MAX     = 520
export const RAIL_DEFAULT = 340
export const RAIL_STEP    = 10

const STORAGE_KEY = 'engagement_rail_width'
const CSS_VAR     = '--engagement-rail-w'

export function clampRailWidth(n: number): number {
  if (!Number.isFinite(n)) return RAIL_DEFAULT
  return Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(n)))
}

function applyCssVar(px: number) {
  if (typeof document !== 'undefined') document.documentElement.style.setProperty(CSS_VAR, `${px}px`)
}

export function useResizableRailWidth() {
  const [width, setWidth] = useState(RAIL_DEFAULT)
  const draggingCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let stored = RAIL_DEFAULT
    try {
      const raw = Number(localStorage.getItem(STORAGE_KEY))
      if (raw) stored = clampRailWidth(raw)
    } catch { /* best effort — localStorage unavailable (private mode, etc.) */ }
    setWidth(stored)
    applyCssVar(stored)
    // Stop any in-flight drag if this component unmounts mid-drag (route change, etc.).
    return () => draggingCleanupRef.current?.()
  }, [])

  const commit = useCallback((px: number) => {
    const clamped = clampRailWidth(px)
    setWidth(clamped)
    applyCssVar(clamped)
    try { localStorage.setItem(STORAGE_KEY, String(clamped)) } catch { /* best effort */ }
  }, [])

  /** Begin a pointer drag from the handle. Listens on `window` (not the handle element) so the
   *  drag keeps tracking even if the pointer moves off the thin handle strip mid-drag, and stops
   *  cleanly on pointerup/pointercancel/window-blur (covers the pointer leaving the browser
   *  window, e.g. an alt-tab mid-drag). CSSOM writes are rAF-batched — at most one style mutation
   *  per animation frame, not one per pointermove event. */
  const startDrag = useCallback((startClientX: number, startWidth: number) => {
    let raf: number | null = null
    let latest = startWidth

    function flush() {
      raf = null
      applyCssVar(clampRailWidth(latest))
    }
    function onMove(e: PointerEvent) {
      latest = startWidth + (e.clientX - startClientX)
      if (raf == null) raf = requestAnimationFrame(flush)
    }
    function stop() {
      cleanup()
      commit(latest)
    }
    function cleanup() {
      if (raf != null) cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
      draggingCleanupRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
    draggingCleanupRef.current = cleanup
  }, [commit])

  /** Keyboard adjustment — discrete, so it goes straight through committed state (unlike the
   *  rAF-batched drag path above). */
  const nudge = useCallback((delta: number) => commit(width + delta), [commit, width])
  const setAbsolute = useCallback((px: number) => commit(px), [commit])

  return { width, min: RAIL_MIN, max: RAIL_MAX, step: RAIL_STEP, startDrag, nudge, setAbsolute }
}
