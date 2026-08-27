'use client'

import { useResizableDimension, clampDimension } from './useResizableDimension'

/**
 * Drag-resizable height for the reply composer's editor area (see engagement-compose-panel.tsx),
 * persisted to localStorage and shared via the --engagement-composer-h CSS custom property. The
 * handle sits on the editor's own bottom edge, so dragging DOWN grows it (no inversion needed —
 * trailing-edge anchoring, same as the rail's right-edge handle).
 */
export const COMPOSER_MIN     = 120
export const COMPOSER_MAX     = 600
export const COMPOSER_DEFAULT = 220
export const COMPOSER_STEP    = 20

export function clampComposerHeight(n: number): number {
  return clampDimension(n, COMPOSER_MIN, COMPOSER_MAX)
}

export function useResizableComposerHeight() {
  const { value, min, max, step, startDrag, nudge, setAbsolute } = useResizableDimension({
    storageKey: 'engagement_composer_height',
    cssVar:     '--engagement-composer-h',
    min:        COMPOSER_MIN,
    max:        COMPOSER_MAX,
    default:    COMPOSER_DEFAULT,
    step:       COMPOSER_STEP,
    axis:       'y',
  })
  return { height: value, min, max, step, startDrag, nudge, setAbsolute }
}
