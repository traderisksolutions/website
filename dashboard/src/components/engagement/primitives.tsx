/**
 * Engagement Agent — Atomic Primitives
 *
 * Small, typed UI atoms used across the engagement component tree.
 *
 * Rules:
 * - No business logic — pure presentation
 * - No API calls or side effects
 * - Every component is self-contained and independently importable
 * - Tokens only: ink #202124, body #3c4043, muted #5f6368, faint #80868b, dot #9aa0a6,
 *   hairline #e8eaed, control #dadce0, field #f1f3f4. State is never colour-coded — every
 *   variant that used to carry a tint (outbound blue, warning amber, success green) is the
 *   same neutral field; the label carries the meaning.
 */

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

const INK   = '#202124'
const BODY  = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const FIELD = '#f1f3f4'
const HAIR  = '#e8eaed'
const CTRL  = '#dadce0'

// ─────────────────────────────────────────────────────────────────────────────
// EaAvatar — initials circle. Variants kept for API compatibility; all neutral now
// except `active` (ink on white text, the selected state).
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

const AVATAR_VARIANT: Record<AvatarVariant, { background: string; color: string }> = {
  outbound: { background: FIELD, color: INK },
  inbound:  { background: FIELD, color: BODY },
  active:   { background: INK,   color: '#fff' },
  neutral:  { background: FIELD, color: BODY },
}

export function EaAvatar({ initial, variant = 'neutral', size = 'md', className }: EaAvatarProps) {
  return (
    <div
      className={cn('rounded-full flex-shrink-0 flex items-center justify-center font-medium select-none', AVATAR_SIZE[size], className)}
      style={AVATAR_VARIANT[variant]}
      aria-hidden
    >
      {initial.slice(0, 1).toUpperCase()}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaPill — small inline chip. rounded-[6px], 11.5px medium, neutral field; the
// label carries the meaning. `outline` is border-only.
// ─────────────────────────────────────────────────────────────────────────────

type PillVariant =
  | 'primary'
  | 'warning'
  | 'success'
  | 'muted'
  | 'outline'

interface EaPillProps {
  children:   ReactNode
  variant?:   PillVariant
  className?: string
}

const PILL_VARIANT: Record<PillVariant, { background: string; color: string; border: string }> = {
  primary: { background: FIELD, color: BODY, border: 'transparent' },
  warning: { background: FIELD, color: BODY, border: 'transparent' },
  success: { background: FIELD, color: BODY, border: 'transparent' },
  muted:   { background: FIELD, color: BODY, border: 'transparent' },
  outline: { background: 'transparent', color: MUTED, border: CTRL },
}

export function EaPill({ children, variant = 'muted', className }: EaPillProps) {
  const s = PILL_VARIANT[variant]
  return (
    <span
      className={cn('inline-flex items-center whitespace-nowrap text-[11.5px] font-medium leading-none px-2 h-[20px] rounded-[6px] border', className)}
      style={{ background: s.background, color: s.color, borderColor: s.border }}
    >
      {children}
    </span>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaSectionLabel — the small label that heads a section in the context panel.
// 12px muted, sentence case (no uppercase tracking).
// ─────────────────────────────────────────────────────────────────────────────

interface EaSectionLabelProps {
  children:   ReactNode
  className?: string
  /** Remove the default bottom margin — useful when the label is part of a flex header row */
  noMargin?:  boolean
}

export function EaSectionLabel({ children, className, noMargin }: EaSectionLabelProps) {
  return (
    <p className={cn('text-[12px] font-medium m-0 leading-none', !noMargin && 'mb-1.5', className)} style={{ color: MUTED }}>
      {children}
    </p>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaFieldLabel — same treatment above individual form fields.
// ─────────────────────────────────────────────────────────────────────────────

interface EaFieldLabelProps {
  children:   ReactNode
  className?: string
}

export function EaFieldLabel({ children, className }: EaFieldLabelProps) {
  return (
    <p className={cn('text-[12px] font-medium m-0 mb-1 leading-none', className)} style={{ color: MUTED }}>
      {children}
    </p>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaMetaStat — a label + value pair ("Emails: 6", "Days open: 12").
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
      <span className="text-[12px] leading-none mb-1" style={{ color: MUTED }}>{label}</span>
      <span className={cn('font-medium leading-none tabular-nums', secondary ? 'text-[12.5px]' : 'text-[14px]')} style={{ color: secondary ? MUTED : INK }}>
        {value}
      </span>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaStatusDot — reply-state dot. Ink = needs reply, dot grey = replied, hairline = none.
// ─────────────────────────────────────────────────────────────────────────────

type StatusDotVariant = 'needs-reply' | 'replied' | 'none'

const STATUS_DOT_COLOR: Record<StatusDotVariant, string> = {
  'needs-reply': INK,
  'replied':     '#9aa0a6',
  'none':        HAIR,
}

interface EaStatusDotProps {
  variant:    StatusDotVariant
  className?: string
}

export function EaStatusDot({ variant, className }: EaStatusDotProps) {
  return (
    <span className={cn('block flex-shrink-0 w-1.5 h-1.5 rounded-full', className)} style={{ background: STATUS_DOT_COLOR[variant] }} aria-hidden />
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaDivider — one hairline between sections.
// ─────────────────────────────────────────────────────────────────────────────

interface EaDividerProps {
  className?: string
}

export function EaDivider({ className }: EaDividerProps) {
  return <div className={cn('h-px w-full flex-shrink-0', className)} style={{ background: HAIR }} role="separator" aria-hidden />
}


// ─────────────────────────────────────────────────────────────────────────────
// EaEmptyThread — one muted sentence, centred.
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
    <div className={cn('flex flex-col items-center justify-center gap-1.5 py-16 px-8 text-center', className)}>
      <p className="text-[15px] font-medium m-0" style={{ color: INK }}>{title}</p>
      <p className="text-[13.5px] leading-relaxed max-w-[280px] m-0" style={{ color: MUTED }}>{body}</p>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// EaSkeletonRow — one shimmer row for the conversation list loading state.
// Uses the global `.skeleton` class from globals.css (shimmer keyframe).
// ─────────────────────────────────────────────────────────────────────────────

interface EaSkeletonRowProps {
  avatarSize?: string
  className?:  string
}

export function EaSkeletonRow({ avatarSize = 'w-8 h-8', className }: EaSkeletonRowProps) {
  return (
    <div className={cn('flex items-start gap-3 px-3 py-3 border-b', className)} style={{ borderColor: HAIR }} aria-hidden>
      <div className={cn('skeleton rounded-full flex-shrink-0', avatarSize)} />
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
// EaSkeletonList — N shimmer rows.
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
// EaSkeletonMessage — shimmer placeholder for a message while the thread loads.
// ─────────────────────────────────────────────────────────────────────────────

interface EaSkeletonMessageProps {
  className?: string
}

export function EaSkeletonMessage({ className }: EaSkeletonMessageProps) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 rounded-[12px] border bg-white', className)} style={{ borderColor: HAIR }} aria-hidden>
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
// EaInlineError — small inline error text, body colour (no red).
// ─────────────────────────────────────────────────────────────────────────────

interface EaInlineErrorProps {
  message:    string
  className?: string
}

export function EaInlineError({ message, className }: EaInlineErrorProps) {
  return (
    <span className={cn('text-[12.5px] leading-tight max-w-[240px]', className)} style={{ color: BODY }} role="alert">
      {message}
    </span>
  )
}

export const EA_TOKENS = { INK, BODY, MUTED, FAINT, FIELD, HAIR, CTRL } as const
