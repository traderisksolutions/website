'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Shared drag/keyboard-resize engine behind both the engagement rail's width (horizontal) and
 * the reply composer's editor height (vertical) — one implementation of the pointer-event
 * lifecycle, CSS-var write, and localStorage persistence instead of two near-identical copies.
 * See useResizableRailWidth.ts and useResizableComposerHeight.ts for the two call sites.
 *
 * Follows the same SSR-safe pattern useNarrowViewport already uses elsewhere in this app:
 * render a fixed default on first paint, then correct from localStorage in a client-only effect,
 * so no new class of hydration mismatch is introduced.
 */
export type ResizeAxis = 'x' | 'y'

export interface ResizableDimensionConfig {
  storageKey: string
  cssVar:     string
  min:        number
  max:        number
  default:    number
  step?:      number
  /** 'x' = a horizontal drag (clientX) changes the value (a width); 'y' = a vertical drag
   *  (clientY) changes the value (a height). */
  axis:       ResizeAxis
  /** A handle anchored at the LEADING edge (e.g. a height handle at the top of its element)
   *  needs the opposite sign from one anchored at the trailing edge (bottom/right) — default
   *  (false) assumes trailing-edge anchoring, where dragging right/down grows the value. */
  invert?:    boolean
}

export function clampDimension(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

function applyCssVar(name: string, px: number) {
  if (typeof document !== 'undefined') document.documentElement.style.setProperty(name, `${px}px`)
}

export function useResizableDimension(config: ResizableDimensionConfig) {
  const { storageKey, cssVar, min, max, default: def, step = 10, axis, invert = false } = config
  const [value, setValue] = useState(def)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let stored = def
    try {
      const raw = Number(localStorage.getItem(storageKey))
      if (raw) stored = clampDimension(raw, min, max)
    } catch { /* best effort — localStorage unavailable (private mode, etc.) */ }
    setValue(stored)
    applyCssVar(cssVar, stored)
    // Stop any in-flight drag if this component unmounts mid-drag (route change, etc.).
    return () => cleanupRef.current?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commit = useCallback((px: number) => {
    const clamped = clampDimension(px, min, max)
    setValue(clamped)
    applyCssVar(cssVar, clamped)
    try { localStorage.setItem(storageKey, String(clamped)) } catch { /* best effort */ }
  }, [cssVar, storageKey, min, max])

  /** Begin a pointer drag from a handle. Listens on `window` (not the handle element) so the
   *  drag keeps tracking even if the pointer moves off the thin handle strip mid-drag, and stops
   *  cleanly on pointerup/pointercancel/window-blur (covers the pointer leaving the browser
   *  window, e.g. an alt-tab mid-drag). CSSOM writes are rAF-batched — at most one style mutation
   *  per animation frame, not one per pointermove event. */
  const startDrag = useCallback((startPos: number, startValue: number) => {
    let raf: number | null = null
    let latest = startValue

    function flush() {
      raf = null
      applyCssVar(cssVar, clampDimension(latest, min, max))
    }
    function onMove(e: PointerEvent) {
      const pos = axis === 'x' ? e.clientX : e.clientY
      const delta = pos - startPos
      latest = startValue + (invert ? -delta : delta)
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
      cleanupRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
    cleanupRef.current = cleanup
  }, [axis, invert, cssVar, min, max, commit])

  /** Keyboard adjustment — discrete, so it goes straight through committed state (unlike the
   *  rAF-batched drag path above). */
  const nudge = useCallback((delta: number) => commit(value + delta), [commit, value])
  const setAbsolute = useCallback((px: number) => commit(px), [commit])

  return { value, min, max, step, startDrag, nudge, setAbsolute }
}
