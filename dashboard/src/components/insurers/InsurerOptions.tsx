'use client'

/**
 * A <datalist> of every insurer on the one insurer list (Companies → Insurers, GET /api/insurers).
 * Pair it with a text input via `list={INSURER_OPTIONS_ID}`: the broker picks a listed insurer or,
 * for a historical record, types a name the list does not have yet.
 */
import { useEffect, useState } from 'react'

export const INSURER_OPTIONS_ID = 'insurer-options'

export function InsurerOptions({ id = INSURER_OPTIONS_ID }: { id?: string }) {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    let live = true
    fetch('/api/insurers', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { name?: string }[]) => { if (live && Array.isArray(rows)) setNames(rows.map(r => r.name ?? '').filter(Boolean).sort((a, b) => a.localeCompare(b))) })
      .catch(() => {})
    return () => { live = false }
  }, [])
  return <datalist id={id}>{names.map(n => <option key={n} value={n} />)}</datalist>
}
