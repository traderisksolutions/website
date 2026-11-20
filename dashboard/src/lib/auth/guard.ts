/**
 * Who may call a route handler. Every /api handler that checks its caller does it here.
 *
 * src/middleware.ts already gates /api/** (an API key plus an actor: a TRS session or the cron
 * bearer). These wrappers are the handler's own check on top of that, kept for two reasons: the
 * gate can run in log-only mode, and the handler needs to know who is calling.
 *
 *   export const GET = withStaff(async (req, ctx, { user }) => { ... })
 *   export const POST = withStaffOrCron(async (req) => { ... })
 *   export const GET = withCron(async (req) => { ... }, { error: 'Unauthorized' })
 *
 * The second argument is Next's route context ({ params }), passed through untouched. The third
 * is who is calling. `deny.error` keeps the 401 body each route answered with before.
 *
 * Roles: `can()` is the single place they go. Today every TRS staff user may do everything.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, type AuthedUser } from '@/lib/supabase/server'

const TRS_DOMAIN = 'trade-risksol.com'

export type StaffUser = AuthedUser

/** The 401 a route answers with when the caller is turned away. */
export interface Deny {
  /** The `error` field of the JSON body. Default 'unauthorized'. */
  error?: string
  headers?: HeadersInit
}

type Result = Response | void
type Handler<C, A> = (req: NextRequest, ctx: C, auth: A) => Promise<Result> | Result
type Route<C> = (req: NextRequest, ctx: C) => Promise<Result>

const unauthorized = (deny?: Deny) =>
  NextResponse.json({ error: deny?.error ?? 'unauthorized' }, { status: 401, headers: deny?.headers })

/** True when the request carries the cron bearer. The secret is compared, never logged. */
export function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

export function isStaff(user: { email?: string | null } | null | undefined): boolean {
  return !!user?.email?.toLowerCase().endsWith(`@${TRS_DOMAIN}`)
}

/** The signed-in TRS user, or null. Never throws. */
export async function staffUser(): Promise<StaffUser | null> {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser()
    return isStaff(user) ? user : null
  } catch {
    return null
  }
}

/**
 * May this user do this? The one place roles will go. No roles exist yet, so every TRS staff
 * user may do everything; `action` names what is asked (e.g. 'policy.write') for when they do.
 */
export function can(user: { email?: string | null } | null | undefined, action: string): boolean {
  void action
  return isStaff(user)
}

/** A signed-in TRS user is required. The handler receives `{ user }`. */
export function withStaff<C>(handler: Handler<C, { user: StaffUser }>, deny?: Deny): Route<C> {
  return async (req, ctx) => {
    const user = await staffUser()
    if (!user) return unauthorized(deny)
    return handler(req, ctx, { user })
  }
}

/** The cron bearer is required. */
export function withCron<C>(handler: Handler<C, { cron: true }>, deny?: Deny): Route<C> {
  return async (req, ctx) => {
    if (!isCron(req)) return unauthorized(deny)
    return handler(req, ctx, { cron: true })
  }
}

/**
 * The cron bearer or a signed-in TRS user. The bearer is checked first; a cron call has
 * `user: null`.
 */
export function withStaffOrCron<C>(handler: Handler<C, { user: StaffUser | null }>, deny?: Deny): Route<C> {
  return async (req, ctx) => {
    if (isCron(req)) return handler(req, ctx, { user: null })
    const user = await staffUser()
    if (!user) return unauthorized(deny)
    return handler(req, ctx, { user })
  }
}

/**
 * The check withStaffOrCron makes, for shared helpers that run it themselves (sales actor,
 * placement gate, case actor). Null when allowed, else the 401 to return.
 */
export async function requireStaffOrCron(req: Request): Promise<NextResponse | null> {
  if (isCron(req)) return null
  if (await staffUser()) return null
  return unauthorized()
}
