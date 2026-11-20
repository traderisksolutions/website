'use client'

import { cn } from '@/lib/utils'

/** A compact native select for tables and forms. `changed` gives it the amber edge of a value moved by hand. */
export function SelectBox({ id, label, value, onChange, options, changed, size = 'sm', className, disabled }: {
  id?: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
  changed?: boolean; size?: 'sm' | 'md'; className?: string; disabled?: boolean
}) {
  return (
    <select id={id} aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}
      className={cn('w-full min-w-0 cursor-pointer rounded-lg border-[1.5px] bg-white text-trs-ink outline-none focus-visible:border-trs-green disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-8 px-1.5 text-xs' : 'h-10 px-3 text-sm', changed ? 'border-trs-warn' : 'border-trs-line-2', className)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
