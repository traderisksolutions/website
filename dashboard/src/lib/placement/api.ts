/**
 * Shared pieces for the /api/placements routes: boundary validation and the acting user.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'
import type { Spec } from './types'
import { normaliseSpec } from './spec'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
export const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
export const isSpec = (v: unknown): v is Spec => v != null && typeof v === 'object' && !Array.isArray(v)
/** An optional list of contact ids: absent/null → undefined, an array of uuids → the array, anything else → false. */
export function contactIdsFrom(v: unknown): string[] | undefined | false {
  if (v == null) return undefined
  if (!Array.isArray(v) || !v.every(isUuid)) return false
  return [...new Set(v as string[])]
}

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

/** The JSON body, or null when it is missing or not an object. */
export async function readBody<T extends Record<string, unknown>>(req: NextRequest): Promise<T | null> {
  const b = await req.json().catch(() => null)
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as T) : null
}

/** The signed-in staff member's email, or 'system' for a cron / internal caller. */
export async function actorEmail(): Promise<string> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email ?? 'system'
  } catch {
    return 'system'
  }
}

/** Auth check + actor in one call. `unauthorized` is the 401 to return when set. */
export async function gate(req: NextRequest): Promise<{ unauthorized: NextResponse | null; actor: string }> {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return { unauthorized, actor: 'system' }
  return { unauthorized: null, actor: await actorEmail() }
}

/** A spec from a request body: an object of the known fields, blanks dropped. */
export const specFrom = (v: unknown): Spec => normaliseSpec(v)

/** An error message with the status the caller deserves: a missing row is theirs to fix. */
export function errorResponse(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : 'Server error'
  const status = /not found|does not exist/i.test(msg) ? 404 : 500
  return fail(msg, status)
}
