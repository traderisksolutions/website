'use client'

import { useEffect, useMemo, useState } from 'react'
import { Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterGroupRow } from '@/components/ui/register'
import type { InsurerRoute } from '@/lib/placement/store'
import { callApi, errText, INK, MUTED, ERROR } from './shared'

const COLS = 3
const checkboxCls = 'h-3.5 w-3.5 cursor-pointer accent-[#202124]'

/**
 * The insurer contacts on file for the product lines, grouped by insurer, each with a checkbox.
 * The broker picks who gets the request before anything is drafted. `value` null = not loaded
 * yet; on load the picker chooses one contact per insurer (the first by name), or `preferIds`
 * where they are on the list, and reports it through onChange.
 */
export function ContactPicker({ productLines, tier, value, onChange, preferIds }: {
  productLines: string[]
  tier?: 'c'
  value: Set<string> | null
  onChange: (next: Set<string>) => void
  /** Contacts to select first when they are on the list (the current round's recipients). */
  preferIds?: string[]
}) {
  const [routes, setRoutes] = useState<InsurerRoute[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = [...productLines].sort().join(',')

  useEffect(() => {
    let live = true
    setRoutes(null); setError(null)
    if (!key) { setRoutes([]); return }
    const q = new URLSearchParams({ product_lines: key })
    if (tier) q.set('tier', tier)
    callApi<{ routes: InsurerRoute[] }>(`/api/placements/routes?${q}`)
      .then(d => { if (live) setRoutes(d.routes) })
      .catch(e => { if (live) setError(errText(e)) })
    return () => { live = false }
  }, [key, tier, attempt])

  const groups = useMemo(() => {
    const m = new Map<string, InsurerRoute[]>()
    for (const r of routes ?? []) m.set(r.insurer_name, [...(m.get(r.insurer_name) ?? []), r])
    return [...m.entries()]
  }, [routes])

  // Default pick once the list is in: the current recipients where present, else one per insurer.
  useEffect(() => {
    if (!routes || value !== null) return
    const onList = new Set(routes.map(r => r.contact_id))
    const kept = (preferIds ?? []).filter(id => onList.has(id))
    onChange(new Set(kept.length ? kept : groups.map(([, rs]) => rs[0].contact_id)))
  }, [routes, value, groups, preferIds, onChange])

  if (error) {
    return (
      <p className="m-0 text-[13px]" style={{ color: ERROR }}>
        {error}{' '}
        <button type="button" className="bg-transparent border-0 p-0 underline cursor-pointer text-[13px]" style={{ color: INK }} onClick={() => setAttempt(a => a + 1)}>Retry</button>
      </p>
    )
  }
  if (!routes || value === null) return <Spinner label="Loading insurer contacts…" />
  if (routes.length === 0) return <p className="m-0 text-[14px]" style={{ color: MUTED }}>No insurer contact on file for this product line.</p>

  const selected = routes.filter(r => value.has(r.contact_id)).length
  const toggle = (id: string, on: boolean) => { const n = new Set(value); if (on) n.add(id); else n.delete(id); onChange(n) }
  const toggleGroup = (rs: InsurerRoute[], on: boolean) => { const n = new Set(value); for (const r of rs) { if (on) n.add(r.contact_id); else n.delete(r.contact_id) } onChange(n) }

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[13px]" style={{ color: INK }}>{selected} of {routes.length} contacts selected</p>
      <Register label="Insurer contacts" minWidth={480}>
        <RegisterHead>
          <RegisterTh first width={64}>Ask</RegisterTh>
          <RegisterTh>Insurer</RegisterTh>
          <RegisterTh last>Contact</RegisterTh>
        </RegisterHead>
        <tbody>
          {groups.map(([insurer, rs]) => {
            const on = rs.filter(r => value.has(r.contact_id)).length
            return [
              <RegisterGroupRow key={`g:${insurer}`} colSpan={COLS}>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className={checkboxCls}
                    checked={on === rs.length}
                    ref={el => { if (el) el.indeterminate = on > 0 && on < rs.length }}
                    onChange={e => toggleGroup(rs, e.target.checked)}
                    aria-label={`Ask ${insurer}`}
                  />
                  {insurer}
                  <span className="font-normal" style={{ color: MUTED }}>{on} of {rs.length}</span>
                </label>
              </RegisterGroupRow>,
              ...rs.map(r => (
                <RegisterRow key={r.contact_id}>
                  <RegisterCell first identityWidth={64}>
                    <input
                      type="checkbox"
                      className={checkboxCls}
                      checked={value.has(r.contact_id)}
                      onChange={e => toggle(r.contact_id, e.target.checked)}
                      aria-label={`Ask ${r.name ?? r.email} at ${r.insurer_name}`}
                    />
                  </RegisterCell>
                  <RegisterCell primary={r.insurer_name} />
                  <RegisterCell last primary={r.name ?? '—'} secondary={r.email} />
                </RegisterRow>
              )),
            ]
          })}
        </tbody>
      </Register>
    </div>
  )
}
