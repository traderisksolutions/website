'use client'

import { cn } from '@/lib/utils'
import { EMAIL_TYPE_MAP } from '@/components/engagement/types'

/** The email type as a neutral chip: field grey, body text, the word carries the meaning.
 *  The per-type colours in EMAIL_TYPE_MAP are no longer painted. */

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
        'inline-flex items-center font-medium rounded-[6px] whitespace-nowrap flex-shrink-0 leading-none',
        size === 'xs' && 'text-[11.5px] px-2 h-[20px]',
        size === 'sm' && 'text-[12px] px-2.5 h-[22px]',
        size === 'md' && 'text-[13px] px-3 h-[26px]',
        className,
      )}
      style={{ background: '#f1f3f4', color: '#3c4043' }}
    >
      {et.label}
    </span>
  )
}
