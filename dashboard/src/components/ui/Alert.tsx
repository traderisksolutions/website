'use client'

/**
 * Alert — four semantic variants, announced to screen readers.
 *
 * Tokens are named by role, not by colour, so a variant can be restyled in one place. Colour is
 * never the only signal: each variant carries its own glyph and its own wording, so the four are
 * still told apart with the tint switched off or by someone who cannot separate the hues.
 *
 * Announcement differs by severity, which matters more than it looks. `role="alert"` is
 * implicitly assertive and interrupts whatever a screen reader is saying — right for an error,
 * rude for "here is what happened while you were away". Informational and success therefore use
 * `role="status"` with `aria-live="polite"`, which waits for a pause.
 *
 * Body text sits on white at full contrast; the tint is for the icon rail only. Tinted grounds
 * under body copy are where contrast quietly fails.
 */

import { useId, useState, type ReactNode } from 'react'
import { Btn } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'

export type AlertVariant = 'info' | 'success' | 'warning' | 'error'

interface Tokens {
  /** Class names: the left edge, the icon rail (tint and glyph colour), the title colour. */
  accent: string
  tint: string
  title: string
  glyph: ReactNode
  role: 'status' | 'alert'
  live: 'polite' | 'assertive'
  /** Read by a screen reader before the title, so severity is spoken, not only seen. */
  label: string
}

const TOKENS: Record<AlertVariant, Tokens> = {
  info: {
    accent: 'border-l-trs-green-2', tint: 'bg-trs-info-bg text-trs-green-2', title: 'text-trs-info',
    role: 'status', live: 'polite', label: 'Information',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7v4.5M8 4.6v.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  success: {
    accent: 'border-l-trs-pos', tint: 'bg-trs-pos-bg text-trs-pos', title: 'text-trs-pos',
    role: 'status', live: 'polite', label: 'Success',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4.8 8.2l2.2 2.2 4.2-4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  warning: {
    accent: 'border-l-trs-warn', tint: 'bg-trs-warn-bg text-trs-warn', title: 'text-trs-warn',
    role: 'alert', live: 'assertive', label: 'Warning',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 1.8l6.2 11.4H1.8L8 1.8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6.2v3.2M8 11.3v.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  error: {
    accent: 'border-l-trs-neg', tint: 'bg-trs-neg-bg text-trs-neg', title: 'text-trs-neg',
    role: 'alert', live: 'assertive', label: 'Error',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M5.4 1.6h5.2L14.4 5.4v5.2l-3.8 3.8H5.4L1.6 10.6V5.4L5.4 1.6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 5v3.6M8 10.6v.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
}

export interface AlertRow {
  /** The one-line summary, always visible. A node when the line carries a link. */
  summary: ReactNode
  /** Unfurled on click. Empty means the row is not expandable. */
  detail: string[]
}

export function Alert({
  variant = 'info', title, children, rows, onDismiss, actionLabel, actionHref, dataAttr,
}: {
  variant?: AlertVariant
  title?: string
  children?: ReactNode
  /** Accordion rows. Each unfurls on click; there is no rule between them. */
  rows?: AlertRow[]
  onDismiss?: () => void
  actionLabel?: string
  actionHref?: string
  dataAttr?: string
}) {
  const t = TOKENS[variant]
  const base = useId()
  const [open, setOpen] = useState<Record<number, boolean>>({})

  return (
    <div
      role={t.role}
      aria-live={t.live}
      className={cn('flex overflow-hidden rounded bg-white border border-trs-line-2 border-l-[3px]', t.accent)}
      {...(dataAttr ? { [dataAttr]: '' } : {})}
    >
      <div className={cn('flex w-11 flex-shrink-0 justify-center pt-[15px]', t.tint)}>
        {t.glyph}
      </div>

      <div className="min-w-0 flex-grow px-3.5 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className={cn('m-0 text-body font-medium', t.title)}>
                <span className="sr-only">{t.label}: </span>{title}
              </h2>
            )}
            {children && <div className="mt-[3px] text-body leading-[1.5] text-trs-ink-2">{children}</div>}
          </div>
          {onDismiss && (
            <Btn
              level="tertiary" size="xs" onClick={onDismiss} aria-label="Dismiss this alert"
              className="w-8 flex-shrink-0 px-0 text-body leading-none text-trs-subtle hover:bg-trs-field"
            >
              ×
            </Btn>
          )}
        </div>

        {rows && rows.length > 0 && (
          <div className="mt-2">
            {rows.map((r, i) => {
              const id = `${base}-row-${i}`
              const isOpen = !!open[i]
              const expandable = r.detail.length > 0
              return (
                <div key={i}>
                  <button
                    type="button"
                    onClick={() => expandable && setOpen(o => ({ ...o, [i]: !isOpen }))}
                    aria-expanded={expandable ? isOpen : undefined}
                    aria-controls={expandable ? id : undefined}
                    disabled={!expandable}
                    className="flex w-full items-start gap-2.5 py-[7px] text-left disabled:cursor-default"
                  >
                    {expandable ? (
                      <svg
                        width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
                        className={cn('mt-[5px] flex-shrink-0 transition-transform duration-150', isOpen && 'rotate-90')}
                      >
                        <path d="M3 1l4 4-4 4" stroke="var(--trs-subtle)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span className="mt-[6px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-trs-subtle" />
                    )}
                    <span className="text-body leading-[1.5] text-trs-ink-2">{r.summary}</span>
                  </button>
                  {expandable && isOpen && (
                    <div id={id} className="pb-2 pl-5 pt-[2px]">
                      {r.detail.map((d, n) => (
                        <div key={n} className="text-small leading-[1.6] text-trs-muted">{d}</div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {actionLabel && actionHref && (
          <div className="mt-[9px]">
            <a
              href={actionHref}
              className="text-body underline decoration-trs-line-2 underline-offset-[3px] hover:decoration-trs-ink text-trs-ink"
            >
              {actionLabel}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
