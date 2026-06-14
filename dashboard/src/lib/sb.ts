// Shared Supabase server-side helpers
// Used by all /api/outbound/* routes

export const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

export function sbHeaders(prefer = 'return=minimal'): Record<string, string> {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:        prefer,
  }
}

// Append-only audit event. Failures are swallowed — logging must never break operations.
export async function logEvent(params: {
  event_type:    string
  entity_type?:  string
  entity_id?:    string
  campaign_id?:  string
  lead_id?:      string
  actor_user_id?: string
  payload?:      Record<string, unknown>
}): Promise<void> {
  try {
    await fetch(`${SB_URL}/rest/v1/ob_outbound_events`, {
      method:  'POST',
      headers: sbHeaders(),
      body:    JSON.stringify({
        event_type:    params.event_type,
        entity_type:   params.entity_type   ?? null,
        entity_id:     params.entity_id     ?? null,
        campaign_id:   params.campaign_id   ?? null,
        lead_id:       params.lead_id       ?? null,
        actor_user_id: params.actor_user_id ?? null,
        payload:       params.payload       ?? {},
      }),
    })
  } catch { /* swallow — audit must not block operations */ }
}
