import { NextResponse } from 'next/server'
import type { GateResult } from './verify'

export type GateMode = 'enforce' | 'log-only'

/**
 * Enforce is the default, and an unset variable means enforce.
 *
 * That direction is the whole design. A gate that has to be switched on is
 * one forgotten Vercel environment variable away from being decorative,
 * and nothing would remind you. This way, forgetting produces a deploy
 * that visibly fails rather than an API that quietly opens.
 *
 * API_GATE_MODE=log-only is the deliberate, temporary exception for the
 * rollout: every request that WOULD be rejected is logged as
 * api_gate.reject and let through, so a caller nobody remembered turns up
 * in the Vercel logs and can be issued a key before the gate starts
 * biting. Set it, read the logs for a few days, then remove it.
 */
export function apiGateMode(): GateMode {
  return process.env.API_GATE_MODE === 'log-only' ? 'log-only' : 'enforce'
}

/** Always JSON, never a redirect. An API caller handed a 302 to /login
 * gets an HTML page and a confusing parse error instead of a status code
 * it can act on. */
export function gateFailureResponse(result: Extract<GateResult, { ok: false }>): NextResponse {
  return NextResponse.json(
    { error: result.message, code: result.code },
    { status: result.status, headers: { 'x-api-gate': result.code } },
  )
}

export function logGateFailure(mode: GateMode, pathname: string, result: Extract<GateResult, { ok: false }>): void {
  // One greppable line, no credential material in it. During the log-only
  // window every line here is a caller that breaks the day the mode comes
  // off — that is what makes the window worth having.
  console.warn(JSON.stringify({
    event: 'api_gate.reject',
    mode, enforced: mode === 'enforce',
    pathname, code: result.code, status: result.status,
    rule: result.rule.prefix || '(unlisted)',
  }))
}

// Names in one place so the stamping side and the reading side cannot
// drift apart.
export const GATE_HEADERS = {
  clientName: 'x-api-client-name',
  actorType:  'x-api-actor-type',
  actorEmail: 'x-api-actor-email',
} as const

/**
 * Writes the verified identity onto the request headers a handler reads
 * back.
 *
 * Every field is deleted first, on every path — failures and open routes
 * included. Without that, a caller could send
 * `x-api-actor-email: someone@trade-risksol.com` and a handler that
 * trusted the header would believe it. Deleting unconditionally means the
 * header is present only when this function put it there.
 */
export function stampGateHeaders(headers: Headers, result: GateResult | null): void {
  headers.delete(GATE_HEADERS.clientName)
  headers.delete(GATE_HEADERS.actorType)
  headers.delete(GATE_HEADERS.actorEmail)

  if (!result?.ok) return
  if (result.client) headers.set(GATE_HEADERS.clientName, result.client.name)
  if (result.actor) {
    headers.set(GATE_HEADERS.actorType, result.actor.type)
    if (result.actor.type === 'staff') headers.set(GATE_HEADERS.actorEmail, result.actor.email)
  }
}
