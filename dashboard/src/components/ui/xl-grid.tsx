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

const LINE = '#e6e8e4'
const HEAD = '#faf9f6'
const INK = '#0f1412'
const MUTED = '#4a5550'

/** Light fills, all readable with ink text. */
export const XL_FILL = {
  good: '#edf7e8',
  bad: '#fdecec',
  warn: '#fff4dc',
  info: '#eaf1f7',
  quiet: '#f1f2ee',
  pick: '#dcefd2',
} as const
export type XlFill = keyof typeof XL_FILL

export function XlGrid({ children, label, minWidth, maxHeight, className }: {
  children: React.ReactNode; label: string; minWidth?: number; maxHeight?: string; className?: string
}) {
  return (
    <div className={cn('rounded-[10px] bg-white overflow-hidden', className)} style={{ border: `1px solid ${LINE}` }}>
      <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="xl-grid w-full border-collapse text-[13px] tabular-nums" style={{ minWidth, color: INK }} aria-label={label}>{children}</table>
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

const edge = { borderRight: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }

export function XlTh({ children, colSpan, rowSpan, align = 'center', sticky, width, title, className, strong }: {
  children?: React.ReactNode; colSpan?: number; rowSpan?: number; align?: 'left' | 'center' | 'right'
  /** Freeze as the left label column. */
  sticky?: boolean; width?: number; title?: string; className?: string; strong?: boolean
}) {
  return (
    <th scope="col" colSpan={colSpan} rowSpan={rowSpan} title={title}
      className={cn('h-8 px-2.5 whitespace-nowrap', strong ? 'font-medium' : 'font-normal', align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center', sticky && 'sticky left-0 z-30', className)}
      style={{ ...edge, background: HEAD, color: strong ? INK : MUTED, width, minWidth: width }}>
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
      className={cn('group', onClick && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0f1412]', className)}
      style={{ background: selected ? '#edf7e8' : group ? '#fafafa' : undefined }}>
      {children}
    </tr>
  )
}

/** The row number gutter, as in a spreadsheet. */
export function XlNum({ n }: { n: number }) {
  return <td className="h-6 w-8 px-1 text-center text-[11px] select-none" style={{ ...edge, background: HEAD, color: '#8c958f' }}>{n}</td>
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
  const bg = fill ? XL_FILL[fill] : label ? '#fff' : undefined
  return (
    <td colSpan={colSpan} title={title}
      className={cn('h-8 px-2.5 align-middle', nowrap && 'whitespace-nowrap', align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center',
        label && 'sticky left-0 z-10 group-hover:bg-[#faf9f6]', strong && 'font-medium', className)}
      style={{ ...edge, background: bg, color: muted ? MUTED : INK, width, minWidth: width, maxWidth: width }}>
      {isBlank(children) ? <span style={{ color: '#c4c7c5' }}>–</span> : children}
    </td>
  )
}

/** A full-width band row, for a heading inside the grid. */
export function XlBand({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="h-8 px-2.5 text-left font-medium text-[12.5px]" style={{ ...edge, background: '#fafafa', color: '#2a332f' }}>{children}</td>
    </tr>
  )
}

export function XlEmpty({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return <tr><td colSpan={colSpan} className="py-6 text-center text-[12.5px]" style={{ color: MUTED }}>{children}</td></tr>
}

/** A 20px button that fits inside a 24px grid row. */
export const XL_BTN = 'h-5 px-1.5 text-[11.5px] rounded-[5px] leading-none'
