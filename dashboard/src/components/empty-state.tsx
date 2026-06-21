import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
  compact?: boolean
  className?: string
}

export function EmptyState({
  icon: Icon, title, description, action, compact, className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-10 px-6' : 'py-16 px-8',
        className,
      )}
    >
      <div
        className="flex items-center justify-center rounded-full border-2 border-border bg-muted/30 mb-4 flex-shrink-0"
        style={{ width: compact ? 44 : 56, height: compact ? 44 : 56 }}
      >
        <Icon
          className="text-muted-foreground/45"
          style={{
            width:       compact ? 18 : 22,
            height:      compact ? 18 : 22,
            strokeWidth: 1.5,
          }}
        />
      </div>

      <p className="text-sm font-medium text-foreground mb-1">{title}</p>

      {description && (
        <p className="text-xs text-muted-foreground leading-relaxed max-w-[280px] mb-4">
          {description}
        </p>
      )}

      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
