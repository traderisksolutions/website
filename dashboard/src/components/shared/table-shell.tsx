import type { ReactNode } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * Thin wrapper over the existing shadcn table primitives (src/components/ui/table.tsx),
 * carrying the project's own .data-table CSS grammar (globals.css: header/zebra/hover treatment)
 * so every list/matrix view reads consistently. Pass matrix for wide rate/comparison grids to
 * keep the existing sticky-first-column + zebra + employee/dependant tinting (real prior
 * investment, preserved as-is) — plain list tables (calculator list, quote list, taxonomy
 * manager) omit it and get the default treatment.
 */
export function TableShell({ matrix, className, children }: {
  matrix?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Table className={cn('data-table', matrix && 'matrix-table', className)}>
      {children}
    </Table>
  )
}

export { TableHeader, TableBody, TableRow, TableHead, TableCell }
