'use client'

import { createContext, useContext } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The register: the Companies table pattern, shared by every list of records.
 *
 * One outlined 16px card; a sticky white header with 13px muted labels (sortable when asked);
 * rows 16px tall-padded on a hairline; the first column frozen with an inset hairline; a cell is a
 * 15px medium primary line over a 12.5px muted secondary line; numbers centred and tabular;
 * hover var(--trs-tint); the selected row on a soft blue with a 3px ink bar. Status is words, never colour.
 *
 * Since 28 Oct 2026 every register is dense (the Quotes grid Jarod signed off); since 14 Nov 2026 the
 * table look is the shared .trs-table in globals.css: centred headers, 48px zebra rows at 13.5px, cells
 * centred unless `align="left"` (names, subjects, descriptions) or the identity column (the app zoom is 1 now, so these are real pixels), a faint rule
 * between columns, a 10px card radius, 10px cell padding, the first column inset 16px, identity column 200px.
 * One line per row where it can be; a secondary line stays 12px under the primary. The global rule
 * `table.register td` in globals.css pins any 13/14/15px text a caller left inside a cell to 13.5px, so
 * the grid reads at one size without touching 38 call sites. `dense={false}` restores the old
 * 16px-padded register for the rare editorial list.
 */

const SELECTED = 'var(--trs-soft)'

const DenseContext = createContext(false)

export function Register({ children, label, minWidth = 720, maxHeight, className, dense = true }: {
  children: React.ReactNode; label: string; minWidth?: number; maxHeight?: string; className?: string
  /** Excel-like spacing (the default). Read by every cell inside; false restores the 16px-padded register. */
  dense?: boolean
}) {
  return (
    <DenseContext.Provider value={dense}>
      <div className={cn('overflow-hidden bg-white', className)}>
        <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
          <table className={cn('w-full border-collapse trs-table', dense && 'register')} style={{ minWidth }} /* drift-ok: minimum width set by the caller */ aria-label={label}>{children}</table>
        </div>
      </div>
    </DenseContext.Provider>
  )
}

export function RegisterHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-20 bg-white">
      <tr>{children}</tr>
    </thead>
  )
}

/** Horizontal padding of a cell: 10px in a dense register, the card inset otherwise. */
function cellPad(dense: boolean, first: boolean | undefined, last: boolean | undefined) {
  if (dense) return cn(first ? 'sticky left-0 pl-0 pr-[10px] shadow-[inset_-1px_0_0_var(--trs-line)]' : 'px-[10px]', last && 'pr-2')
  return cn(first ? 'sticky left-0 pl-0 pr-3 shadow-[inset_-1px_0_0_var(--trs-line)]' : 'px-3', last && 'pr-3')
}

export function RegisterTh({ children, first, last, active, dir, onSort, hint, className, width }: {
  /** Ignored: every header is centred (Jarod, 14 Nov 2026). Kept so callers need not change. */
  children?: React.ReactNode; align?: 'left' | 'right' | 'center'; first?: boolean; last?: boolean
  active?: boolean; dir?: 'asc' | 'desc'; onSort?: () => void; hint?: string; className?: string; width?: number | string
}) {
  const dense = useContext(DenseContext)
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  const size = dense ? 'h-8 text-small' : 'h-11 text-body'
  return (
    <th scope="col" aria-sort={onSort ? (active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined} style={width ? { width } : undefined}
      className={cn('py-0 font-normal whitespace-nowrap text-center', first && 'z-30', cellPad(dense, first, last), className)}>
      {onSort ? (
        <button type="button" onClick={onSort} title={hint}
          className={cn('group inline-flex items-center gap-1.5 bg-transparent border-0 cursor-pointer whitespace-nowrap', size, active ? 'font-medium text-trs-ink' : 'text-trs-muted')}>
          {children}<Icon size={13} className={cn(active ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} aria-hidden />
        </button>
      ) : (
        <span className={cn('inline-flex items-center text-trs-muted', size)} title={hint}>{children}</span>
      )}
    </th>
  )
}

export function RegisterRow({ children, selected, onClick, className, style }: {
  children: React.ReactNode; selected?: boolean; onClick?: () => void; className?: string; style?: React.CSSProperties
}) {
  return (
    <tr tabIndex={onClick ? 0 : undefined} aria-selected={onClick ? !!selected : undefined} onClick={onClick}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={cn('group transition-colors', onClick && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-trs-ink', 'border-b border-trs-line', selected ? 'bg-trs-mint' : onClick && 'hover:bg-trs-tint', className)}
      style={style}>
      {children}
    </tr>
  )
}

/** A cell: `primary` over `secondary`, or free `children`. `first` freezes it as the row's identity column. */
export function RegisterCell({ primary, secondary, children, align = 'center', first, last, selected, className, colSpan, title, nowrap = true, identityWidth }: {
  primary?: React.ReactNode; secondary?: React.ReactNode; children?: React.ReactNode
  /** Centred by default (numbers, badges, dates, short words); 'left' for names, subjects and free text. 'right' reads as centred. */
  align?: 'left' | 'right' | 'center'
  first?: boolean; last?: boolean; selected?: boolean; className?: string; colSpan?: number; title?: string; nowrap?: boolean
  /** Width of the frozen identity block in px; wider when the table has few columns. 260 by default, 200 when dense. */
  identityWidth?: number
}) {
  const dense = useContext(DenseContext)
  const width = identityWidth ?? (dense ? 200 : 260)
  return (
    <td colSpan={colSpan} title={title ?? (!first && nowrap && typeof (primary ?? children) === 'string' ? String(primary ?? children) : undefined)}
      className={cn(dense ? 'py-1.5' : 'py-4', 'align-middle', (first || align === 'left') && 'cell-left', nowrap && 'whitespace-nowrap',
        first && cn('relative z-10', selected ? 'bg-trs-mint' : 'bg-white'), cellPad(dense, first, last), className)}>
      {first && selected && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-trs-green" aria-hidden />}
      {/* A block with a real max width, so the identity column cannot grow the table past its card in auto layout. */}
      {/* No data column grows past 360px: one long value widened a column to 1,000px and pushed the
          table into a sideways scroll (Policies, 21 Nov 2026). Long text truncates; the cell's title keeps it. */}
      <div className={cn('min-w-0 max-w-full', !first && 'max-w-[360px]', !first && nowrap && 'truncate', !first && align !== 'left' && 'mx-auto')} style={first ? { width } : undefined} /* drift-ok: identity width set by the caller */>
        {primary !== undefined && (
          <span className={cn('block leading-tight', first ? 'text-body font-medium truncate' : 'text-body tabular-nums', 'text-trs-ink')}>{primary}</span>
        )}
        {secondary !== undefined && <span className={cn('block truncate text-small text-trs-muted', !dense && 'mt-0.5')}>{secondary}</span>}
        {children}
      </div>
    </td>
  )
}

/** A quiet divider row for grouped registers (Contacts by company): label, count, nothing else. */
export function RegisterGroupRow({ children, colSpan, onClick, open }: { children: React.ReactNode; colSpan: number; onClick?: () => void; open?: boolean }) {
  const dense = useContext(DenseContext)
  return (
    <tr onClick={onClick} aria-expanded={onClick ? open : undefined} className={cn('reg-group border-b border-trs-line bg-trs-tint', onClick && 'cursor-pointer hover:bg-trs-tint')}>
      <td colSpan={colSpan} className={cn('font-medium text-trs-ink-2', dense ? 'pl-4 pr-[10px] py-1 text-small' : 'pl-6 pr-4 py-2 text-body')}>{children}</td>
    </tr>
  )
}

export function RegisterEmpty({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  const dense = useContext(DenseContext)
  return (
    <tr><td colSpan={colSpan} className={cn('cell-empty text-body text-trs-muted', dense ? 'py-8' : 'py-16')}>{children}</td></tr>
  )
}

export { SELECTED as REGISTER_SELECTED }
