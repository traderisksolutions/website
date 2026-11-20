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
        'inline-flex items-center font-medium rounded whitespace-nowrap flex-shrink-0 leading-none bg-trs-field text-trs-ink-2',
        size === 'xs' && 'text-small px-2 h-5',
        size === 'sm' && 'text-small px-2.5 h-6',
        size === 'md' && 'text-body px-3 h-7',
        className,
      )}
    >
      {et.label}
    </span>
  )
}
