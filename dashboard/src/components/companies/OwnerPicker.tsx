'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { StaffMember } from '@/lib/crm/staff'
import { PersonTag } from '@/components/board/TodoEditor'
import { Btn } from '@/components/crm/primitives'

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
  const h = size === 'md' ? 'h-8 text-body' : 'h-7 text-body'
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {value.map(email => (
        <span key={email} className="inline-flex items-center gap-0.5">
          <PersonTag email={email} staff={map} size={size} />
          <Btn level="tertiary" size="xs" disabled={disabled} onClick={() => onChange(value.filter(e => e !== email))} aria-label={`Remove ${map.get(email)?.name ?? email}`} title="Remove"
            className="w-5 h-5 px-0 rounded-full border-0 hover:bg-trs-field disabled:opacity-50 text-trs-subtle"><X size={11} /></Btn>
        </span>
      ))}
      {adding || value.length === 0 ? (
        <select autoFocus={adding} value="" disabled={disabled} aria-label="Add owner"
          onChange={e => { if (e.target.value) onChange([...value, e.target.value]); setAdding(false) }} onBlur={() => setAdding(false)}
          className={`${h} rounded border border-trs-line-2 bg-white pl-2 pr-6 text-trs-muted cursor-pointer outline-none focus:border-trs-ink disabled:opacity-50`}>
          <option value="">{value.length === 0 ? 'No owner' : 'Add person'}</option>
          {rest.map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
        </select>
      ) : rest.length > 0 && (
        <Btn level="tertiary" size="xs" disabled={disabled} onClick={() => setAdding(true)} className={`${h} px-2 border-0 font-normal text-trs-muted hover:bg-trs-field disabled:opacity-50`}>+ Add person</Btn>
      )}
    </span>
  )
}
