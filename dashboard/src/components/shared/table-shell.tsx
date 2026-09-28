'use client'

import type { ReactNode, HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react'
import { Register } from '@/components/ui/register'
import { cn } from '@/lib/utils'

/**
 * TableShell: the register look (src/components/ui/register.tsx, the Companies table) for the
 * pages that compose their own thead/tbody. Same exported names as before so callers keep
 * working: one outlined 16px card, sticky white header with 13px muted labels, the first column
 * frozen, hairline rows with 16px padding, hover #f8f9fa. Pass `matrix` for wide grids (a wider
 * minimum width, cells never wrap). Status is words, never colour.
 */
export function TableShell({ matrix, className, children, label, minWidth, maxHeight }: {
  matrix?: boolean
  className?: string
  children: ReactNode
  label?: string
  minWidth?: number
  maxHeight?: string
}) {
  return (
    <Register label={label ?? 'Records'} minWidth={minWidth ?? (matrix ? 960 : 720)} maxHeight={maxHeight} className={cn(matrix && 'matrix', className)}>
      {children}
    </Register>
  )
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('sticky top-0 z-20 bg-white', className)} {...props} />
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&>tr:last-child]:border-b-0', className)} {...props} />
}

export function TableRow({ className, style, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('group transition-colors [tbody>&]:hover:bg-[#f8f9fa]', className)}
      style={{ borderBottom: '1px solid #e8eaed', ...style }}
      {...props}
    />
  )
}

export function TableHead({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'h-11 px-4 py-0 text-left align-middle text-[13px] font-normal whitespace-nowrap text-[#5f6368]',
        'first:sticky first:left-0 first:z-30 first:bg-white first:pl-6 first:shadow-[inset_-1px_0_0_#e8eaed] last:pr-6',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        'px-4 py-4 align-middle text-[14px] text-[#202124]',
        'first:sticky first:left-0 first:z-10 first:bg-white first:pl-6 first:shadow-[inset_-1px_0_0_#e8eaed] group-hover:first:bg-[#f8f9fa] last:pr-6',
        '[.matrix_&]:whitespace-nowrap',
        className,
      )}
      {...props}
    />
  )
}
