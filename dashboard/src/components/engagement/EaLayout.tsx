/**
 * Engagement Agent — Layout Shell Primitives (Phase 2)
 *
 * Pure structural containers. No data, no business logic, no API calls.
 * These replace the ad-hoc bare <div> wrappers in page.tsx and ThreadView.tsx
 * so the layout vocabulary is named, typed, and driven by --ea-* tokens.
 *
 * Dependency: tokens.css (loaded by shell.tsx) must be active for CSS
 * variables to resolve. These components are safe to render without it —
 * they have explicit fallback values on all var() calls.
 */

import { cn } from '@/lib/utils'
import { forwardRef, type ReactNode, type UIEvent } from 'react'
import { ArrowDown } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// EaListPanel
//
// The left conversation-list pane.
//
// Width is driven by --ea-list-w (300 px from tokens.css), not a hardcoded
// Tailwind class, so a single token change adjusts the whole layout.
//
// mobileHidden: true while the user is viewing a thread on mobile (< lg).
// The list panel fills 100 % width on mobile; the thread area fills it
// when mobileHidden flips — same approach as before, now just named.
// ─────────────────────────────────────────────────────────────────────────────

interface EaListPanelProps {
  children:      ReactNode
  mobileHidden?: boolean    // hide on mobile when thread is active
  className?:    string
}

export function EaListPanel({ children, mobileHidden, className }: EaListPanelProps) {
  return (
    <div
      // Inline style for the CSS-var-driven width: Tailwind can't resolve
      // arbitrary CSS vars in w-[] at build time, so style= is the safe path.
      // Transition keeps the sidebar-collapse-triggered resize (tokens.css) from snapping.
      style={{ width: 'var(--ea-list-w, 300px)', transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)' }}
      className={cn(
        // Layout
        'flex-shrink-0 flex flex-col overflow-hidden',
        // Chrome — white left pane, single subtle divider on the right
        'bg-card',
        // Mobile: full width when visible, hidden when thread is active
        'max-lg:w-full',
        mobileHidden && 'max-lg:hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EaWorkspaceArea
//
// Outer container for the right-of-list area: holds ThreadView or the
// empty-state prompt when nothing is selected.
//
// flex-1 so it grows to fill the remaining horizontal space after the list
// panel. Overflow hidden so the inner thread+context split handles scroll.
//
// mobileHidden: true while the user is viewing the list on mobile.
// ─────────────────────────────────────────────────────────────────────────────

interface EaWorkspaceAreaProps {
  children:      ReactNode
  mobileHidden?: boolean    // hide on mobile when list is active
  className?:    string
}

export function EaWorkspaceArea({ children, mobileHidden, className }: EaWorkspaceAreaProps) {
  return (
    <div
      className={cn(
        'flex-1 flex min-w-0 overflow-hidden',
        mobileHidden && 'max-lg:hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EaWorkspaceColumn
//
// The center column inside ThreadView: flex-1 horizontal, flex-col vertical.
// Contains (top-to-bottom):
//   1. EaThreadHeader  — sticky title bar
//   2. EaMessageArea   — scrollable message list
//   3. ComposePanel    — bottom-anchored compose area
//
// min-w-0 prevents flex children from blowing out the container width.
// min-h-0 is required for the inner overflow-y-auto child to work correctly
// inside a flex-col parent.
// ─────────────────────────────────────────────────────────────────────────────

interface EaWorkspaceColumnProps {
  children:   ReactNode
  className?: string
}

export function EaWorkspaceColumn({ children, className }: EaWorkspaceColumnProps) {
  return (
    <div
      className={cn(
        'flex-1 flex flex-col',
        'min-w-0 min-h-0 overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EaMessageArea
//
// The scrollable reading surface in the center column.
// Background is deliberately hsl(var(--muted)) — a quiet neutral-grey canvas,
// NOT white. This creates a visual surface hierarchy:
//
//   Left pane  (white, chrome)
//   ↓
//   Message area  (light grey canvas — slightly recessed)
//   ↓
//   Right pane (white, chrome)
//
// Individual message cards are white with a hairline border, floating on this
// canvas — the same "card on a quiet ground" pattern most email clients use,
// now in the same neutral-grey the rest of the app uses for tinted surfaces
// (table headers, zebra rows) rather than the old blue-tinted app background.
// flex-1 + min-h-0 pair is required for overflow-y-auto to scroll correctly
// inside a flex-col parent.
// ─────────────────────────────────────────────────────────────────────────────

interface EaMessageAreaProps {
  children:   ReactNode
  className?: string
  onScroll?:  (e: UIEvent<HTMLDivElement>) => void
}

// forwardRef so callers (ThreadView) can hold the actual scroll-container node — needed for
// scroll-position tracking (the "scroll to latest" affordance) and imperative scrollTo calls
// (auto-scroll on send / thread open) without a second, redundant scroll region.
export const EaMessageArea = forwardRef<HTMLDivElement, EaMessageAreaProps>(function EaMessageArea(
  { children, className, onScroll }, ref,
) {
  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={cn(
        'flex-1 min-h-0 overflow-y-auto',
        // Explicit reading surface — differs from the white chrome panels
        'bg-[hsl(var(--muted))]',
        className,
      )}
    >
      {children}
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// EaWorkspaceEmptyState
//
// Shown in EaWorkspaceArea when no conversation is selected.
// Fills the workspace with the reading surface background so the area doesn't
// look like a white void. Uses the EaEmptyThread primitive internally but
// adds the correct full-height centering wrapper.
//
// Accepts the same body content variations that page.tsx already produces
// (loading / no-leads / choose-from-list).
// ─────────────────────────────────────────────────────────────────────────────

interface EaWorkspaceEmptyStateProps {
  title?: string
  body?:  string
}

export function EaWorkspaceEmptyState({
  title = 'Select a conversation',
  body  = 'Choose a conversation from the list to start.',
}: EaWorkspaceEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex-1 flex items-center justify-center',
        // Same reading surface background as EaMessageArea
        'bg-[hsl(var(--muted))]',
      )}
    >
      <div className="flex flex-col items-center gap-1.5 text-center px-8">
        <p className="text-[13px] font-medium text-muted-foreground m-0">{title}</p>
        <p className="text-[11.5px] text-muted-foreground/60 leading-relaxed max-w-[260px] m-0">{body}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ScrollToLatestButton
//
// A subtle floating affordance shown while reading older messages (scrolled
// away from the bottom of EaMessageArea) — positioned relative to
// EaWorkspaceColumn (which is `relative`), not the viewport, so it stays
// pinned to the reading pane rather than the whole page.
// ─────────────────────────────────────────────────────────────────────────────

export function ScrollToLatestButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  if (!visible) return null
  return (
    <button
      onClick={onClick}
      className={cn(
        'absolute bottom-4 right-4 z-10',
        'flex items-center gap-1.5 text-[11px] font-semibold',
        'px-3 py-1.5 rounded-full border border-[--border-subtle]',
        'bg-card text-foreground shadow-[0_2px_10px_rgba(15,23,42,0.12)]',
        'hover:bg-accent transition-colors',
      )}
    >
      <ArrowDown size={12} strokeWidth={2.5} />
      Latest message
    </button>
  )
}
