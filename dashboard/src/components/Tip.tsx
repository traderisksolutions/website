'use client'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Placement = 'top' | 'bottom' | 'left' | 'right' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

const AT: Record<Placement, string> = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  topLeft: 'bottom-full left-0 mb-1.5',
  topRight: 'bottom-full right-0 mb-1.5',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  bottomLeft: 'top-full left-0 mt-1.5',
  bottomRight: 'top-full right-0 mt-1.5',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
}

/** A help mark that shows its note on hover or keyboard focus. Plain CSS; no tooltip library. */
export function Tip({ text, placement = 'top', width = 260 }: {
  text: string
  placement?: Placement
  /** Wider for a note of several sentences. */
  width?: number
}) {
  return (
    <span className="group relative ml-1 inline-flex cursor-help items-center align-middle leading-none text-trs-subtle" tabIndex={0} aria-label={text}>
      <HelpCircle size={12} />
      <span role="tooltip" style={{ width: `min(${width}px, 80vw)` }} // drift-ok: width is the caller's number
        className={cn('pointer-events-none invisible absolute z-50 rounded-md bg-trs-ink px-2.5 py-1.5 text-xs leading-relaxed text-white opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100', AT[placement])}>
        {text}
      </span>
    </span>
  )
}
