import { keyMatches, keyPrefixOf, secretMatches } from './keys'
import { DEFAULT_API_RULE, matchApiRule, type ApiRule } from './policy'

// The gate. Runs in middleware.ts for every /api/** request, before any
// route handler.
//
// Two independent credentials, both required:
//
//   1. x-api-key                     → which application is calling
//   2. Supabase session cookie, OR   → on whose authority
//      Authorization: Bearer <CRON_SECRET>
//
// Scope follows the credential type, not the route. A 'browser' key is
// only ever valid next to a session; a 'machine' key only next to
// CRON_SECRET. That pairing is the point: the web key is served to every
// staff browser and cannot be kept secret, so on its own it must not be
// able to drive /api/cron/* or the Gemini-spending routes. Checking scope
// per route would have meant classifying 247 handlers correctly and
// keeping that true forever; per credential type needs no such list and
// cannot drift.
//
// This is authentication only. requireStaffOrCron() stays in the handlers
// and still decides who may act — the gate does not replace it, and the
// domain rule keeps exactly one implementation.
//
// Note what this does NOT cover: the browser also talks to Supabase
// directly for chat, Realtime and Storage (src/lib/supabase/chat-queries.ts
// and the postgres_changes subscriptions). Those requests never touch this
// app, so RLS is their only boundary and remains so.

export const API_KEY_HEADER = 'x-api-key'

export type GateFailureCode =
  | 'missing_key' | 'malformed_key' | 'unknown_key' | 'revoked_key'
  | 'scope_mismatch' | 'cross_origin' | 'missing_actor' | 'gate_unavailable'

export interface GateClient { id: string; name: string; kind: string }
export type GateActor = { type: 'staff'; email: string } | { type: 'machine' }

export type GateResult =
  | { ok: true;  client: GateClient | null; actor: GateActor | null; rule: ApiRule }
  | { ok: false; status: number; code: GateFailureCode; message: string; rule: ApiRule }

interface ApiClientRow {
  id: string; name: string; kind: string
  key_hash: string; scopes: string[] | null; status: string
}

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

async function lookupClient(prefix: string): Promise<ApiClientRow | null | 'unavailable'> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) return 'unavailable'

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/api_clients?key_prefix=eq.${encodeURIComponent(prefix)}` +
        `&select=id,name,kind,key_hash,scopes,status&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, cache: 'no-store' },
    )
    // A 404 here means the table does not exist yet — run the migration
    // before taking the gate out of log-only.
    if (!res.ok) return 'unavailable'
    const rows = (await res.json()) as ApiClientRow[]
    return rows[0] ?? null
  } catch {
    return 'unavailable'
  }
}

export interface GateInput {
  request: Request
  pathname: string
  /** The signed-in staff email, already resolved by middleware.ts's own
   * supabase.auth.getUser() call — passed in rather than re-read, so the
   * common browser path costs the gate no extra round trip. */
  sessionEmail: string | null
}

export async function verifyApiRequest({ request, pathname, sessionEmail }: GateInput): Promise<GateResult> {
  const rule = matchApiRule(pathname) ?? DEFAULT_API_RULE

  if (rule.requirement === 'open') return { ok: true, client: null, actor: null, rule }

  // ── Credential 1: the application ─────────────────────────────────────
  const presentedKey = request.headers.get(API_KEY_HEADER)?.trim()
  if (!presentedKey) return fail(rule, 401, 'missing_key', `Missing ${API_KEY_HEADER} header.`)

  const prefix = keyPrefixOf(presentedKey)
  if (!prefix) return fail(rule, 401, 'malformed_key', 'API key is not in the expected format.')

  const client = await lookupClient(prefix)
  if (client === 'unavailable') {
    // Fail closed. An unreachable key registry means we cannot tell a real
    // caller from a forged one, and guessing permissively is how a gate
    // becomes decorative at exactly the wrong moment. Sign-in is
    // unaffected: /auth/callback is not an /api path and never reaches here.
    return fail(rule, 503, 'gate_unavailable', 'API gate cannot verify keys right now.')
  }
  // One answer for "no such prefix" and "prefix real, secret wrong", so a
  // response cannot be used to confirm a prefix exists.
  if (!client || !(await keyMatches(presentedKey, client.key_hash))) {
    return fail(rule, 401, 'unknown_key', 'API key is not recognised.')
  }
  if (client.status !== 'active') return fail(rule, 401, 'revoked_key', 'API key has been revoked.')

  const gateClient: GateClient = { id: client.id, name: client.name, kind: client.kind }
  const scopes = client.scopes ?? []

  // ── Credential 2: the actor ───────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null
  const isMachine = Boolean(bearer && cronSecret && (await secretMatches(bearer, cronSecret)))

  if (isMachine) {
    if (!scopes.includes('machine')) {
      return fail(rule, 403, 'scope_mismatch', 'This key is not permitted to act as a machine caller.')
    }
    return { ok: true, client: gateClient, actor: { type: 'machine' }, rule }
  }

  if (sessionEmail) {
    if (!scopes.includes('web')) {
      return fail(rule, 403, 'scope_mismatch', 'This key is not permitted to act for a signed-in user.')
    }
    // A browser key is public by construction — it is in every page this
    // user loads. The session cookie's SameSite setting is the real
    // defence against another site spending it; this is the second,
    // cheaper lock. An absent Origin is not a failure: browsers omit it on
    // same-origin GETs.
    const origin = request.headers.get('origin')
    if (gateClient.kind === 'browser' && origin && origin !== new URL(request.url).origin) {
      return fail(rule, 403, 'cross_origin', 'Browser key used from another origin.')
    }
    return { ok: true, client: gateClient, actor: { type: 'staff', email: sessionEmail }, rule }
  }

  return fail(rule, 401, 'missing_actor', 'No signed-in session and no valid machine token.')
}

function fail(rule: ApiRule, status: number, code: GateFailureCode, message: string): GateResult {
  return { ok: false, status, code, message, rule }
}
