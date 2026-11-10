'use client'

/**
 * The context rail's shared pieces: the green group pill (Actions · AI · Information), an action
 * item (eyebrow, title, meta, buttons), an AI row (sparkle, title, one line, one button), and an
 * information row (label left, value right). White ground, no boxes, no rules: spacing groups.
 */
import Link from 'next/link'
import { Sparkles } from 'lucide-react'

export const INK = '#0f1412'
export const BODY = '#2a332f'
export const MUTED = '#4a5550'
export const SUBTLE = '#8c958f'
export const HAIR = '#e6e8e4'
export const ERROR = '#a1242f'
export const PRIMARY = '#1a2e26'
export const SECOND = 'inline-flex items-center rounded-[9px] border px-2.5 py-1.5 text-[13px] bg-white cursor-pointer transition-colors hover:border-[#0f1412] disabled:opacity-50'
export const MAIN = 'inline-flex items-center rounded-[9px] border-0 px-3 py-1.5 text-[13px] text-white cursor-pointer disabled:opacity-50'

export function GroupPill({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 mb-3 inline-block rounded-full px-3 py-1 text-[13.5px] font-medium" style={{ color: 'var(--trs-green, #1f6b3e)', background: 'var(--trs-soft, #eaf6ec)', border: '1px solid rgba(31,107,62,0.28)' }}>{children}</p>
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
      <p className="m-0 mb-1 text-[11.5px] uppercase" style={{ color: SUBTLE, letterSpacing: '0.06em' }}>{eyebrow}</p>
      <p className="m-0 text-[15px] font-medium leading-[1.3] break-words" style={{ color: INK }}>{title}</p>
      {meta && <p className="m-0 mt-0.5 text-[13px] tabular-nums" style={{ color: alert ? ERROR : MUTED, fontWeight: alert ? 500 : 400 }}>{meta}</p>}
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
          <p className="m-0 text-[13.5px] font-medium inline-flex items-center gap-1.5" style={{ color: INK }}><Sparkles size={13} style={{ color: SUBTLE }} />{title}</p>
          <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>{detail}</p>
        </div>
        {href
          ? <Link href={href} className={`${SECOND} no-underline flex-shrink-0 whitespace-nowrap`} style={{ borderColor: HAIR, color: INK }}>{action}</Link>
          : <button type="button" className={`${SECOND} flex-shrink-0 whitespace-nowrap`} style={{ borderColor: HAIR, color: INK }} onClick={onClick} disabled={disabled || busy}>{busy ? 'Working…' : action}</button>}
      </div>
      {children}
    </div>
  )
}

/** Label left, value right. The value may carry a second muted line and inline arrow links. */
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-3 py-[5px] text-[13.5px] items-start" style={{ gridTemplateColumns: '92px minmax(0,1fr)' }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span className="min-w-0 break-words" style={{ color: INK }}>{children}</span>
    </div>
  )
}

export const Small = ({ children }: { children: React.ReactNode }) => <span className="text-[13px]" style={{ color: MUTED }}>{children}</span>
export const Arrow = ({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) =>
  href ? <Link href={href} className="no-underline hover:underline" style={{ color: INK }}>{children} <span style={{ color: SUBTLE }}>→</span></Link>
       : <button type="button" onClick={onClick} className="bg-transparent border-0 p-0 cursor-pointer text-[13.5px] hover:underline" style={{ color: INK }}>{children} <span style={{ color: SUBTLE }}>→</span></button>
