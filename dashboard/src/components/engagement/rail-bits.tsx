'use client'

/**
 * The context rail's shared pieces, on the record-sidebar pattern (21 Nov 2026): a plain section
 * label per group (Actions · AI · Information), an action item (eyebrow, title, one meta line,
 * one row of buttons), an AI row (title, one line, one button), and a property list (label left,
 * value right on one line, an optional muted line under it). White ground, no boxes, no rules.
 */
import Link from 'next/link'
import { Btn, btnClass } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'

/** The rail's colours as token values, for importers that still pass a colour in a style. */
export const INK = 'var(--trs-ink)'
export const BODY = 'var(--trs-ink-2)'
export const MUTED = 'var(--trs-muted)'
export const HAIR = 'var(--trs-line)'
export const ERROR = 'var(--trs-neg)'
/** Buttons in a rail are the house ladder at row height (30px): outlined secondary, one green primary. */
export const SECOND = btnClass('secondary', 'xs')
export const MAIN = btnClass('primary', 'xs')

/** A group's name: a plain section label, no pill and no fill. */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('m-0 mb-2 text-small font-semibold text-trs-muted', className)}>{children}</h3>
}

export function Group({ label, children, ariaLabel }: { label: string; children: React.ReactNode; ariaLabel?: string }) {
  return (
    <section className="px-1 mb-6 last:mb-0" aria-label={ariaLabel ?? label}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </section>
  )
}

/** One thing to do: a small eyebrow for its kind, the title, one meta line, then its buttons. */
export function ActionItem({ eyebrow, title, meta, alert, children }: { eyebrow: string; title: string; meta?: string | null; alert?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="m-0 text-small text-trs-muted">{eyebrow}</p>
      <p className="m-0 mt-0.5 text-body font-medium leading-snug break-words text-trs-ink">{title}</p>
      {meta && <p title={meta} className={cn('m-0 mt-0.5 text-small tabular-nums truncate', alert ? 'font-medium text-trs-neg' : 'text-trs-muted')}>{meta}</p>}
      {children}
    </div>
  )
}

/** The item's buttons on one row: one primary, the rest tertiary (the caller sets the levels). */
export const Buttons = ({ children }: { children: React.ReactNode }) => <div className="mt-2.5 flex flex-wrap items-center gap-1">{children}</div>

/** One AI capability on one row of fixed height: title, one line on what it does, one button. Results render under it. */
export function AiRow({ title, detail, action, onClick, href, disabled, busy, children }: { title: string; detail: string; action: string; onClick?: () => void; href?: string; disabled?: boolean; busy?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex min-h-12 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-body font-medium truncate text-trs-ink">{title}</p>
          <p className="m-0 text-small truncate text-trs-muted" title={detail}>{detail}</p>
        </div>
        {href
          ? <Link href={href} className={`${SECOND} no-underline flex-shrink-0`}>{action}</Link>
          : <Btn size="xs" className="flex-shrink-0" onClick={onClick} disabled={disabled || busy}>{busy ? 'Working…' : action}</Btn>}
      </div>
      {children}
    </div>
  )
}

/** Label left (96px), value right. The value may carry a second muted line. */
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 py-1.5 items-baseline">
      <span className="text-small truncate text-trs-muted" title={label}>{label}</span>
      <span className="min-w-0 break-words text-body text-trs-ink">{children}</span>
    </div>
  )
}

/** A property: label left (96px); the value on one line, cut with the full text on hover; an
 *  optional muted line of secondary facts under it, also one line. */
export function PropRow({ label, title, children, sub, subTitle, links }: { label: string; title?: string | null; children: React.ReactNode; sub?: React.ReactNode; subTitle?: string | null; links?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 py-1.5 items-baseline">
      <span className="text-small truncate text-trs-muted" title={label}>{label}</span>
      <span className="min-w-0">
        <span className="block truncate text-body text-trs-ink" title={title ?? undefined}>{children}</span>
        {sub && <span className="block truncate text-small text-trs-muted" title={subTitle ?? undefined}>{sub}</span>}
        {links && <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small">{links}</span>}
      </span>
    </div>
  )
}

/** A list in one value: the first item and "+N", the whole list for the title. */
export function listValue(items: (string | null | undefined)[]): { text: string; title: string } | null {
  const xs = items.map(x => x?.trim()).filter((x): x is string => !!x)
  if (!xs.length) return null
  return { text: xs.length > 1 ? `${xs[0]} +${xs.length - 1}` : xs[0], title: xs.join(', ') }
}

/** A plain link in a value: ink, underlined on hover, no arrow. */
export const PlainLink = ({ href, children, title }: { href: string; children: React.ReactNode; title?: string }) =>
  <Link href={href} title={title} className="no-underline hover:underline text-trs-ink">{children}</Link>

export const Small = ({ children }: { children: React.ReactNode }) => <span className="text-body text-trs-muted" >{children}</span>
export const Arrow = ({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) =>
  href ? <Link href={href} className="no-underline hover:underline text-trs-ink" >{children} <span className="text-trs-subtle">→</span></Link>
       : <button type="button" onClick={onClick} className="bg-transparent border-0 p-0 cursor-pointer text-body hover:underline text-trs-ink" >{children} <span className="text-trs-subtle">→</span></button>
