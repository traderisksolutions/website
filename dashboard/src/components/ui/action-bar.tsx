import { cn } from '@/lib/utils'
import { Btn } from '@/components/crm/primitives'

/**
 * The bar at the foot of a form or detail view. Placement is fixed so a person always finds the
 * same move in the same spot: the moves that leave the item (Cancel, Come back later, Discard)
 * far left, then the secondaries, the one primary far right. Every button in the bar is the same
 * outlined shape; only the primary is filled. Sticks to the bottom of its scroll container.
 *
 *   <ActionBar left={<Btn>Cancel</Btn>}>
 *     <Btn>Save draft</Btn>
 *     <Btn level="primary">Send</Btn>
 *   </ActionBar>
 */
export function ActionBar({ left, children, sticky = true, className }: {
  left?: React.ReactNode
  /** Secondaries, then the primary last. */
  children: React.ReactNode
  sticky?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-trs-line bg-white', sticky && 'sticky bottom-0 z-10', className)}>
      {left && <div className="mr-auto flex flex-wrap items-center gap-2">{left}</div>}
      {children}
    </div>
  )
}

/** Shown only while rows are selected: the count, the bulk actions, a clear. */
export function BulkBar({ count, onClear, children, className }: { count: number; onClear: () => void; children: React.ReactNode; className?: string }) {
  if (count <= 0) return null
  return (
    <div role="region" aria-label="Selected rows" className={cn('flex flex-wrap items-center gap-2 px-3 py-2 rounded bg-trs-select-bg text-trs-select-fg', className)}>
      <span className="text-body font-medium tabular-nums">{count} selected</span>
      <div className="flex flex-wrap items-center gap-2 ml-auto">
        {children}
        <Btn level="tertiary" size="xs" onClick={onClear} className="px-2.5 text-trs-select-fg hover:bg-white/60 hover:text-trs-select-fg">Clear</Btn>
      </div>
    </div>
  )
}
