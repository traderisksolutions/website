import { cn } from '@/lib/utils'

// ══════════════════════════════════════════════════════════════════════════════
//  App Shell Layout Primitives
//  ─────────────────────────────────────────────────────────────────────────────
//  Three families:
//
//  1. AppPageHeader — sticky header bar for operational pages with fixed height
//     Use inside any full-height page (contacts, inbound, engagement).
//     Replaces the .page-header CSS utility class pattern.
//
//  2. AppScrollPage — wrapper for standard scrollable pages (campaigns, settings)
//     Provides consistent max-width centering and horizontal padding.
//
//  3. AppSplitLayout / AppListPanel / AppMainPanel — full-height split layouts
//     For list+detail, table+panel, and thread+contact patterns.
//     AppPageBody — scrollable body section within any panel.
// ══════════════════════════════════════════════════════════════════════════════

// ── AppPageHeader ─────────────────────────────────────────────────────────────
// Sticky framed header for full-height operational pages.
// Includes title, optional description, and optional right-side actions.
// Has border-bottom so it visually separates from scrollable content below.

interface AppPageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}

export function AppPageHeader({ title, description, actions, className }: AppPageHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-6 sm:px-10 py-6 flex-shrink-0',
        'border-b border-[#e8eaed] bg-white',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="m-0 text-[28px] font-medium tracking-[-0.02em] leading-[1.15]" style={{ color: '#202124' }}>
          {title}
        </h1>
        {description && (
          <p className="m-0 mt-1 text-[14.5px] leading-snug" style={{ color: '#5f6368' }}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          {actions}
        </div>
      )}
    </div>
  )
}

// ── AppScrollPage ─────────────────────────────────────────────────────────────
// Scrollable page wrapper for standard content pages (campaigns, settings, analytics).
// Provides consistent horizontal padding and optional max-width centering.

interface AppScrollPageProps {
  children: React.ReactNode
  maxWidth?: string
  className?: string
}

export function AppScrollPage({ children, maxWidth = '1100px', className }: AppScrollPageProps) {
  return (
    <div className={cn('min-h-full bg-background', className)}>
      <div className="mx-auto px-6 py-6" style={{ maxWidth }}>
        {children}
      </div>
    </div>
  )
}

// ── AppSplitLayout ────────────────────────────────────────────────────────────
// Full-viewport-height wrapper for list+detail, table+panel, and three-pane layouts.
// Direct children should be AppListPanel / AppMainPanel (or compatible flex siblings).

export function AppSplitLayout({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] overflow-hidden bg-background', className)}>
      {children}
    </div>
  )
}

// ── AppListPanel ──────────────────────────────────────────────────────────────
// Left panel in a split layout — fixed width, full height, border-right.
// Typically contains a header + filter bar + scrollable list.
// Default width is appropriate for a conversation/lead list (340px).

interface AppListPanelProps {
  children: React.ReactNode
  width?: string
  className?: string
}

export function AppListPanel({ children, width = 'w-[340px]', className }: AppListPanelProps) {
  return (
    <div
      className={cn(
        'flex-shrink-0 flex flex-col bg-card overflow-hidden',
        width,
        className,
      )}
    >
      {children}
    </div>
  )
}

// ── AppMainPanel ──────────────────────────────────────────────────────────────
// Right / center main content area in a split layout.
// Takes remaining width (flex-1). Stack with AppPageHeader + AppPageBody inside.

export function AppMainPanel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex-1 flex flex-col overflow-hidden', className)}>
      {children}
    </div>
  )
}

// ── AppPageBody ───────────────────────────────────────────────────────────────
// Scrollable body area for use inside AppMainPanel or AppListPanel after a header.
// Set padded=false when the content manages its own padding (e.g. a table card).

interface AppPageBodyProps {
  children: React.ReactNode
  padded?: boolean
  className?: string
}

export function AppPageBody({ children, padded = true, className }: AppPageBodyProps) {
  return (
    <div
      className={cn(
        'flex-1 overflow-y-auto min-h-0',
        padded && 'px-6 py-6',
        className,
      )}
    >
      {children}
    </div>
  )
}
