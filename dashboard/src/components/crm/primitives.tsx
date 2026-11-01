'use client'

import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGE_LABEL, STAGE_TONE, type Stage, type StageTone } from '@/lib/crm/types'

/** Small building blocks shared by every screen. Colours come from the --trs-* tokens in
 *  globals.css; controls are 36 or 30 high; one green primary per view. */

const INK = 'var(--trs-ink)'
const MUTED = 'var(--trs-muted)'

/** The website's badge (.s-pill): soft tint, hairline border, a 6px dot, 12px medium. One tone per meaning. */
export const TONE_STYLE: Record<StageTone, { bg: string; color: string; border: string }> = {
  neutral: { bg: 'var(--trs-field)',   color: 'var(--trs-muted)', border: 'rgba(15,20,18,.12)' },
  blue:    { bg: 'var(--trs-info-bg)', color: 'var(--trs-info)',  border: 'rgba(31,78,107,.2)' },
  amber:   { bg: 'var(--trs-warn-bg)', color: 'var(--trs-warn)',  border: 'rgba(138,90,0,.24)' },
  green:   { bg: 'var(--trs-soft)',    color: 'var(--trs-green)', border: 'rgba(19,44,28,.2)' },
  red:     { bg: 'var(--trs-neg-bg)',  color: 'var(--trs-neg)',   border: 'rgba(161,36,47,.22)' },
}

export function Chip({ tone = 'neutral', children, className, title }: { tone?: StageTone; children: React.ReactNode; className?: string; title?: string }) {
  const s = TONE_STYLE[tone]
  return (
    <span title={title} className={cn('inline-flex items-center gap-1.5 rounded-[4px] pl-1.5 pr-2 py-px text-[12px] font-medium whitespace-nowrap leading-[18px] border', className)} style={{ background: s.bg, color: s.color, borderColor: s.border }}>
      <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full flex-none" style={{ background: 'currentColor' }} />
      {children}
    </span>
  )
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return <Chip tone={STAGE_TONE[stage]} className={className}>{STAGE_LABEL[stage]}</Chip>
}

/** A flat section: a 16px medium heading, optional actions on the right, then content.
 *  Sections are separated by whitespace and one hairline — no ring, no fill. */
export function SectionCard({ title, actions, children, className, padded = true }: {
  title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; padded?: boolean
}) {
  return (
    // A rule only between two sections in a row; never under a tab strip, a header or another rule.
    <section className={cn('min-w-0 pb-6 [section+&]:pt-6 [section+&]:border-t', className)} style={{ borderColor: 'var(--trs-line)' }}>
      {(title || actions) && (
        <header className={cn('flex items-center gap-3 mb-3 flex-wrap', title ? 'justify-between' : 'justify-end')}>
          {title && <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em] leading-tight" style={{ color: INK }}>{title}</h2>}
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </header>
      )}
      <div className={cn(padded ? '' : '-mx-4 sm:mx-0')}>{children}</div>
    </section>
  )
}

export function Empty({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return <p className={cn('text-[14px] text-center m-0', compact ? 'py-5' : 'py-10')} style={{ color: MUTED }}>{children}</p>
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13px]" style={{ color: MUTED }}>
      <Loader2 size={14} className="animate-spin" /> {label ?? 'Loading…'}
    </div>
  )
}

const BTN_BASE = 'inline-flex items-center justify-center gap-1.5 border font-medium whitespace-nowrap transition-[background-color,border-color,color,opacity] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trs-green'
// Two heights only: sm = 36 (the default control), xs = 30 (in rows and toolbars).
const BTN_SIZE = { sm: 'h-9 px-3.5 text-[14px] rounded-[8px]', xs: 'h-[30px] px-2.5 text-[13px] rounded-[7px]' } as const
const BTN_LEVEL = {
  primary:   'border-transparent bg-trs-green text-white hover:bg-trs-green-2',
  secondary: 'border-trs-line-2 bg-white text-trs-ink hover:border-trs-ink-2',
  tertiary:  'border-transparent bg-transparent text-trs-muted hover:bg-trs-canvas hover:text-trs-ink',
  danger:    'border-trs-line-2 bg-white text-trs-neg hover:border-trs-neg',
} as const
export type BtnLevel = keyof typeof BTN_LEVEL

/** The button ladder: one green primary per view, outlined secondary, quiet tertiary, outlined-red danger. */
export function Btn({ level = 'secondary', size = 'sm', className, children, loading, type = 'button', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { level?: BtnLevel; size?: 'sm' | 'xs'; loading?: boolean }) {
  return (
    <button type={type} {...rest} disabled={rest.disabled || loading} className={cn(BTN_BASE, BTN_SIZE[size], BTN_LEVEL[level], className)}>
      {loading && <Loader2 size={12} className="animate-spin" />}
      {children}
    </button>
  )
}

export function LinkBtn({ href, level = 'secondary', size = 'sm', className, children }: { href: string; level?: BtnLevel; size?: 'sm' | 'xs'; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(BTN_BASE, 'no-underline', BTN_SIZE[size], BTN_LEVEL[level], className)}>
      {children}
    </Link>
  )
}

/** Segmented control for tabs and filters: hairline track, the selected option on soft green.
 *  Single-select (role radio), never clears. Two heights: sm 36, xs 30 (default). */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'xs', label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; className?: string; size?: 'sm' | 'xs'; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex max-w-full flex-wrap overflow-hidden rounded-[8px] border border-trs-line-2 bg-white', size === 'sm' ? '[&>button]:h-[34px]' : '[&>button]:h-[28px]', className)}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn('inline-flex items-center gap-1.5 px-3 text-[13px] font-medium border-0 cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-trs-green',
              i > 0 && 'border-l border-solid border-trs-line-2',
              on ? 'bg-trs-select-bg text-trs-select-fg' : 'bg-transparent text-trs-ink-2 hover:bg-trs-canvas')}
          >
            {o.label}
            {o.count !== undefined && <span className={cn('font-mono text-[11px] tabular-nums', on ? 'text-trs-select-fg' : 'text-trs-muted')}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[12.5px] mb-1.5" style={{ color: MUTED }}>{label}</span>
      {children}
      {hint && <span className="block text-[12px] mt-1" style={{ color: MUTED }}>{hint}</span>}
    </label>
  )
}

export const inputCls = 'w-full h-9 rounded-[8px] border border-trs-line-2 bg-white px-3.5 text-[14px] text-trs-ink outline-none transition-colors focus:border-trs-ink placeholder:text-trs-subtle'
export const textareaCls = 'w-full rounded-[8px] border border-trs-line-2 bg-white px-3.5 py-2.5 text-[14px] text-trs-ink outline-none transition-colors focus:border-trs-ink resize-y placeholder:text-trs-subtle'

export function Avatar({ name, className }: { name: string; className?: string }) {
  const parts = name.replace(/[^a-zA-Z ]/g, '').trim().split(/\s+/).filter(Boolean)
  const ini = parts.length === 0 ? '?' : parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (
    <span className={cn('inline-flex items-center justify-center rounded-full text-[11px] font-medium flex-shrink-0', className ?? 'w-8 h-8')} style={{ background: 'var(--trs-field)', color: INK }}>
      {ini}
    </span>
  )
}
