import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="m-0 text-[28px] font-medium tracking-[-0.02em] leading-[1.15]" style={{ color: '#202124' }}>
          {title}
        </h1>
        {description && (
          <p className="m-0 mt-1 text-[14.5px] leading-snug" style={{ color: '#5f6368' }}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
