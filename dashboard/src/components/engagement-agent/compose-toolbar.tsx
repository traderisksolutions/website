'use client'

// Compose kit — the presentational atoms shared by the reply panel (engagement-compose-panel.tsx),
// the "New email" pane (engagement/NewEmailCompose.tsx) and the editor toolbar
// (components/RichEditor.tsx). Tokens only (--trs-ink, -ink-2, -muted, -subtle, -line, -line-2,
// -field, -tint) and the shared button ladder. No business logic here.

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn, btnClass } from '@/components/crm/primitives'

export const INK      = 'var(--trs-ink)'
export const BODY     = 'var(--trs-ink-2)'
export const MUTED    = 'var(--trs-muted)'
export const FAINT    = 'var(--trs-subtle)'
export const HAIRLINE = 'var(--trs-line)'
export const CONTROL  = 'var(--trs-line-2)'
export const FIELD    = 'var(--trs-field)'
export const HOVER    = 'var(--trs-tint)'

/** The shared button ladder (btnClass), kept under the composer's names. One primary per view. */
export const BTN_PRIMARY   = btnClass('primary', 'sm')
export const BTN_SECONDARY = btnClass('secondary', 'sm')
export const BTN_TERTIARY  = btnClass('tertiary', 'sm')

// ─── Toolbar ───────────────────────────────────────────────────────────────────────────────────

/** One group of toolbar buttons. Groups are separated by a hairline. */
export function TbGroup({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div role="group" aria-label={label} className={cn('flex items-center gap-0.5 pr-2 mr-1.5 border-r border-trs-line last:border-r-0 last:pr-0 last:mr-0', className)}>
      {children}
    </div>
  )
}

const TB_BASE = 'min-w-8 px-1.5 rounded text-body font-normal leading-none border-0 select-none'

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
    <Btn
      level="tertiary"
      size="xs"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={e => { e.preventDefault(); if (!disabled) onPress?.() }}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); onPress?.() } }}
      className={cn(TB_BASE, text && 'px-2.5', active ? 'bg-trs-green text-white hover:bg-trs-green-2 hover:text-white' : 'text-trs-ink-2 hover:bg-trs-field', className)}
      {...aria}
    >
      {children}
      {caret && <ChevronDown size={12} strokeWidth={2} className={active ? 'text-white/70' : 'text-trs-subtle'} aria-hidden />}
    </Btn>
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
          className={cn('absolute top-full z-40 mt-1 rounded border border-trs-line bg-white p-1 shadow-[0_8px_24px_rgba(15,20,18,0.12)]', align === 'right' ? 'right-0' : 'left-0')}
          style={{ minWidth: width ?? 180 }} /* drift-ok: menu width from the caller */>
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
    <Btn
      level="tertiary"
      size="xs"
      role={active === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={() => { if (!disabled) onSelect() }}
      className={cn('flex w-full justify-start gap-2.5 px-2.5 rounded text-left text-body font-normal text-trs-ink border-0 hover:bg-trs-tint hover:text-trs-ink', active && 'bg-trs-field font-medium', className)}
      style={style}
    >
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {shortcut && <span className="text-small text-trs-subtle">{shortcut}</span>}
    </Btn>
  )
}

export function TbMenuLabel({ children }: { children: ReactNode }) {
  return <p className="m-0 px-2.5 pt-2 pb-1 text-small text-trs-muted">{children}</p>
}

// ─── Fields ────────────────────────────────────────────────────────────────────────────────────

/** One addressing row, Outlook-style: the label inline at the left (fixed width, small, muted),
 *  the content, an optional small control at the right. 40px on a hairline; grows only when
 *  its chips wrap. */
export function FieldRow({ label, htmlFor, children, right, className }: {
  label:      string
  htmlFor?:   string
  children:   ReactNode
  right?:     ReactNode
  className?: string
  /** Kept for callers; every row is now a 40px minimum that grows when chips wrap. */
  tall?:      boolean
}) {
  return (
    <div className={cn('flex items-center gap-2 min-h-10 py-1 px-[var(--re-gutter,16px)] border-b border-trs-line text-body', className)}>
      <label htmlFor={htmlFor} className="w-14 flex-shrink-0 text-small text-trs-muted">{label}</label>
      <div className="flex-1 min-w-0 flex items-center gap-1 flex-wrap">{children}</div>
      {right && <div className="ml-auto flex items-center gap-1 flex-shrink-0 text-small text-trs-muted">{right}</div>}
    </div>
  )
}

/** A small text control at the end of a row (Bcc, Cc): 24px, no fill until hover. */
export function RowTextButton({ children, onClick, label }: { children: ReactNode; onClick: () => void; label?: string }) {
  return (
    <Btn level="tertiary" size="xs" onClick={onClick} aria-label={label} className="h-6 px-1.5 border-0 text-small text-trs-muted hover:bg-trs-field">
      {children}
    </Btn>
  )
}

/** Recipient chip: 24px, the name only, × to remove; the full address on hover. */
export function RecipientChip({ name, email, onRemove, onClick, title }: {
  name:      string
  email?:    string
  onRemove?: () => void
  onClick?:  () => void
  title?:    string
}) {
  const Tag: 'button' | 'span' = onClick ? 'button' : 'span'
  return (
    <span className="inline-flex items-center gap-1 h-6 rounded bg-trs-field pl-2 pr-1 text-body max-w-full text-trs-ink" title={title ?? email ?? name}>
      <Tag
        {...(onClick ? { type: 'button', onClick, className: 'inline-flex items-center bg-transparent border-0 p-0 cursor-pointer min-w-0 text-inherit' } : { className: 'inline-flex items-center min-w-0' })}
      >
        <span className="truncate">{name || email}</span>
      </Tag>
      {onRemove ? (
        <Btn level="tertiary" size="xs" onClick={onRemove} aria-label={`Remove ${name || email}`} title="Remove"
          className="w-4 h-4 min-w-0 rounded-full border-0 p-0 hover:bg-trs-line-2 text-trs-muted">
          <X size={11} strokeWidth={2} />
        </Btn>
      ) : <span aria-hidden className="w-1" />}
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
        className="appearance-none bg-transparent border-0 pl-0 pr-4 h-7 text-small cursor-pointer outline-none rounded hover:bg-trs-field focus-visible:ring-2 focus-visible:ring-trs-green/30 max-w-[220px] truncate text-trs-subtle"
      >
        {children}
      </select>
      <ChevronDown size={11} strokeWidth={2} aria-hidden className="pointer-events-none absolute right-0.5 text-trs-subtle" />
    </span>
  )
}

/** Attachment chip in the tray under the editor. */
export function AttachmentChip({ name, onRemove, meta }: { name: string; onRemove?: () => void; meta?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-7 rounded bg-trs-field pl-2.5 pr-1.5 text-small max-w-full text-trs-muted">
      <span className="truncate max-w-[220px]">{name}</span>
      {meta && <span className="text-trs-subtle">{meta}</span>}
      {onRemove && (
        <Btn level="tertiary" size="xs" onClick={onRemove} aria-label={`Remove ${name}`} title="Remove"
          className="w-4 h-4 rounded-full border-0 p-0 hover:bg-trs-line-2 text-trs-muted">
          <X size={11} strokeWidth={2} />
        </Btn>
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
