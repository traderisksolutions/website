'use client'

import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Btn } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'

// ── Toolbar container ──────────────────────────────────────────────────────────

interface DataTableToolbarProps {
  children: React.ReactNode
  className?: string
}

export function DataTableToolbar({ children, className }: DataTableToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-6 sm:px-10 py-3 border-b border-trs-line bg-white flex-shrink-0 flex-wrap',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ── Search input ───────────────────────────────────────────────────────────────

interface DataTableSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function DataTableSearch({
  value, onChange, placeholder = 'Search…', className,
}: DataTableSearchProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 h-9 px-3.5 rounded border border-trs-line-2 bg-white',
        'transition-colors focus-within:border-trs-ink',
        'min-w-[220px] max-w-[320px]',
        className,
      )}
    >
      <Search className="h-4 w-4 flex-shrink-0 text-trs-subtle" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 min-w-0 bg-transparent border-none outline-none text-body text-trs-ink placeholder:text-trs-subtle"
      />
      {value && (
        <Btn
          level="tertiary"
          size="xs"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="h-6 w-6 px-0"
        >
          <X className="h-3 w-3" />
        </Btn>
      )}
    </div>
  )
}

// ── Faceted filter button (dashed border = additive filter) ────────────────────

interface DataTableFilterProps {
  label: string
  active?: boolean
  count?: number
  onClick?: () => void
  className?: string
}

export function DataTableFilter({
  label, active, count, onClick, className,
}: DataTableFilterProps) {
  return (
    <Button
      variant="outline"
      size="compact"
      onClick={onClick}
      className={cn(
        'h-9 rounded px-3.5 font-medium gap-1.5 text-body',
        active && 'bg-trs-green text-white border-trs-green hover:bg-trs-green-2 hover:opacity-90',
        className,
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            'text-small tabular-nums px-1.5 py-px rounded',
            active
              ? 'bg-white/20 text-white'
              : 'bg-trs-field text-trs-muted',
          )}
        >
          {count}
        </span>
      )}
    </Button>
  )
}

// ── Reset button — only show when filters are active ──────────────────────────

interface DataTableResetProps {
  onReset: () => void
  className?: string
}

export function DataTableReset({ onReset, className }: DataTableResetProps) {
  return (
    <Button
      variant="ghost"
      size="compact"
      onClick={onReset}
      className={cn('h-8 text-muted-foreground hover:text-foreground px-2 gap-1', className)}
    >
      Reset
      <X className="h-3 w-3" />
    </Button>
  )
}

// ── Flexible spacer ────────────────────────────────────────────────────────────

export function DataTableSpacer({ className }: { className?: string }) {
  return <div className={cn('flex-1', className)} />
}
