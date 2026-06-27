/**
 * Engagement Agent — Atomic Primitives
 *
 * Small, typed UI atoms used across the engagement component tree.
 * These are NOT wired into existing components yet (that happens in Phase 2/3).
 * They are defined here so the design vocabulary is established and ready.
 *
 * Rules:
 * - No business logic — pure presentation
 * - No API calls or side effects
 * - Every component is self-contained and independently importable
 * - Use --ea-* tokens where a value originates from the design system
 * - Fall back to Tailwind semantics (primary, muted, accent, etc.) otherwise
 */

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// EaAvatar
//
// Initials circle. Three variants drive the tint:
//   outbound — blue-primary (sent by TRS)
//   inbound  — muted neutral (received from contact)
//   active   — primary (selected/highlighted state)
//
// Sizes map to --ea-avatar-* tokens.
// ─────────────────────────────────────────────────────────────────────────────

type AvatarVariant = 'outbound' | 'inbound' | 'active' | 'neutral'
type AvatarSize    = 'xs' | 'sm' | 'md' | 'lg'

interface EaAvatarProps {
  initial:   string
  variant?:  AvatarVariant
  size?:     AvatarSize
  className?: string
}

const AVATAR_SIZE: Record<AvatarSize, string> = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-[12px]',
  lg: 'w-9 h-9 text-[13px]',
}

const AVATAR_VARIANT: Record<AvatarVariant, string> = {
  outbound: 'bg-primary/10 text-primary',
  inbound:  'bg-muted text-muted-foreground',
  active:   'bg-primary/10 text-primary',
  neutral:  'bg-muted text-muted-foreground',
}

export function EaAvatar({ initial, variant = 'neutral', size = 'md', className }: EaAvatarProps) {
  return (
    <div
      className={cn(
        'rounded-full flex-shrink-0 flex items-center justify-center font-bold select-none',
        AVATAR_SIZE[size],
        AVATAR_VARIANT[variant],
        className,
      )}
      aria-hidden
    >
      {initial.slice(0, 1).toUpperCase()}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaPill
//
// Small inline chip/badge. Used for:
//   - source labels (Campaign, Form, FWD)
//   - direction labels (Sent, Received)
//   - status labels (Needs reply)
//   - count badges in tabs
//
// Intentionally small and restrained. Avoid loud colors for non-critical labels.
// ─────────────────────────────────────────────────────────────────────────────

type PillVariant =
  | 'primary'    // blue tint — selected, sent, form leads
  | 'warning'    // amber     — needs reply, campaign
  | 'success'    // green     — replied, converted
  | 'muted'      // neutral   — FWD, general
  | 'outline'    // border-only, no background

interface EaPillProps {
  children:   ReactNode
  variant?:   PillVariant
  className?: string
}

const PILL_VARIANT: Record<PillVariant, string> = {
  primary: 'bg-primary/8 text-primary border-transparent',
  warning: 'bg-[--warning-bg] text-[--warning] border-transparent',
  success: 'bg-[--success-bg] text-[--success] border-transparent',
  muted:   'bg-muted text-muted-foreground border-transparent',
  outline: 'bg-transparent text-muted-foreground border-[--border-subtle]',
}

export function EaPill({ children, variant = 'muted', className }: EaPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap',
        'text-[10px] font-[600] leading-none',
        'px-[7px] h-[18px] rounded-[20px] border',
        PILL_VARIANT[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaSectionLabel
//
// The uppercase micro-label that heads every section in the context panel,
// the AI analysis block, the draft history section, etc.
// Matches --ea-section-label-* tokens.
// ─────────────────────────────────────────────────────────────────────────────

interface EaSectionLabelProps {
  children:   ReactNode
  className?: string
  /** Remove the default bottom margin — useful when the label is part of a flex header row */
  noMargin?:  boolean
}

export function EaSectionLabel({ children, className, noMargin }: EaSectionLabelProps) {
  return (
    <p
      className={cn(
        'text-[9.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground/70 m-0 leading-none',
        !noMargin && 'mb-1',
        className,
      )}
    >
      {children}
    </p>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaFieldLabel
//
// Same visual treatment as EaSectionLabel but used above individual form
// fields (Name, Email, Phone, Company, etc.) — slightly tighter bottom margin.
// ─────────────────────────────────────────────────────────────────────────────

interface EaFieldLabelProps {
  children:   ReactNode
  className?: string
}

export function EaFieldLabel({ children, className }: EaFieldLabelProps) {
  return (
    <p
      className={cn(
        'text-[9.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground/70 m-0 mb-0.5 leading-none',
        className,
      )}
    >
      {children}
    </p>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaMetaStat
//
// A label + bold numeric/text value pair. Used in the context panel header to
// show "Emails: 6", "Days open: 12", "Last reply: 2h ago".
// ─────────────────────────────────────────────────────────────────────────────

interface EaMetaStatProps {
  label:      string
  value:      string
  /** Render the value in a smaller, muted style (e.g. relative timestamps) */
  secondary?: boolean
  className?: string
}

export function EaMetaStat({ label, value, secondary, className }: EaMetaStatProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      <span className="text-[9px] font-bold uppercase tracking-[0.07em] text-muted-foreground/60 leading-none mb-0.5">
        {label}
      </span>
      <span
        className={cn(
          'font-bold leading-none',
          secondary
            ? 'text-[11px] text-muted-foreground'
            : 'text-[14px] text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaStatusDot
//
// Small colored dot indicating reply state in the context panel header row
// and the conversation list item.
// ─────────────────────────────────────────────────────────────────────────────

type StatusDotVariant = 'needs-reply' | 'replied' | 'none'

const STATUS_DOT_COLOR: Record<StatusDotVariant, string> = {
  'needs-reply': 'bg-[--warning]',
  'replied':     'bg-[--success]',
  'none':        'bg-border',
}

interface EaStatusDotProps {
  variant:    StatusDotVariant
  className?: string
}

export function EaStatusDot({ variant, className }: EaStatusDotProps) {
  return (
    <span
      className={cn(
        'block flex-shrink-0 w-1.5 h-1.5 rounded-full',
        STATUS_DOT_COLOR[variant],
        className,
      )}
      aria-hidden
    />
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaDivider
//
// A horizontal rule between context panel sections.
// Thinner and more restrained than a full border — uses --border-subtle.
// ─────────────────────────────────────────────────────────────────────────────

interface EaDividerProps {
  className?: string
}

export function EaDivider({ className }: EaDividerProps) {
  return (
    <div
      className={cn('h-px w-full bg-[--border-subtle] flex-shrink-0', className)}
      role="separator"
      aria-hidden
    />
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaEmptyThread
//
// Centered empty state shown in the message area when no thread is selected
// or when a lead has no email history. Accepts an optional message override.
// ─────────────────────────────────────────────────────────────────────────────

interface EaEmptyThreadProps {
  title?:     string
  body?:      string
  className?: string
}

export function EaEmptyThread({
  title = 'Select a conversation',
  body  = 'Choose a conversation from the list to view the thread.',
  className,
}: EaEmptyThreadProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 py-16 px-8 text-center',
        className,
      )}
    >
      <p className="text-[13px] font-medium text-muted-foreground m-0">{title}</p>
      <p className="text-[11.5px] text-muted-foreground/70 leading-relaxed max-w-[260px] m-0">{body}</p>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaSkeletonRow
//
// A single shimmer row for the conversation list loading state.
// Compose multiples to build the skeleton list.
// Uses the global `.skeleton` class from globals.css (shimmer keyframe).
// ─────────────────────────────────────────────────────────────────────────────

interface EaSkeletonRowProps {
  avatarSize?: string
  className?:  string
}

export function EaSkeletonRow({ avatarSize = 'w-8 h-8', className }: EaSkeletonRowProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-3 py-3 border-b border-[--border-subtle]',
        className,
      )}
      aria-hidden
    >
      {/* Avatar placeholder */}
      <div className={cn('skeleton rounded-full flex-shrink-0', avatarSize)} />
      {/* Text lines */}
      <div className="flex-1 min-w-0 flex flex-col gap-2 pt-0.5">
        <div className="flex items-center justify-between gap-4">
          <div className="skeleton h-2.5 w-28 rounded" />
          <div className="skeleton h-2 w-10 rounded flex-shrink-0" />
        </div>
        <div className="skeleton h-2 w-40 rounded" />
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaSkeletonList
//
// Full conversation list skeleton — renders N shimmer rows.
// ─────────────────────────────────────────────────────────────────────────────

interface EaSkeletonListProps {
  rows?:      number
  className?: string
}

export function EaSkeletonList({ rows = 6, className }: EaSkeletonListProps) {
  return (
    <div className={cn('flex flex-col', className)} aria-label="Loading conversations" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <EaSkeletonRow key={i} />
      ))}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaSkeletonMessage
//
// A shimmer placeholder for a message card while thread is loading.
// Shows a collapsed-card-style skeleton with avatar + two text lines.
// ─────────────────────────────────────────────────────────────────────────────

interface EaSkeletonMessageProps {
  className?: string
}

export function EaSkeletonMessage({ className }: EaSkeletonMessageProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg border border-[--border-subtle] bg-card',
        className,
      )}
      aria-hidden
    >
      <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-8">
          <div className="skeleton h-2.5 w-24 rounded" />
          <div className="skeleton h-2 w-12 rounded flex-shrink-0" />
        </div>
        <div className="skeleton h-2 w-48 rounded" />
      </div>
      <div className="skeleton w-3 h-3 rounded flex-shrink-0" />
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaInlineError
//
// Small inline error text. Used in compose footer, draft generation, send action.
// ─────────────────────────────────────────────────────────────────────────────

interface EaInlineErrorProps {
  message:    string
  className?: string
}

export function EaInlineError({ message, className }: EaInlineErrorProps) {
  return (
    <span
      className={cn('text-[11px] text-[--error] leading-tight max-w-[200px]', className)}
      role="alert"
    >
      {message}
    </span>
  )
}
