'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { StaffMember } from '@/lib/crm/staff'
import { PersonTag } from '@/components/board/TodoEditor'

/**
 * Who owns a company: one person or many. Each owner is a badge with a remove; "Add person"
 * is a quiet select of the rest of the team. Nobody is an owner by default.
 */
export function OwnerPicker({ value, staff, onChange, disabled, size = 'sm' }: {
  value: string[]
  staff: StaffMember[]
  onChange: (owners: string[]) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}) {
  const [adding, setAdding] = useState(false)
  const map = new Map(staff.map(m => [m.email, m]))
  const rest = staff.filter(m => !value.includes(m.email))
  const h = size === 'md' ? 'h-8 text-[13.5px]' : 'h-7 text-[13px]'
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {value.map(email => (
        <span key={email} className="inline-flex items-center gap-0.5">
          <PersonTag email={email} staff={map} size={size} />
          <button type="button" disabled={disabled} onClick={() => onChange(value.filter(e => e !== email))} aria-label={`Remove ${map.get(email)?.name ?? email}`} title="Remove"
            className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] disabled:opacity-50" style={{ color: '#9aa0a6' }}><X size={11} /></button>
        </span>
      ))}
      {adding || value.length === 0 ? (
        <select autoFocus={adding} value="" disabled={disabled} aria-label="Add owner"
          onChange={e => { if (e.target.value) onChange([...value, e.target.value]); setAdding(false) }} onBlur={() => setAdding(false)}
          className={`${h} rounded-[8px] border bg-white pl-2 pr-6 cursor-pointer outline-none focus:border-[#202124] disabled:opacity-50`} style={{ borderColor: '#dadce0', color: '#5f6368' }}>
          <option value="">{value.length === 0 ? 'No owner' : 'Add person'}</option>
          {rest.map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
        </select>
      ) : rest.length > 0 && (
        <button type="button" disabled={disabled} onClick={() => setAdding(true)} className={`${h} px-2 rounded-[8px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] disabled:opacity-50`} style={{ color: '#5f6368' }}>+ Add person</button>
      )}
    </span>
  )
}
