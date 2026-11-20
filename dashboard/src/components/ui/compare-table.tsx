'use client'

import { cn } from '@/lib/utils'

/**
 * A comparison table in the house ledger (.trs-table): white head, one dark rule under it, centred
 * cells, the first column held in place while the rest scrolls. Columns size to their content.
 */
export function CompareTable({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="trs-table w-max min-w-full" aria-label={label}>{children}</table>
    </div>
  )
}

export function CTh({ children, first, className, tone }: { children?: React.ReactNode; first?: boolean; className?: string; tone?: 'copy' }) {
  return <th scope="col" className={cn('px-3 align-top', first && 'sticky left-0 z-20 min-w-44 bg-white text-left', tone === 'copy' && 'bg-trs-info-bg', className)}>{children}</th>
}

export function CTd({ children, first, className, tone, colSpan, title }: { children?: React.ReactNode; first?: boolean; className?: string; tone?: 'copy'; colSpan?: number; title?: string }) {
  return <td colSpan={colSpan} title={title} className={cn('px-3', first && 'sticky left-0 z-10 bg-white font-medium whitespace-nowrap', tone === 'copy' && 'bg-trs-info-bg', className)}>{children}</td>
}
