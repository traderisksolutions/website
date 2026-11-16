'use client'

/**
 * A thread's side as a person sets it: Client, an insurer on file by name (or the insurer side
 * with none named), Internal or Other. Used where a thread joins a case: the Sources panel and Combine.
 */
import { selectCls } from './shared'
import type { Side } from '@/lib/cases/sources'

export const SIDE_NAME: Record<Side, string> = { client: 'Client', insurer: 'Insurer', internal: 'Internal', other: 'Other' }
/** The side, and for the insurer side the insurer on file. */
export type From = { side: Side; insurer: string | null }
const fromValue = (f: From) => (f.side === 'insurer' && f.insurer ? `insurer:${f.insurer}` : f.side)
const fromOf = (value: string): From => (value.startsWith('insurer:') ? { side: 'insurer', insurer: value.slice(8) } : { side: value as Side, insurer: null })

export function SideSelect({ subject, value, insurers, onChange, disabled = false }: {
  subject: string | null
  value: From
  insurers: readonly { id: string; name: string }[]
  onChange: (f: From) => void
  disabled?: boolean
}) {
  return (
    <select className={`${selectCls} max-w-[200px]`} aria-label={`Side for ${subject || 'No subject'}`} value={fromValue(value)} disabled={disabled} onChange={e => onChange(fromOf(e.target.value))}>
      <option value="client">{SIDE_NAME.client}</option>
      <optgroup label={SIDE_NAME.insurer}>
        <option value="insurer">Insurer, not named</option>
        {insurers.map(i => <option key={i.id} value={`insurer:${i.id}`}>{i.name}</option>)}
      </optgroup>
      <option value="internal">{SIDE_NAME.internal}</option>
      <option value="other">{SIDE_NAME.other}</option>
    </select>
  )
}
