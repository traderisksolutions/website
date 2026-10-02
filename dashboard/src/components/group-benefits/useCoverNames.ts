'use client'
import { useEffect, useState } from 'react'
import type { CoverNames } from '@/lib/gb/cover-names'

/** TRS's names for covers and benefit lines, set on the Coverage tab. Empty until loaded, so
 *  callers fall back to the canonical name rather than wait. */
export function useCoverNames(): CoverNames {
  const [names, setNames] = useState<CoverNames>({})
  useEffect(() => {
    fetch('/api/group-benefits/coverage?names=1', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { names: {} }))
      .then(j => setNames(j.names ?? {}))
      .catch(() => {})
  }, [])
  return names
}
