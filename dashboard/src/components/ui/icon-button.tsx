'use client'

import { cn } from '@/lib/utils'

/** A quiet square button holding an icon; the label is its name for screen readers and its tooltip. */
export function IconBtn({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={cn('inline-grid h-7 w-7 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-trs-muted hover:bg-trs-mint hover:text-trs-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-trs-green', className)}>
      {children}
    </button>
  )
}

/** A checkbox in the house green. */
export function Checkbox({ id, checked, onChange, label, disabled }: { id?: string; checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <input id={id} type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={e => onChange(e.target.checked)} className="h-4 w-4 cursor-pointer accent-trs-green disabled:cursor-not-allowed" />
}
