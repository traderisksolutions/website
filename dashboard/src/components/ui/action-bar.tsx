import { cn } from '@/lib/utils'

/**
 * The bar at the foot of a form or detail view. Placement is fixed so a person always finds the
 * same move in the same spot: quiet actions (Cancel, Back, Delete draft) far left, then the
 * secondaries, the one primary far right. Sticks to the bottom of its scroll container.
 *
 *   <ActionBar left={<Btn level="tertiary">Cancel</Btn>}>
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
    <div role="region" aria-label="Selected rows" className={cn('flex flex-wrap items-center gap-2 px-3 py-2 rounded-[8px] bg-trs-select-bg text-trs-select-fg', className)}>
      <span className="text-[13px] font-medium tabular-nums">{count} selected</span>
      <div className="flex flex-wrap items-center gap-2 ml-auto">
        {children}
        <button type="button" onClick={onClear} className="h-[30px] px-2.5 rounded-[7px] border-0 bg-transparent cursor-pointer text-[13px] text-trs-select-fg hover:bg-white/60">Clear</button>
      </div>
    </div>
  )
}
