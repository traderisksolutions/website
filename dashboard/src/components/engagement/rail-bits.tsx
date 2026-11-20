'use client'

/**
 * The context rail's shared pieces: the green group pill (Actions · AI · Information), an action
 * item (eyebrow, title, meta, buttons), an AI row (sparkle, title, one line, one button), and an
 * information row (label left, value right). White ground, no boxes, no rules: spacing groups.
 */
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
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

function GroupPill({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 mb-3 inline-block rounded-full border border-[rgba(31,107,62,0.28)] bg-trs-soft px-3 py-1 text-body font-medium text-trs-green">{children}</p>
  )
}

export function Group({ label, children, ariaLabel }: { label: string; children: React.ReactNode; ariaLabel?: string }) {
  return (
    <section className="px-1 mb-9" aria-label={ariaLabel ?? label}>
      <GroupPill>{label}</GroupPill>
      {children}
    </section>
  )
}

/** One thing to do: a small eyebrow for its kind, the title, one meta line, then its buttons. */
export function ActionItem({ eyebrow, title, meta, alert, children }: { eyebrow: string; title: string; meta?: string | null; alert?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mb-6 last:mb-0">
      <p className="m-0 mb-1 text-small text-trs-subtle">{eyebrow}</p>
      <p className="m-0 text-body font-medium leading-[1.3] break-words text-trs-ink">{title}</p>
      {meta && <p className={cn('m-0 mt-0.5 text-body tabular-nums', alert ? 'font-medium text-trs-neg' : 'font-normal text-trs-muted')}>{meta}</p>}
      {children}
    </div>
  )
}

export const Buttons = ({ children }: { children: React.ReactNode }) => <div className="mt-3 flex flex-wrap gap-1.5">{children}</div>

/** One AI capability: what it reads and what comes back, and one button. Results render under it. */
export function AiRow({ title, detail, action, onClick, href, disabled, busy, children }: { title: string; detail: string; action: string; onClick?: () => void; href?: string; disabled?: boolean; busy?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mb-3.5 last:mb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-body font-medium inline-flex items-center gap-1.5 text-trs-ink" ><Sparkles size={13} className="text-trs-subtle" />{title}</p>
          <p className="m-0 text-small text-trs-muted" >{detail}</p>
        </div>
        {href
          ? <Link href={href} className={`${SECOND} no-underline flex-shrink-0`}>{action}</Link>
          : <Btn size="xs" className="flex-shrink-0" onClick={onClick} disabled={disabled || busy}>{busy ? 'Working…' : action}</Btn>}
      </div>
      {children}
    </div>
  )
}

/** Label left, value right. The value may carry a second muted line and inline arrow links. */
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 py-[5px] text-body items-start">
      <span className="text-trs-muted">{label}</span>
      <span className="min-w-0 break-words text-trs-ink" >{children}</span>
    </div>
  )
}

export const Small = ({ children }: { children: React.ReactNode }) => <span className="text-body text-trs-muted" >{children}</span>
export const Arrow = ({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) =>
  href ? <Link href={href} className="no-underline hover:underline text-trs-ink" >{children} <span className="text-trs-subtle">→</span></Link>
       : <button type="button" onClick={onClick} className="bg-transparent border-0 p-0 cursor-pointer text-body hover:underline text-trs-ink" >{children} <span className="text-trs-subtle">→</span></button>
