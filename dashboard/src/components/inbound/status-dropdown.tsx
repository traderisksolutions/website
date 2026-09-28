'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { STATUS_MAP, ALL_STATUSES } from './constants'
import type { Lead } from './types'

interface StatusDropdownProps {
  lead: Lead
  onChange: (id: string, status: string) => void
}

const INK = '#202124'
const MUTED = '#5f6368'

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
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Lead status: ${st.label}. Click to change.`}
        className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium leading-4 border-0 cursor-pointer whitespace-nowrap hover:bg-[#e8eaed] transition-colors"
        style={{ background: '#f1f3f4', color: '#3c4043' }}
      >
        {st.label} <ChevronDown size={11} style={{ color: MUTED }} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select status"
          className="absolute top-[calc(100%+4px)] left-0 bg-white rounded-[12px] z-[100] py-1 min-w-[160px] overflow-hidden"
          style={{ border: '1px solid #e8eaed', boxShadow: '0 8px 24px rgba(32,33,36,0.10)' }}
        >
          {ALL_STATUSES.map(s => {
            const sc = STATUS_MAP[s]
            const on = lead.status === s
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={on}
                onClick={e => { e.stopPropagation(); onChange(lead.id, s); setOpen(false) }}
                className="w-full text-left px-3 h-9 text-[13.5px] bg-transparent border-0 cursor-pointer flex items-center justify-between gap-3 hover:bg-[#f8f9fa]"
                style={{ fontWeight: on ? 500 : 400, color: on ? INK : '#3c4043' }}
              >
                {sc.label}
                {on && <Check size={13} style={{ color: INK }} aria-hidden />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
