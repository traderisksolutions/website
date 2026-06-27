'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { STATUS_MAP, ALL_STATUSES } from './constants'
import type { Lead } from './types'

interface StatusDropdownProps {
  lead: Lead
  onChange: (id: string, status: string) => void
}

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
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Lead status: ${st.label}. Click to change.`}
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-[6px] border-0 cursor-pointer whitespace-nowrap"
        style={{ background: st.bg, color: st.color }}
      >
        {st.label} <ChevronDown size={10} strokeWidth={2.5} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select status"
          className="absolute top-[calc(100%+4px)] left-0 bg-card rounded-[10px] z-[100] py-1 min-w-[140px]"
          style={{ boxShadow: 'var(--shadow-panel)', border: '1px solid var(--border-subtle)' }}
        >
          {ALL_STATUSES.map(s => {
            const sc = STATUS_MAP[s]
            return (
              <button
                key={s}
                role="option"
                aria-selected={lead.status === s}
                onClick={e => { e.stopPropagation(); onChange(lead.id, s); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-[12px] bg-transparent border-0 cursor-pointer flex items-center gap-2 hover:bg-muted/50"
                style={{
                  fontWeight: lead.status === s ? 600 : 400,
                  color: lead.status === s ? sc.color : 'hsl(var(--muted-foreground))',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sc.color }} />
                {sc.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
