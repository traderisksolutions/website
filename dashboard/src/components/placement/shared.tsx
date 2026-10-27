'use client'

import { Field, inputCls } from '@/components/crm/primitives'
import { groupedProductLines } from '@/lib/product-lines'
import { SPEC_KEYS, SPEC_LABEL, type Spec } from '@/lib/placement/types'

export const INK = '#202124'
export const MUTED = '#5f6368'
export const ERROR = '#c5221f'

export const selectCls = `${inputCls} appearance-none`

/** fetch + JSON with the route's `{ error }` surfaced as an Error. */
export async function callApi<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })
  let d: unknown = null
  try { d = await res.json() } catch { /* no body */ }
  if (!res.ok) {
    const msg = d && typeof d === 'object' && typeof (d as { error?: unknown }).error === 'string' ? (d as { error: string }).error : `Request failed (${res.status}).`
    throw new Error(msg)
  }
  return d as T
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Product line picker grouped as the website navbar: Assets / Liabilities / Workforce. */
export function ProductLineSelect({ value, onChange, className }: { value: string; onChange: (slug: string) => void; className?: string }) {
  return (
    <select className={className ?? selectCls} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Product line</option>
      {groupedProductLines().map(g => (
        <optgroup key={g.key} label={g.label}>
          {g.sections.flatMap(s => s.lines).map(l => <option key={l.slug} value={l.slug}>{l.label}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

/** The seven spec fields in a compact two-column grid. Scope and Notes take the full row. */
export function SpecFields({ value, onChange, compact }: { value: Spec; onChange: (next: Spec) => void; compact?: boolean }) {
  const cls = compact ? `${inputCls} h-9 text-[13px]` : inputCls
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2.5">
      {SPEC_KEYS.map(k => (
        <div key={k} className={k === 'scope' || k === 'notes' || k === 'extras' ? 'sm:col-span-2' : ''}>
          <Field label={SPEC_LABEL[k]}>
            <input className={cls} value={value[k] ?? ''} onChange={e => onChange({ ...value, [k]: e.target.value })} />
          </Field>
        </div>
      ))}
    </div>
  )
}

/** The dialog shell shared by the placement dialogs: full-width on a phone, capped on desktop. */
export const dialogCls = 'w-[calc(100vw-32px)] max-w-[720px] max-h-[90vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0'
