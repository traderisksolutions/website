'use client'

import { useEffect, useRef } from 'react'
import type { PickerValue } from './CompanyContactPicker'

/**
 * A debit note names its client; the form should not make a person type that name again.
 * When nothing is picked yet and the extraction gave a client name, look it up: an exact
 * (case-insensitive) match on an existing company is selected outright; otherwise the caller
 * prefills the picker with the name so creating or choosing is one click.
 */
export function useAutoMatchCompany(clientName: string | null | undefined, current: PickerValue | null, setValue: (v: PickerValue) => void) {
  const tried = useRef<string | null>(null)
  useEffect(() => {
    const name = (clientName ?? '').trim()
    if (!name || current || tried.current === name) return
    tried.current = name
    let cancelled = false
    fetch(`/api/companies?search=${encodeURIComponent(name)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: unknown) => {
        if (cancelled) return
        const list = (Array.isArray(rows) ? rows : (rows as { companies?: unknown[] })?.companies ?? []) as { id: string; name?: string; company_name?: string }[]
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(pte|ltd|limited|llp|inc|co|company)\b/g, '').trim()
        const hit = list.find(c => norm(c.name ?? c.company_name ?? '') === norm(name))
        if (hit) setValue({ companyId: hit.id, companyName: hit.name ?? hit.company_name ?? name, contactId: null, contactEmail: null, contactName: null })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [clientName, current, setValue])
}
