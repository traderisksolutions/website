'use client'

import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
        'flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card flex-shrink-0 flex-wrap',
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
        'flex items-center gap-2 h-8 px-3 rounded-md border border-input bg-background',
        'transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/30',
        'min-w-[180px] max-w-[260px]',
        className,
      )}
    >
      <Search className="h-3.5 w-3.5 text-muted-foreground/55 flex-shrink-0" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 min-w-0 bg-transparent border-none outline-none text-[12.5px] text-foreground placeholder:text-muted-foreground/60"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="text-muted-foreground/45 hover:text-muted-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
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
        'h-8 border-dashed font-normal gap-1.5',
        active && 'border-primary/30 bg-primary/[0.04] text-primary',
        className,
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            'text-[10px] font-bold px-1.5 py-px rounded',
            active
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground',
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
