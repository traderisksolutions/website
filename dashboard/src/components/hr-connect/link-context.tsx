'use client'

// HR Connect: one fetch of /api/public/hr/<token> shared by the frame and every page under
// /connect/<token>. The token is the URL segment; it is never put in storage.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { HrDependant, HrEmployee, HrSource } from '@/lib/hr/types'
import type { PublicLink } from '@/lib/hr/public'

export type PublicDraft = {
  source: HrSource
  source_meta: Record<string, unknown>
  employees: HrEmployee[]
  dependants: HrDependant[]
  employee_count: number
  dependant_count: number
  status: 'draft' | 'submitted'
  updated_at: string
}

export type ClosedInfo = {
  reason: 'expired' | 'closed' | 'submitted'
  link: PublicLink
  submission?: { employee_count: number; dependant_count: number; submitted_by_name: string | null; consent_at: string | null }
}

export type LinkState =
  | { kind: 'loading' }
  | { kind: 'ok'; link: PublicLink; submission: PublicDraft | null }
  | { kind: 'closed'; info: ClosedInfo }
  | { kind: 'notfound' }
  | { kind: 'pending' }
  | { kind: 'error'; message: string }

type Ctx = { token: string; state: LinkState; refresh: () => Promise<void>; setDraft: (d: PublicDraft | null) => void }

const LinkCtx = createContext<Ctx | null>(null)

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === 'string' ? body.error : `Request failed (${status})`)
    this.status = status
    this.body = body
  }
}

/** Calls the public API for this token. Throws ApiError on a non-2xx. */
export async function api<T = Record<string, unknown>>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/public/hr/${encodeURIComponent(token)}${path}`, { cache: 'no-store', ...init })
  const body = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

export function LinkProvider({ token, children }: { token: string; children: React.ReactNode }) {
  const [state, setState] = useState<LinkState>({ kind: 'loading' })

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ link: PublicLink; submission: PublicDraft | null }>(token, '')
      setState({ kind: 'ok', link: r.link, submission: r.submission })
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) return setState({ kind: 'notfound' })
        if (e.status === 410) return setState({ kind: 'closed', info: e.body as unknown as ClosedInfo })
        if (e.status === 503 && e.body.migrationPending) return setState({ kind: 'pending' })
        if (e.status === 429) return setState({ kind: 'error', message: 'Too many requests. Wait a few minutes and open the link again.' })
      }
      setState({ kind: 'error', message: 'The page could not be loaded. Try again in a moment.' })
    }
  }, [token])

  useEffect(() => { void refresh() }, [refresh])

  const setDraft = useCallback((d: PublicDraft | null) => {
    setState(s => (s.kind === 'ok' ? { ...s, submission: d } : s))
  }, [])

  const value = useMemo(() => ({ token, state, refresh, setDraft }), [token, state, refresh, setDraft])
  return <LinkCtx.Provider value={value}>{children}</LinkCtx.Provider>
}

export function useLink(): Ctx {
  const c = useContext(LinkCtx)
  if (!c) throw new Error('useLink outside LinkProvider')
  return c
}
