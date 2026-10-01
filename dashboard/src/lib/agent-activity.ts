/**
 * What the housekeeping agent did, recorded so a person can see it later.
 *
 * logActivity() cannot be used for this: it reads the signed-in user and returns early when
 * there is none. The agent runs on the ingest path and on cron, with no session, so every
 * action it has ever taken went unrecorded — audit_logs holds 2,193 rows and not one of them
 * is the agent's.
 *
 * Rows are written with a fixed machine actor so the agent's work can be told from a person's
 * by the actor alone, and so "what changed while I was away" never shows a colleague's edits
 * back to them as if a machine had done it.
 */
import { logError } from '@/lib/error-log'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

/** The actor on every row the agent writes. Not a real address — nothing can sign in as this. */
export const HOUSEKEEPING_ACTOR = 'agent:housekeeping'
export const HOUSEKEEPING_NAME  = 'Filing agent'

/**
 * The actions the agent can take. A closed set, because the banner groups by it and an
 * unrecognised action would be shown to staff as a bare database string.
 */
export type HousekeepingAction =
  | 'thread.filed'          // a conversation given a company
  | 'company.created'       // a company created for a domain or name not seen before
  | 'domain.attached'       // an existing company learned a new domain
  | 'company.merged'        // two records for one company joined
  | 'signature.read'        // a contact's title or direct line taken from a sign-off
  | 'thread.left'           // the agent declined to guess; a person must choose

export interface AgentAction {
  action:        HousekeepingAction
  /** What it acted on, for the log's "To" column. A company or contact name, as a person reads it. */
  subject:       string
  resourceType?: string
  resourceId?:   string
  /** Why, in one phrase, so a wrong decision can be understood and undone. */
  basis?:        string
  metadata?:     Record<string, unknown>
}

/**
 * Never throws and never blocks the caller: a lost log line must not cost an ingested email.
 * Failures are reported rather than swallowed — the lesson of the usage ledger, which went
 * silent for three months because its write was fire-and-forget and unchecked.
 */
export async function logHousekeeping(a: AgentAction): Promise<void> {
  try {
    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k || !SB_URL) return

    const res = await fetch(`${SB_URL}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: {
        apikey: k, Authorization: `Bearer ${k}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id:       null,
        user_email:    HOUSEKEEPING_ACTOR,
        user_name:     HOUSEKEEPING_NAME,
        action:        a.action,
        resource_type: a.resourceType ?? null,
        resource_id:   a.resourceId ?? null,
        new_value:     { subject: a.subject, basis: a.basis ?? null, ...(a.metadata ?? {}) },
      }),
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200)
      console.error(`[housekeeping-log] write failed HTTP ${res.status} for ${a.action}: ${body}`)
      void logError({ source: 'internal', feature: 'housekeeping_log', statusCode: res.status, message: body })
    }
  } catch (e) {
    console.error('[housekeeping-log] write threw:', e)
  }
}

/** Fire-and-forget wrapper for call sites that must not wait on a log write. */
export function recordHousekeeping(a: AgentAction): void {
  void logHousekeeping(a)
}
