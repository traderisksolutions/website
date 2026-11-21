'use client'

import { cn } from '@/lib/utils'

/**
 * XlGrid: the spreadsheet look for screens a broker works in all day (the RFQ register and the
 * comparison grid). Gridlines on every cell, 24px rows at 12.5px, every figure and word centred,
 * tabular figures, a sticky header, an optional row-number gutter, and a blank cell as a faint
 * dash. A cell can carry a fill for its state; the word is always there too, so the fill only
 * helps the eye.
 *
 * Use Register for lists of records with a primary/secondary identity; use XlGrid where the
 * cells are the point (prices side by side, counts, dates).
 */

/** Light fills, all readable with ink text. */
export const XL_FILL = {
  good: 'var(--trs-soft)',
  bad: 'var(--trs-neg-bg)',
  warn: 'var(--trs-warn-bg)',
  info: 'var(--trs-info-bg)',
  quiet: 'var(--trs-field)',
  pick: 'var(--trs-mint)',
} as const
export type XlFill = keyof typeof XL_FILL

/** The same fills as classes, so a cell carries no inline colour. */
const FILL_CLASS: Record<XlFill, string> = {
  good: 'bg-trs-soft', bad: 'bg-trs-neg-bg', warn: 'bg-trs-warn-bg', info: 'bg-trs-info-bg', quiet: 'bg-trs-field', pick: 'bg-trs-mint',
}

export function XlGrid({ children, label, minWidth, maxHeight, className }: {
  children: React.ReactNode; label: string; minWidth?: number; maxHeight?: string; className?: string
}) {
  return (
    <div className={cn('rounded bg-white overflow-hidden border border-trs-line', className)}>
      <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="xl-grid w-full border-collapse text-body tabular-nums text-trs-ink" style={{ minWidth }} /* drift-ok: minimum width set by the caller */ aria-label={label}>{children}</table>
      </div>
    </div>
  )
}

/** Header rows; pass one or more <XlHeadRow>. Sticky to the top of the grid's scroll box. */
export function XlHead({ children }: { children: React.ReactNode }) {
  return <thead className="sticky top-0 z-20">{children}</thead>
}

export function XlHeadRow({ children }: { children: React.ReactNode }) {
  return <tr>{children}</tr>
}

const edge = 'border-r border-b border-trs-line'

export function XlTh({ children, colSpan, rowSpan, align = 'center', sticky, width, title, className, strong }: {
  children?: React.ReactNode; colSpan?: number; rowSpan?: number; align?: 'left' | 'center' | 'right'
  /** Freeze as the left label column. */
  sticky?: boolean; width?: number; title?: string; className?: string; strong?: boolean
}) {
  return (
    <th scope="col" colSpan={colSpan} rowSpan={rowSpan} title={title}
      className={cn('h-8 px-2.5 whitespace-nowrap', strong ? 'font-medium' : 'font-normal', align === 'left' ? 'text-left' : align === 'right' ? 'text-center' : 'text-center', sticky && 'sticky left-0 z-30', className, edge, 'bg-trs-tint', strong ? 'text-trs-ink' : 'text-trs-muted')}
      style={{ width, minWidth: width }} /* drift-ok: column width set by the caller */>
      {children}
    </th>
  )
}

export function XlRow({ children, onClick, selected, group, className }: {
  children: React.ReactNode; onClick?: () => void; selected?: boolean
  /** A band that names the rows under it (a line, an insurer). */
  group?: boolean; className?: string
}) {
  return (
    <tr tabIndex={onClick ? 0 : undefined} onClick={onClick} aria-selected={onClick ? !!selected : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={cn('group', onClick && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-trs-ink', selected ? 'bg-trs-soft' : group && 'bg-trs-tint', className)}>
      {children}
    </tr>
  )
}

/** The row number gutter, as in a spreadsheet. */
export function XlNum({ n }: { n: number }) {
  return <td className={cn('h-6 w-8 px-1 text-center text-small select-none bg-trs-tint text-trs-subtle', edge)}>{n}</td>
}

const isBlank = (v: React.ReactNode) => v === null || v === undefined || v === '' || v === false

/**
 * One cell. Centred by default; `label` makes it the frozen left label column. A blank value
 * shows a faint dash so an empty cell reads as "nothing yet", never as a rendering gap.
 */
export function XlCell({ children, align = 'center', fill, label, colSpan, title, className, muted, strong, nowrap = true, width }: {
  children?: React.ReactNode; align?: 'left' | 'center' | 'right'; fill?: XlFill | null; label?: boolean
  colSpan?: number; title?: string; className?: string; muted?: boolean; strong?: boolean; nowrap?: boolean; width?: number
}) {
  const bg = fill ? FILL_CLASS[fill] : label ? 'bg-white' : undefined
  return (
    <td colSpan={colSpan} title={title}
      className={cn('h-8 px-2.5 align-middle', nowrap && 'whitespace-nowrap', align === 'left' ? 'text-left' : align === 'right' ? 'text-center' : 'text-center',
        label && 'sticky left-0 z-10 group-hover:bg-trs-tint', strong && 'font-medium', className, edge, bg, muted ? 'text-trs-muted' : 'text-trs-ink')}
      style={{ width, minWidth: width, maxWidth: width }} /* drift-ok: column width set by the caller */>
      {isBlank(children) ? <span className="text-trs-line-2">–</span> : children}
    </td>
  )
}

/** A full-width band row, for a heading inside the grid. */
export function XlBand({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className={cn('h-8 px-2.5 text-left text-small bg-trs-tint text-trs-muted', edge)}>{children}</td>
    </tr>
  )
}

export function XlEmpty({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return <tr><td colSpan={colSpan} className="py-6 text-center text-small text-trs-muted">{children}</td></tr>
}

/** A 20px button that fits inside a 24px grid row. */
export const XL_BTN = 'h-5 px-1.5 text-small rounded leading-none'
