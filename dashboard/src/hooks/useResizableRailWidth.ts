'use client'

import { useResizableDimension, clampDimension } from './useResizableDimension'

/**
 * Drag/keyboard-resizable width for the engagement rail (the left conversation-list sidebar on
 * /engagement), persisted to localStorage and shared with ConditionalShell's `marginLeft` via a
 * CSS custom property (--engagement-rail-w) that both read — no prop-threading needed between
 * the two sibling components (see engagement-rail.tsx / ConditionalShell.tsx).
 *
 * RAIL_MIN is deliberately narrow (not just "small text") — below RAIL_ICON_THRESHOLD the rail
 * switches to an icon-only rendering mode (avatar circles, no text/search/tabs — see
 * EngagementRail/EngagementFolderNav/ConversationList/EngagementThreadRow's `iconOnly` prop)
 * rather than trying to cram full rows into an unreadably narrow column.
 */
export const RAIL_MIN            = 64
export const RAIL_ICON_THRESHOLD = 88
export const RAIL_MAX            = 520
export const RAIL_DEFAULT        = 340
export const RAIL_STEP           = 10

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
