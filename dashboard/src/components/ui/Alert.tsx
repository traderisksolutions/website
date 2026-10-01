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

export type AlertVariant = 'info' | 'success' | 'warning' | 'error'

interface Tokens {
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
    accent: '#1a73e8', tint: '#f1f6fe', title: '#174ea6',
    role: 'status', live: 'polite', label: 'Information',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7v4.5M8 4.6v.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  success: {
    accent: '#137333', tint: '#e8f5ec', title: '#0d652d',
    role: 'status', live: 'polite', label: 'Success',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4.8 8.2l2.2 2.2 4.2-4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  warning: {
    accent: '#b06000', tint: '#fef7e8', title: '#8a4b00',
    role: 'alert', live: 'assertive', label: 'Warning',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 1.8l6.2 11.4H1.8L8 1.8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6.2v3.2M8 11.3v.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  error: {
    accent: '#c5221f', tint: '#fdf1f0', title: '#a50e0e',
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
  /** The one-line summary, always visible. */
  summary: string
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
      className="flex overflow-hidden rounded-[10px] bg-white"
      style={{ border: '1px solid #dadce0', borderLeft: `3px solid ${t.accent}` }}
      {...(dataAttr ? { [dataAttr]: '' } : {})}
    >
      <div className="flex w-11 flex-shrink-0 justify-center pt-[15px]" style={{ background: t.tint, color: t.accent }}>
        {t.glyph}
      </div>

      <div className="min-w-0 flex-grow px-3.5 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="m-0 text-[14px] font-medium" style={{ color: t.title }}>
                <span className="sr-only">{t.label}: </span>{title}
              </h2>
            )}
            {children && <div className="mt-[3px] text-[13px] leading-[1.5]" style={{ color: '#3c4043' }}>{children}</div>}
          </div>
          {onDismiss && (
            <button
              type="button" onClick={onDismiss} aria-label="Dismiss this alert"
              className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[6px] text-[15px] leading-none transition-colors hover:bg-[#f1f3f4]"
              style={{ color: '#80868b' }}
            >
              ×
            </button>
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
                        className="mt-[5px] flex-shrink-0 transition-transform duration-150"
                        style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
                      >
                        <path d="M3 1l4 4-4 4" stroke="#80868b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span className="mt-[6px] h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: '#80868b' }} />
                    )}
                    <span className="text-[13px] leading-[1.5]" style={{ color: '#3c4043' }}>{r.summary}</span>
                  </button>
                  {expandable && isOpen && (
                    <div id={id} className="pb-2 pl-5 pt-[2px]">
                      {r.detail.map((d, n) => (
                        <div key={n} className="text-[12px] leading-[1.6]" style={{ color: '#5f6368' }}>{d}</div>
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
              className="text-[13px] underline decoration-[#dadce0] underline-offset-[3px] hover:decoration-[#202124]"
              style={{ color: '#202124' }}
            >
              {actionLabel}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
