import { STATUS_MAP } from '@/components/engagement/types'
import { cn } from '@/lib/utils'

interface EngagementStatusBadgeProps {
  status:     string
  size?:      'sm' | 'md'
  className?: string
}

export function EngagementStatusBadge({
  status,
  size = 'sm',
  className,
}: EngagementStatusBadgeProps) {
  const st = STATUS_MAP[status] ?? STATUS_MAP.contacted
  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded-full whitespace-nowrap flex-shrink-0',
        size === 'sm' ? 'text-[10.5px] px-2.5 py-[3px]' : 'text-[11.5px] px-3 py-1',
        className,
      )}
      style={{ background: st.bg, color: st.color }}
    >
      {st.label}
    </span>
  )
}
