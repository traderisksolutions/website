'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Pick a company by typing. A native select of ninety-odd names is unusable, so this filters as
 * you type on name and domain, and shows the domain under each name because two companies often
 * read alike. Keyboard: up and down move, Enter picks, Escape closes.
 */
export type CompanyOption = { id: string; name: string; domains?: string[]; kind?: string }

export function CompanySearchSelect({ options, value, onChange, placeholder = 'Search companies…', className, disabled }: {
  options: CompanyOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const picked = options.find(o => o.id === value) ?? null

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase()
    const list = n
      ? options.filter(o => o.name.toLowerCase().includes(n) || (o.domains ?? []).some(d => d.includes(n)))
      : options
    return list.slice(0, 60)
  }, [options, q])

  useEffect(() => { setActive(0) }, [q])

  const pick = (o: CompanyOption) => { onChange(o.id); setQ(''); setOpen(false) }

  if (picked && !open) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 h-10 rounded-[10px] border bg-white pl-3 pr-1.5 text-[14px] max-w-[260px]', className)} style={{ borderColor: '#dadce0', color: '#202124' }}>
        <span className="truncate">{picked.name}</span>
        <button type="button" disabled={disabled} onClick={() => { onChange(''); setOpen(true) }} aria-label="Clear company"
          className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] flex-shrink-0" style={{ color: '#5f6368' }}><X size={12} /></button>
      </span>
    )
  }

  return (
    <div ref={box} className={cn('relative', className)}>
      <span className="relative block">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#80868b' }} />
        <input
          value={q} disabled={disabled} onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, matches.length - 1)); setOpen(true) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
            else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); pick(matches[active]) }
            else if (e.key === 'Escape') { setOpen(false) }
          }}
          placeholder={placeholder} aria-label="Search companies" role="combobox" aria-expanded={open} aria-controls="company-options"
          className="h-10 w-full min-w-[200px] rounded-[10px] border bg-white pl-9 pr-3 text-[14px] outline-none transition-colors focus:border-[#202124] disabled:opacity-50"
          style={{ borderColor: '#dadce0', color: '#202124' }} />
      </span>
      {open && (
        <ul id="company-options" role="listbox"
          className="absolute left-0 top-full mt-1 z-30 w-[300px] max-h-[290px] overflow-auto rounded-[12px] bg-white p-1.5 m-0 list-none"
          style={{ border: '1px solid #e8eaed', boxShadow: '0 12px 32px rgba(32,33,36,0.12)' }}>
          {matches.length === 0 && <li className="px-3 py-2.5 text-[13.5px]" style={{ color: '#5f6368' }}>No company matches “{q.trim()}”.</li>}
          {matches.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
                className={cn('w-full text-left px-3 py-2 rounded-[8px] border-0 cursor-pointer', i === active ? 'bg-[#f1f3f4]' : 'bg-transparent')}>
                <span className="block text-[14px] truncate" style={{ color: '#202124' }}>{o.name}</span>
                {(o.domains?.[0] || o.kind) && (
                  <span className="block text-[12.5px] truncate" style={{ color: '#5f6368' }}>{[o.domains?.[0], o.kind && o.kind !== 'client' ? o.kind : null].filter(Boolean).join(' · ')}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
