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
        'flex items-center gap-2.5 px-6 sm:px-10 py-3 border-b border-[#e8eaed] bg-white flex-shrink-0 flex-wrap',
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
        'flex items-center gap-2 h-10 px-3.5 rounded-[10px] border border-[#dadce0] bg-white',
        'transition-colors focus-within:border-[#202124]',
        'min-w-[220px] max-w-[320px]',
        className,
      )}
    >
      <Search className="h-4 w-4 flex-shrink-0" style={{ color: '#80868b' }} />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] text-[#202124] placeholder:text-[#80868b]"
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
        'h-9 rounded-[999px] px-3.5 font-medium gap-1.5 text-[13px]',
        active && 'bg-[#202124] text-white border-[#202124] hover:bg-[#202124] hover:opacity-90',
        className,
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            'text-[11px] tabular-nums px-1.5 py-px rounded',
            active
              ? 'bg-white/20 text-white'
              : 'bg-[#f1f3f4] text-[#5f6368]',
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
