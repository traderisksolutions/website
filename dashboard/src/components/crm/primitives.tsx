'use client'

import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGE_LABEL, type Stage, type StageTone } from '@/lib/crm/types'

/** Small building blocks shared by every CRM screen, on the Home design system: Inter, ink
 *  #202124, muted #5f6368, hairline #e8eaed, 10–12px controls, one filled ink primary per view.
 *  State is never colour-coded — every chip is the same neutral fill with ink text. */

const INK = '#202124'
const MUTED = '#5f6368'
const FIELD = '#f1f3f4'

export const TONE_STYLE: Record<StageTone, { bg: string; color: string }> = {
  neutral: { bg: FIELD, color: '#3c4043' },
  blue:    { bg: FIELD, color: '#3c4043' },
  amber:   { bg: FIELD, color: '#3c4043' },
  green:   { bg: FIELD, color: '#3c4043' },
  red:     { bg: FIELD, color: '#3c4043' },
}

export function Chip({ tone = 'neutral', children, className, title }: { tone?: StageTone; children: React.ReactNode; className?: string; title?: string }) {
  const s = TONE_STYLE[tone]
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap leading-4', className)} style={{ background: s.bg, color: s.color }}>
      {children}
    </span>
  )
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return <Chip className={className}>{STAGE_LABEL[stage]}</Chip>
}

/** A flat section: a 16px medium heading, optional actions on the right, then content.
 *  Sections are separated by whitespace and one hairline — no ring, no fill. */
export function SectionCard({ title, actions, children, className, padded = true }: {
  title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; padded?: boolean
}) {
  return (
    <section className={cn('min-w-0 py-6 border-t first:border-t-0 first:pt-0', className)} style={{ borderColor: '#e8eaed' }}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 mb-3 flex-wrap">
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

const BTN_BASE = 'inline-flex items-center gap-1.5 font-medium whitespace-nowrap transition-[background-color,opacity] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'
const BTN_SIZE = { sm: 'h-9 px-3.5 text-[13.5px] rounded-[10px]', xs: 'h-8 px-3 text-[12.5px] rounded-[8px]' } as const
const BTN_LEVEL = {
  primary:   'bg-[#202124] text-white border-0 hover:opacity-90',
  secondary: 'bg-white text-[#202124] border border-[#dadce0] hover:bg-[#f8f9fa]',
  tertiary:  'bg-transparent text-[#202124] border-0 hover:bg-[#f1f3f4]',
} as const

/** The three-level button ladder: one filled ink primary per view, outlined secondary, quiet tertiary. */
export function Btn({ level = 'secondary', size = 'sm', className, children, loading, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { level?: 'primary' | 'secondary' | 'tertiary'; size?: 'sm' | 'xs'; loading?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || loading} className={cn(BTN_BASE, BTN_SIZE[size], BTN_LEVEL[level], className)}>
      {loading && <Loader2 size={12} className="animate-spin" />}
      {children}
    </button>
  )
}

export function LinkBtn({ href, level = 'secondary', size = 'sm', className, children }: { href: string; level?: 'primary' | 'secondary' | 'tertiary'; size?: 'sm' | 'xs'; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(BTN_BASE, 'no-underline', BTN_SIZE[size], BTN_LEVEL[level], className)}>
      {children}
    </Link>
  )
}

/** Segmented switch, as on Companies (Clients | Insurers): a soft grey track, the selected
 *  option lifted to white. Single-select, never clears. */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div role="radiogroup" className={cn('inline-flex flex-wrap gap-0.5 rounded-[12px] p-1', className)} style={{ background: FIELD }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn('inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[9px] text-[13.5px] transition-colors cursor-pointer border-0', on ? 'bg-white font-medium' : 'bg-transparent hover:bg-[#e8eaed]')}
            style={{ color: on ? INK : MUTED }}
          >
            {o.label}
            {o.count !== undefined && <span className="text-[11.5px] tabular-nums" style={{ color: MUTED }}>{o.count}</span>}
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

export const inputCls = 'w-full h-10 rounded-[10px] border border-[#dadce0] bg-white px-3.5 text-[14px] text-[#202124] outline-none transition-colors focus:border-[#202124] placeholder:text-[#80868b]'
export const textareaCls = 'w-full rounded-[10px] border border-[#dadce0] bg-white px-3.5 py-2.5 text-[14px] text-[#202124] outline-none transition-colors focus:border-[#202124] resize-y placeholder:text-[#80868b]'

export function Avatar({ name, className }: { name: string; className?: string }) {
  const parts = name.replace(/[^a-zA-Z ]/g, '').trim().split(/\s+/).filter(Boolean)
  const ini = parts.length === 0 ? '?' : parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (
    <span className={cn('inline-flex items-center justify-center rounded-full text-[11px] font-medium flex-shrink-0', className ?? 'w-8 h-8')} style={{ background: FIELD, color: INK }}>
      {ini}
    </span>
  )
}
