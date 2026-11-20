'use client'

import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGE_LABEL, STAGE_TONE, type Stage, type StageTone } from '@/lib/crm/types'

/** Small building blocks shared by every screen, in the website's design (Jarod, 19 Nov 2026).
 *  Colours come from the --trs-* tokens in globals.css; controls are 40 or 32 high; one green
 *  primary per view. */

/** The website's badge (.s-pill): soft tint, hairline border, a 6px dot, 12px medium. One tone per meaning. */
export const TONE_STYLE: Record<StageTone, { bg: string; color: string; border: string }> = {
  neutral: { bg: 'var(--trs-field)',   color: 'var(--trs-muted)', border: 'rgba(15,20,18,.12)' },
  blue:    { bg: 'var(--trs-info-bg)', color: 'var(--trs-info)',  border: 'rgba(31,78,107,.2)' },
  amber:   { bg: 'var(--trs-warn-bg)', color: 'var(--trs-warn)',  border: 'rgba(138,90,0,.24)' },
  green:   { bg: 'var(--trs-soft)',    color: 'var(--trs-green)', border: 'rgba(19,44,28,.2)' },
  red:     { bg: 'var(--trs-neg-bg)',  color: 'var(--trs-neg)',   border: 'rgba(161,36,47,.22)' },
}

/** The same tones as classes, so a chip carries no inline style. */
const TONE_CLASS: Record<StageTone, string> = {
  neutral: 'bg-trs-field text-trs-muted border-[rgba(15,20,18,.12)]',
  blue:    'bg-trs-info-bg text-trs-info border-[rgba(31,78,107,.2)]',
  amber:   'bg-trs-warn-bg text-trs-warn border-[rgba(138,90,0,.24)]',
  green:   'bg-trs-soft text-trs-green border-[rgba(19,44,28,.2)]',
  red:     'bg-trs-neg-bg text-trs-neg border-[rgba(161,36,47,.22)]',
}

export function Chip({ tone = 'neutral', children, className, title }: { tone?: StageTone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1.5 rounded pl-1.5 pr-2 py-px text-small font-medium whitespace-nowrap leading-[18px] border', TONE_CLASS[tone], className)}>
      <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full flex-none bg-current" />
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
    <section className={cn('min-w-0 pb-6 [section+&]:pt-6 [section+&]:border-t border-trs-line', className)}>
      {(title || actions) && (
        <header className={cn('flex items-center gap-3 mb-3 flex-wrap', title ? 'justify-between' : 'justify-end')}>
          {title && <h2 className="m-0 text-heading font-medium tracking-[-0.01em] leading-tight text-trs-ink">{title}</h2>}
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </header>
      )}
      <div className={cn(padded ? '' : '-mx-4 sm:mx-0')}>{children}</div>
    </section>
  )
}

/** Nothing to show: the plain fact, and the action that fills it when there is one. */
export function Empty({ children, compact, action }: { children: React.ReactNode; compact?: boolean; action?: React.ReactNode }) {
  if (!action) return <p className={cn('text-body text-center m-0 text-trs-muted', compact ? 'py-5' : 'py-10')}>{children}</p>
  return (
    <div className={cn('flex flex-col items-center gap-3 text-center', compact ? 'py-5' : 'py-10')}>
      <p className="m-0 text-body text-trs-muted">{children}</p>
      {action}
    </div>
  )
}

/** Loading: placeholder rows in a table's shape, the label read out to screen readers and shown small. */
export function Spinner({ label, rows = 5 }: { label?: string; rows?: number }) {
  const widths = ['34%', '18%', '14%', '20%']
  return (
    <div role="status" aria-live="polite" className="flex flex-col py-3 min-w-0">
      <span className="text-small mb-2 text-trs-muted">{label ?? 'Loading…'}</span>
      <div className="flex items-center gap-4 h-10 border-b border-trs-ink">
        {widths.map((w, i) => <span key={i} className="trs-sk h-[9px]" style={{ width: `calc(${w} * .55)` }} /* drift-ok: placeholder width from the column list */ />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 h-12 border-b border-trs-line">
          {widths.map((w, i) => <span key={i} className="trs-sk" style={{ width: w, opacity: 1 - r * 0.12 }} /* drift-ok: placeholder width and fade from the row index */ />)}
        </div>
      ))}
    </div>
  )
}

/** A small inline wait, for a button or a line of text. */
export function InlineSpinner({ label }: { label?: string }) {
  return <span className="inline-flex items-center gap-2 text-body text-trs-muted"><Loader2 size={14} className="animate-spin" />{label}</span>
}

const BTN_BASE = 'inline-flex items-center justify-center gap-1.5 border font-medium whitespace-nowrap transition-[background-color,border-color,color,opacity] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trs-green'
// The website's buttons (.s-btn): radius 7, a 1.5px edge. Two heights: sm = 40 (the default
// control), xs = 32 (in rows and toolbars). Secondary is the green outline; one primary per view.
const BTN_SIZE = { sm: 'h-10 px-4 text-body rounded', xs: 'h-8 px-3 text-body rounded' } as const
const BTN_LEVEL = {
  primary:   'border-[1.5px] border-trs-green bg-trs-green text-white hover:bg-trs-green-2 hover:border-trs-green-2',
  secondary: 'border-[1.5px] border-trs-green bg-white text-trs-green hover:bg-trs-mint',
  tertiary:  'border-[1.5px] border-transparent bg-transparent text-trs-muted hover:bg-trs-tint hover:text-trs-ink',
  danger:    'border-[1.5px] border-[rgba(161,36,47,0.4)] bg-white text-trs-neg hover:border-trs-neg',
} as const
export type BtnLevel = keyof typeof BTN_LEVEL
/** The same ladder as a class string, for a plain <button> or <Link> that cannot be a Btn. */
export const btnClass = (level: BtnLevel = 'secondary', size: 'sm' | 'xs' = 'sm') => cn(BTN_BASE, BTN_SIZE[size], BTN_LEVEL[level])

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

/** One choice from a few, two looks (Jarod, 19 Nov 2026). `pills` (default) for filters and
 *  options: rounded, the chosen one solid green. `tabs` for a page's or a record's sections:
 *  underlined, the current one in green. Single-select (role radio), never clears. */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'xs', label, variant = 'pills' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; className?: string; size?: 'sm' | 'xs'; label?: string; variant?: 'pills' | 'tabs' }) {
  const tabs = variant === 'tabs'
  return (
    <div role="radiogroup" aria-label={label} className={cn(tabs ? 'flex max-w-full gap-0.5 overflow-x-auto border-b border-trs-line [scrollbar-width:none]' : 'inline-flex max-w-full flex-wrap gap-1.5', className)}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn('inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-trs-green',
              tabs
                ? cn('h-10 px-3 -mb-px text-body border-0 border-b-2 border-solid bg-transparent', on ? 'border-trs-green text-trs-green font-medium' : 'border-transparent text-trs-muted hover:text-trs-ink')
                : cn(size === 'sm' ? 'h-9' : 'h-8', 'px-3 rounded-full border border-solid text-body', on ? 'border-trs-green bg-trs-green text-white' : 'border-trs-line-2 bg-white text-trs-ink-2 hover:border-trs-ink-2'))}
          >
            {o.label}
            {o.count !== undefined && <span className={cn('font-mono text-small tabular-nums', tabs ? 'text-trs-subtle' : on ? 'text-white/80' : 'text-trs-muted')}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="block text-body font-medium mb-1.5 text-trs-ink">{label}</span>
      {children}
      {hint && <span className="block text-small mt-1 text-trs-muted">{hint}</span>}
    </label>
  )
}

// Boxed white fields with a green focus ring (the website's form).
export const inputCls = 'w-full h-10 rounded border border-trs-line-2 bg-white px-3 text-body text-trs-ink outline-none transition-colors focus:border-trs-green-2 focus-visible:ring-2 focus-visible:ring-[rgba(31,78,58,0.25)] placeholder:text-trs-subtle'
export const textareaCls = 'w-full rounded border border-trs-line-2 bg-white px-3 py-2.5 text-body text-trs-ink outline-none transition-colors focus:border-trs-green-2 focus-visible:ring-2 focus-visible:ring-[rgba(31,78,58,0.25)] resize-y placeholder:text-trs-subtle'

export function Avatar({ name, className }: { name: string; className?: string }) {
  const parts = name.replace(/[^a-zA-Z ]/g, '').trim().split(/\s+/).filter(Boolean)
  const ini = parts.length === 0 ? '?' : parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (
    <span className={cn('inline-flex items-center justify-center rounded-full text-small font-medium flex-shrink-0 bg-trs-field text-trs-ink', className ?? 'w-8 h-8')}>
      {ini}
    </span>
  )
}
