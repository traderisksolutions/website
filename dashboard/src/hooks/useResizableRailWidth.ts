'use client'

import { useResizableDimension, clampDimension } from './useResizableDimension'

/**
 * Drag/keyboard-resizable width for the engagement navigator (the left conversation column on
 * /engagement), persisted to localStorage and shared with ConditionalShell's `marginLeft` via a
 * CSS custom property (--engagement-rail-w) that both read — no prop-threading needed between
 * the two sibling components (see engagement-rail.tsx / ConditionalShell.tsx).
 *
 * The navigator never narrows below a readable row (RAIL_MIN). The only narrower state is the
 * collapsed icon rail, a fixed RAIL_COLLAPSED px toggled by `navCollapsed` in the nav provider —
 * that is a separate boolean, not a width the user can drag to, so the two never interfere.
 */
export const RAIL_MIN       = 320
export const RAIL_MAX       = 460
export const RAIL_DEFAULT   = 380
export const RAIL_STEP      = 10
export const RAIL_COLLAPSED = 64

export function clampRailWidth(n: number): number {
  return clampDimension(n, RAIL_MIN, RAIL_MAX)
}

export function useResizableRailWidth() {
  const { value, min, max, step, startDrag, nudge, setAbsolute } = useResizableDimension({
    storageKey: 'engagement_rail_width',
    cssVar:     '--engagement-rail-w',
    min:        RAIL_MIN,
    max:        RAIL_MAX,
    default:    RAIL_DEFAULT,
    step:       RAIL_STEP,
    axis:       'x',
  })
  return { width: value, min, max, step, startDrag, nudge, setAbsolute }
}
