'use client'

import { cn } from '@/lib/utils'
import { EMAIL_TYPE_MAP } from '@/components/engagement/types'

interface EmailTypeBadgeProps {
  type:       string | null
  size?:      'xs' | 'sm' | 'md'
  className?: string
}

export function EmailTypeBadge({ type, size = 'sm', className }: EmailTypeBadgeProps) {
  if (!type) return null
  const et = EMAIL_TYPE_MAP[type]
  if (!et) return null

  return (
    <span
      className={cn(
        'inline-flex items-center font-bold rounded-full whitespace-nowrap flex-shrink-0 tracking-wide uppercase',
        size === 'xs' && 'text-[8.5px] px-2 py-[2px]',
        size === 'sm' && 'text-[9.5px] px-2.5 py-[3px]',
        size === 'md' && 'text-[11px] px-3 py-[4px]',
        className,
      )}
      style={{ background: et.bg, color: et.color }}
    >
      {et.label}
    </span>
  )
}
