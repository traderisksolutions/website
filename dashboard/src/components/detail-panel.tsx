import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DetailPanelProps {
  title: string
  subtitle?: string
  onClose?: () => void
  header?: React.ReactNode
  children: React.ReactNode
  width?: string
  className?: string
}

export function DetailPanel({
  title, subtitle, onClose, header, children, width = 'w-[300px]', className,
}: DetailPanelProps) {
  return (
    <aside
      className={cn(
        'flex flex-col bg-card border-l border-[--border-subtle] overflow-hidden flex-shrink-0',
        width,
        className,
      )}
      style={{ boxShadow: 'var(--shadow-panel)' }}
    >
      {/* Sticky header */}
      <div className="flex items-start justify-between gap-2 px-4 py-3.5 border-b border-[--border-subtle] bg-card sticky top-0 z-10 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground/55 mb-0.5">
            Details
          </p>
          <h2 className="text-[13px] font-semibold text-foreground leading-tight truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="flex-shrink-0 -mr-1 -mt-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Close panel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {header && (
        <div className="flex-shrink-0 border-b border-[--border-subtle]">
          {header}
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {children}
      </div>
    </aside>
  )
}
