'use client'

// Compose kit — the presentational atoms shared by the reply panel (engagement-compose-panel.tsx),
// the "New email" dialog (engagement/NewEmailComposeModal.tsx) and the editor toolbar
// (components/RichEditor.tsx). Tokens only: ink #202124, body #3c4043, muted #5f6368, faint #80868b,
// hairline #e8eaed, control #dadce0, field #f1f3f4, hover #f8f9fa. No business logic here.

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const INK      = '#202124'
export const BODY     = '#3c4043'
export const MUTED    = '#5f6368'
export const FAINT    = '#80868b'
export const HAIRLINE = '#e8eaed'
export const CONTROL  = '#dadce0'
export const FIELD    = '#f1f3f4'
export const HOVER    = '#f8f9fa'

/** The three-level button ladder at the composer's 36px size. One filled ink primary per view. */
export const BTN_PRIMARY   = 'inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] bg-[#202124] text-white text-[14px] font-medium whitespace-nowrap hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-0'
export const BTN_SECONDARY = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] bg-white text-[#202124] text-[13.5px] font-medium whitespace-nowrap border border-[#dadce0] hover:bg-[#f8f9fa] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
export const BTN_TERTIARY  = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] bg-transparent text-[#202124] text-[13.5px] font-medium whitespace-nowrap border-0 hover:bg-[#f1f3f4] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'

// ─── Toolbar ───────────────────────────────────────────────────────────────────────────────────

/** One group of toolbar buttons. Groups are separated by a hairline. */
export function TbGroup({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div role="group" aria-label={label} className={cn('flex items-center gap-0.5 pr-2 mr-1.5 border-r border-[#e8eaed] last:border-r-0 last:pr-0 last:mr-0', className)}>
      {children}
    </div>
  )
}

const TB_BASE = 'inline-flex items-center justify-center gap-1.5 h-8 min-w-8 px-1.5 rounded-[8px] text-[13px] leading-none border-0 bg-transparent cursor-pointer select-none whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124]/30 disabled:opacity-40 disabled:cursor-not-allowed'

export interface TbButtonProps {
  /** Accessible name; also the tooltip. */
  label:      string
  /** Keyboard shortcut, appended to the tooltip: "Bold (⌘B)". */
  shortcut?:  string
  active?:    boolean
  disabled?:  boolean
  /** Text buttons (Paragraph, Attach, Assist) get a little more horizontal padding. */
  text?:      boolean
  caret?:     boolean
  className?: string
  /** Fires on mousedown with the default prevented, so the editor keeps its selection. */
  onPress?:   () => void
  children:   ReactNode
  'aria-haspopup'?: 'menu'
  'aria-expanded'?: boolean
  'aria-controls'?: string
}

export function TbButton({ label, shortcut, active, disabled, text, caret, className, onPress, children, ...aria }: TbButtonProps) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={e => { e.preventDefault(); if (!disabled) onPress?.() }}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); onPress?.() } }}
      className={cn(TB_BASE, text && 'px-2.5', active ? 'bg-[#202124] text-white hover:bg-[#202124]' : 'text-[#3c4043] hover:bg-[#f1f3f4]', className)}
      {...aria}
    >
      {children}
      {caret && <ChevronDown size={12} strokeWidth={2} className={active ? 'text-white/70' : 'text-[#9aa0a6]'} aria-hidden />}
    </button>
  )
}

/** A small menu hung off a toolbar button. Hand-rolled (not Radix) so opening it never steals
 *  the editor's focus: the trigger and every item prevent mousedown default. Esc closes it and
 *  stops there, so an enclosing full-screen or dialog handler does not also fire. */
export function TbMenu({
  label, shortcut, active, text = true, caret = true, disabled, open: openProp, onOpenChange, align = 'left', width, className, trigger, children,
}: {
  label:         string
  shortcut?:     string
  active?:       boolean
  text?:         boolean
  caret?:        boolean
  disabled?:     boolean
  open?:         boolean
  onOpenChange?: (open: boolean) => void
  align?:        'left' | 'right'
  width?:        number
  className?:    string
  /** Trigger content (icon and/or text). */
  trigger:       ReactNode
  /** Menu body; call `close()` after a pick. */
  children:      (close: () => void) => ReactNode
}) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (v: boolean) => { setOpenState(v); onOpenChange?.(v) }
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <TbButton label={label} shortcut={shortcut} active={active} text={text} caret={caret} disabled={disabled}
        onPress={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-controls={id}>
        {trigger}
      </TbButton>
      {open && (
        <div id={id} role="menu" aria-label={label}
          className={cn('absolute top-full z-40 mt-1 rounded-[10px] border border-[#e8eaed] bg-white p-1 shadow-[0_8px_24px_rgba(32,33,36,0.12)]', align === 'right' ? 'right-0' : 'left-0')}
          style={{ minWidth: width ?? 180 }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function TbMenuItem({ onSelect, active, disabled, shortcut, children, className, style }: {
  onSelect:   () => void
  active?:    boolean
  disabled?:  boolean
  shortcut?:  string
  children:   ReactNode
  className?: string
  style?:     CSSProperties
}) {
  return (
    <button
      type="button"
      role={active === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={() => { if (!disabled) onSelect() }}
      className={cn('flex w-full items-center gap-2.5 h-8 px-2.5 rounded-[6px] text-left text-[13.5px] text-[#202124] bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa] disabled:opacity-40 disabled:cursor-not-allowed', active && 'bg-[#f1f3f4] font-medium', className)}
      style={style}
    >
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {shortcut && <span className="text-[12px] text-[#9aa0a6]">{shortcut}</span>}
    </button>
  )
}

export function TbMenuLabel({ children }: { children: ReactNode }) {
  return <p className="m-0 px-2.5 pt-2 pb-1 text-[12px] text-[#5f6368]">{children}</p>
}

// ─── Fields ────────────────────────────────────────────────────────────────────────────────────

/** One addressing row: 56px label, content, optional faint control at the right. Hairline under. */
export function FieldRow({ label, htmlFor, children, right, className, tall }: {
  label:      string
  htmlFor?:   string
  children:   ReactNode
  right?:     ReactNode
  className?: string
  /** Chip rows may wrap onto a second line; keep 40px as the minimum, not a fixed height. */
  tall?:      boolean
}) {
  return (
    <div className={cn('flex items-center gap-3 px-[var(--re-gutter,40px)] border-b border-[#e8eaed] text-[14px]', tall ? 'min-h-10 py-1' : 'h-10', className)}>
      <label htmlFor={htmlFor} className="w-14 flex-shrink-0 text-[13px]" style={{ color: MUTED }}>{label}</label>
      <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">{children}</div>
      {right && <div className="ml-auto flex items-center gap-2 flex-shrink-0 text-[12.5px]" style={{ color: FAINT }}>{right}</div>}
    </div>
  )
}

/** Recipient chip: grey pill, 18px ink initial, name. */
export function RecipientChip({ name, email, onRemove, onClick, title }: {
  name:      string
  email?:    string
  onRemove?: () => void
  onClick?:  () => void
  title?:    string
}) {
  const initial = (name || email || '?').trim().charAt(0).toUpperCase()
  const Tag: 'button' | 'span' = onClick ? 'button' : 'span'
  return (
    <span className="inline-flex items-center gap-1.5 h-6 rounded-full bg-[#f1f3f4] pl-1 pr-2 text-[13px] max-w-full" style={{ color: INK }} title={title ?? email ?? name}>
      <Tag
        {...(onClick ? { type: 'button', onClick, className: 'inline-flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer min-w-0 text-inherit' } : { className: 'inline-flex items-center gap-1.5 min-w-0' })}
      >
        <span aria-hidden className="w-[18px] h-[18px] rounded-full bg-[#202124] text-white text-[10px] font-medium inline-flex items-center justify-center flex-shrink-0">{initial}</span>
        <span className="truncate">{name || email}</span>
      </Tag>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name || email}`} title="Remove"
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-transparent border-0 p-0 cursor-pointer hover:bg-[#dadce0]" style={{ color: MUTED }}>
          <X size={11} strokeWidth={2} />
        </button>
      )}
    </span>
  )
}

/** A quiet inline select: faint text, no border, caret at the right. Used for From and Signature. */
export function QuietSelect({ label, value, onChange, children, className }: {
  label:     string
  value:     string
  onChange:  (v: string) => void
  children:  ReactNode
  className?: string
}) {
  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <select
        aria-label={label}
        title={label}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-transparent border-0 pl-0 pr-4 h-7 text-[12.5px] cursor-pointer outline-none rounded-[6px] hover:bg-[#f1f3f4] focus-visible:ring-2 focus-visible:ring-[#202124]/30 max-w-[220px] truncate"
        style={{ color: FAINT }}
      >
        {children}
      </select>
      <ChevronDown size={11} strokeWidth={2} aria-hidden className="pointer-events-none absolute right-0.5" style={{ color: '#9aa0a6' }} />
    </span>
  )
}

/** Attachment chip in the tray under the editor. */
export function AttachmentChip({ name, onRemove, meta }: { name: string; onRemove?: () => void; meta?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-7 rounded-[6px] bg-[#f1f3f4] pl-2.5 pr-1.5 text-[12.5px] max-w-full" style={{ color: BODY }}>
      <span className="truncate max-w-[220px]">{name}</span>
      {meta && <span style={{ color: FAINT }}>{meta}</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} title="Remove"
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-transparent border-0 p-0 cursor-pointer hover:bg-[#dadce0]" style={{ color: MUTED }}>
          <X size={11} strokeWidth={2} />
        </button>
      )}
    </span>
  )
}

/** The trade-risksol.com check used by the New email footer. */
export function externalDomain(email: string): string | null {
  const domain = email.trim().toLowerCase().split('@')[1]
  if (!domain) return null
  return domain === 'trade-risksol.com' ? null : domain
}
