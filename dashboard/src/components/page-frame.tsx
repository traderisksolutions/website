import { cn } from '@/lib/utils'

/**
 * The one page frame (Jarod, 20 Nov 2026: one design, no page with a look of its own). Every page
 * sits in it: the same side margins at each width, the same top space, the same gap between
 * blocks, and one of two widths. A page sets neither padding nor width itself.
 */
export function PageFrame({ children, width = 'wide', className }: {
  children: React.ReactNode
  /** read: 1200px, for forms and documents; wide: 1440px, for registers and work queues. */
  width?: 'read' | 'wide'
  className?: string
}) {
  return (
    <div className={cn('mx-auto flex w-full min-w-0 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-10', width === 'read' ? 'max-w-[1200px]' : 'max-w-[1440px]', className)}>
      {children}
    </div>
  )
}
