'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { StaffMember } from '@/lib/crm/staff'
import type { CompanyCard } from '@/lib/engagement/company-card'

/**
 * The Inbox's reads about people and companies beside a thread. The team (who is signed in, the
 * staff names) comes with the page from the server. A company's card (name, kind, owner, open
 * to-dos) is read per company from /api/engagement/company-card and kept for a minute, so the
 * header and the rail share one read; the page seeds the open thread's card with its first response.
 */
export type InboxTeam = { me: string | null; staff: StaffMember[] }

const TeamContext = createContext<InboxTeam>({ me: null, staff: [] })
export const InboxTeamProvider = TeamContext.Provider
export const useInboxTeam = () => useContext(TeamContext)

const cache = new Map<string, { at: number; rev: number; p: Promise<CompanyCard> }>()

/** A card read on the server with the page: kept as if just read. */
export function seedCompanyCard(id: string, card: CompanyCard) {
  if (!cache.has(id)) cache.set(id, { at: Date.now(), rev: 0, p: Promise.resolve(card) })
}

/** `rev` is the caller's refresh count: a higher one than the cached read's reads again. */
function loadCard(id: string, rev: number): Promise<CompanyCard> {
  const hit = cache.get(id)
  if (hit && hit.rev >= rev && Date.now() - hit.at < 60_000) return hit.p
  const p = fetch(`/api/engagement/company-card?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
    .then(r => r.ok ? r.json() as Promise<CompanyCard> : { company: null, tasks: [] })
  cache.set(id, { at: Date.now(), rev, p })
  p.catch(() => cache.delete(id))
  return p
}

/** One company's card; `refresh` going up (a to-do was added or undone) reads it again. */
export function useCompanyCard(id: string | null, refresh = 0): CompanyCard | null {
  const [card, setCard] = useState<{ id: string; card: CompanyCard } | null>(null)
  useEffect(() => {
    if (!id) return
    let live = true
    loadCard(id, refresh).then(c => { if (live) setCard({ id, card: c }) }).catch(() => {})
    return () => { live = false }
  }, [id, refresh])
  return id && card?.id === id ? card.card : null
}
