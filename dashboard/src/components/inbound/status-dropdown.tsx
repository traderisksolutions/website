'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn } from '@/components/crm/primitives'
import { STATUS_MAP, ALL_STATUSES } from './constants'
import type { Lead } from './types'

interface StatusDropdownProps {
  lead: Lead
  onChange: (id: string, status: string) => void
}

/** Status as a neutral chip with a chevron; the label carries the meaning, never a colour. */
export function StatusDropdown({ lead, onChange }: StatusDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref  = useRef<HTMLDivElement>(null)
  const st   = STATUS_MAP[lead.status] ?? STATUS_MAP.new

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <Btn
        level="tertiary"
        size="xs"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Lead status: ${st.label}. Click to change.`}
        className="h-auto gap-1 rounded px-2 py-0.5 text-small leading-4 border-0 hover:bg-trs-line bg-trs-field text-trs-muted hover:text-trs-ink-2"
      >
        {st.label} <ChevronDown size={11} className="text-trs-muted" />
      </Btn>

      {open && (
        <div
          role="listbox"
          aria-label="Select status"
          className="absolute top-[calc(100%+4px)] left-0 bg-white rounded z-[100] py-1 min-w-[160px] overflow-hidden border border-trs-line shadow-[0_8px_24px_rgba(15,20,18,0.10)]"
        >
          {ALL_STATUSES.map(s => {
            const sc = STATUS_MAP[s]
            const on = lead.status === s
            return (
              <Btn
                key={s}
                level="tertiary"
                role="option"
                aria-selected={on}
                onClick={e => { e.stopPropagation(); onChange(lead.id, s); setOpen(false) }}
                className={cn('w-full text-left px-3 h-9 rounded-none text-body bg-transparent border-0 justify-between gap-3 hover:bg-trs-tint', on ? 'font-medium text-trs-ink hover:text-trs-ink' : 'font-normal text-trs-ink-2 hover:text-trs-ink-2')}
              >
                {sc.label}
                {on && <Check size={13} className="text-trs-ink" aria-hidden />}
              </Btn>
            )
          })}
        </div>
      )}
    </div>
  )
}
