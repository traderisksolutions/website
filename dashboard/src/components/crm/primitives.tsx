'use client'

import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGE_LABEL, STAGE_TONE, type Stage, type StageTone } from '@/lib/crm/types'

/** Small building blocks shared by every CRM screen. All follow docs/design-system.md: white
 *  surfaces separated by a hairline ring, one navy accent, chips with a tinted fill only. */

export const TONE_STYLE: Record<StageTone, { bg: string; color: string }> = {
  neutral: { bg: 'var(--neutral-status-bg)', color: 'var(--neutral-status-fg)' },
  blue:    { bg: 'var(--primary-badge-bg)',  color: 'var(--primary-hex)' },
  amber:   { bg: 'var(--warning-bg)',        color: 'var(--warning)' },
  green:   { bg: 'var(--success-bg)',        color: 'var(--success)' },
  red:     { bg: 'var(--error-bg)',          color: 'var(--error)' },
}

export function Chip({ tone = 'neutral', children, className, title }: { tone?: StageTone; children: React.ReactNode; className?: string; title?: string }) {
  const s = TONE_STYLE[tone]
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap leading-4', className)} style={{ background: s.bg, color: s.color }}>
      {children}
    </span>
  )
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return <Chip tone={STAGE_TONE[stage]} className={className}>{STAGE_LABEL[stage]}</Chip>
}

export function SectionCard({ title, description, actions, children, className, padded = true }: {
  title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; padded?: boolean
}) {
  return (
    <section className={cn('rounded-lg bg-card min-w-0', className)} style={{ boxShadow: 'var(--card-shadow)' }}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5 border-b border-[--border-subtle] flex-wrap">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold text-foreground leading-tight m-0">{title}</h2>}
            {description && <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug m-0">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-1.5 flex-wrap">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && 'px-4 py-3')}>{children}</div>
    </section>
  )
}

export function Empty({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return <p className={cn('text-[12.5px] text-muted-foreground text-center m-0', compact ? 'py-4' : 'py-8')}>{children}</p>
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted-foreground">
      <Loader2 size={14} className="animate-spin" /> {label ?? 'Loading…'}
    </div>
  )
}

/** The three-level button ladder: one filled primary per view, outlined secondary, quiet tertiary. */
export function Btn({ level = 'secondary', size = 'sm', className, children, loading, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { level?: 'primary' | 'secondary' | 'tertiary'; size?: 'sm' | 'xs'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
        size === 'sm' ? 'h-8 px-3 text-[12px]' : 'h-7 px-2.5 text-[11.5px]',
        level === 'primary'   && 'bg-primary text-primary-foreground hover:bg-[--primary-hover] border-0',
        level === 'secondary' && 'bg-transparent text-foreground border border-input hover:bg-muted',
        level === 'tertiary'  && 'bg-transparent text-primary border-0 hover:bg-accent/60 px-2',
        className,
      )}
    >
      {loading && <Loader2 size={12} className="animate-spin" />}
      {children}
    </button>
  )
}

export function LinkBtn({ href, level = 'secondary', size = 'sm', className, children }: { href: string; level?: 'primary' | 'secondary' | 'tertiary'; size?: 'sm' | 'xs'; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-semibold whitespace-nowrap no-underline transition-colors',
        size === 'sm' ? 'h-8 px-3 text-[12px]' : 'h-7 px-2.5 text-[11.5px]',
        level === 'primary'   && 'bg-primary text-primary-foreground hover:bg-[--primary-hover]',
        level === 'secondary' && 'text-foreground border border-input hover:bg-muted',
        level === 'tertiary'  && 'text-primary hover:bg-accent/60 px-2',
        className,
      )}
    >
      {children}
    </Link>
  )
}

/** Segmented filter control: single-select radio group that never clears. */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div role="radiogroup" className={cn('inline-flex flex-wrap gap-1', className)}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[11.5px] font-medium transition-colors cursor-pointer',
              on ? 'bg-[--primary-light-bg] text-[--primary-hex] border border-[--primary-light-border]' : 'border border-[--border-subtle] bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className={cn('text-[10px] font-semibold rounded-[5px] px-1 leading-4', on ? 'bg-white/70' : 'bg-muted')}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground mt-1">{hint}</span>}
    </label>
  )
}

export const inputCls = 'w-full h-8 rounded-md border border-input bg-background px-2.5 text-[12.5px] outline-none focus:ring-2 focus:ring-primary/25'
export const textareaCls = 'w-full rounded-md border border-input bg-background px-2.5 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-primary/25 resize-y'

export function Avatar({ name, className }: { name: string; className?: string }) {
  const parts = name.replace(/[^a-zA-Z ]/g, '').trim().split(/\s+/).filter(Boolean)
  const ini = parts.length === 0 ? '?' : parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (
    <span className={cn('inline-flex items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground/70 flex-shrink-0', className ?? 'w-8 h-8')}>
      {ini}
    </span>
  )
}
