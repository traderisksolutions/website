'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The register: the Companies table pattern, shared by every list of records.
 *
 * One outlined 16px card; a sticky white header with 13px muted labels (sortable when asked);
 * rows 16px tall-padded on a hairline; the first column frozen with an inset hairline; a cell is a
 * 15px medium primary line over a 12.5px muted secondary line; numbers right-aligned and tabular;
 * hover #f8f9fa; the selected row on a soft blue with a 3px ink bar. Status is words, never colour.
 */

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const SELECTED = '#eef3fc'

export function Register({ children, label, minWidth = 720, maxHeight, className }: {
  children: React.ReactNode; label: string; minWidth?: number; maxHeight?: string; className?: string
}) {
  return (
    <div className={cn('rounded-[16px] overflow-hidden bg-white', className)} style={{ border: `1px solid ${RULE}` }}>
      <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full border-collapse" style={{ minWidth }} aria-label={label}>{children}</table>
      </div>
    </div>
  )
}

export function RegisterHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-20 bg-white">
      <tr style={{ borderBottom: `1px solid ${RULE}` }}>{children}</tr>
    </thead>
  )
}

export function RegisterTh({ children, align = 'left', first, last, active, dir, onSort, hint, className, width }: {
  children?: React.ReactNode; align?: 'left' | 'right'; first?: boolean; last?: boolean
  active?: boolean; dir?: 'asc' | 'desc'; onSort?: () => void; hint?: string; className?: string; width?: number | string
}) {
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th scope="col" aria-sort={onSort ? (active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined} style={width ? { width } : undefined}
      className={cn('py-0 font-normal whitespace-nowrap', align === 'right' ? 'text-right' : 'text-left', first ? 'sticky left-0 z-30 bg-white pl-6 pr-3 shadow-[inset_-1px_0_0_#e8eaed]' : 'px-3', last && 'pr-5', className)}>
      {onSort ? (
        <button type="button" onClick={onSort} title={hint}
          className={cn('group inline-flex items-center gap-1.5 h-11 bg-transparent border-0 cursor-pointer text-[13px] whitespace-nowrap', align === 'right' && 'flex-row-reverse', active && 'font-medium')} style={{ color: active ? INK : MUTED }}>
          {children}<Icon size={13} className={cn(active ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} aria-hidden />
        </button>
      ) : (
        <span className="inline-flex items-center h-11 text-[13px]" style={{ color: MUTED }} title={hint}>{children}</span>
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
      className={cn('group transition-colors', onClick && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#202124]', selected ? 'bg-[#eef3fc]' : onClick && 'hover:bg-[#f8f9fa]', className)}
      style={{ borderBottom: `1px solid ${RULE}`, ...style }}>
      {children}
    </tr>
  )
}

/** A cell: `primary` over `secondary`, or free `children`. `first` freezes it as the row's identity column. */
export function RegisterCell({ primary, secondary, children, align = 'left', first, last, selected, className, colSpan, title, nowrap = true, identityWidth = 260 }: {
  primary?: React.ReactNode; secondary?: React.ReactNode; children?: React.ReactNode; align?: 'left' | 'right'
  first?: boolean; last?: boolean; selected?: boolean; className?: string; colSpan?: number; title?: string; nowrap?: boolean
  /** Width of the frozen identity block in px; wider when the table has few columns. */
  identityWidth?: number
}) {
  return (
    <td colSpan={colSpan} title={title}
      className={cn('py-4 align-middle', align === 'right' && 'text-right', nowrap && 'whitespace-nowrap',
        first ? cn('relative sticky left-0 z-10 pl-6 pr-3 shadow-[inset_-1px_0_0_#e8eaed]', selected ? 'bg-[#eef3fc]' : 'bg-white group-hover:bg-[#f8f9fa]') : 'px-3', last && 'pr-5', className)}>
      {first && selected && <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: INK }} aria-hidden />}
      {/* A block with a real max width, so the identity column cannot grow the table past its card in auto layout. */}
      <div className="min-w-0 max-w-full" style={first ? { width: identityWidth } : undefined}>
        {primary !== undefined && <span className={cn('block leading-tight', first ? 'text-[15px] font-medium truncate' : 'text-[14px] tabular-nums')} style={{ color: INK }}>{primary}</span>}
        {secondary !== undefined && <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: MUTED }}>{secondary}</span>}
        {children}
      </div>
    </td>
  )
}

/** A quiet divider row for grouped registers (Contacts by company): label, count, nothing else. */
export function RegisterGroupRow({ children, colSpan, onClick, open }: { children: React.ReactNode; colSpan: number; onClick?: () => void; open?: boolean }) {
  return (
    <tr onClick={onClick} aria-expanded={onClick ? open : undefined} className={cn(onClick && 'cursor-pointer hover:bg-[#f8f9fa]')} style={{ borderBottom: `1px solid ${RULE}`, background: '#fafafa' }}>
      <td colSpan={colSpan} className="pl-6 pr-4 py-2 text-[13px] font-medium" style={{ color: '#3c4043' }}>{children}</td>
    </tr>
  )
}

export function RegisterEmpty({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return (
    <tr><td colSpan={colSpan} className="py-16 text-center text-[15px]" style={{ color: MUTED }}>{children}</td></tr>
  )
}

export { SELECTED as REGISTER_SELECTED }
