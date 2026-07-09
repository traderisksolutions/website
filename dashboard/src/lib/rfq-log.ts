/**
 * RFQ audit trail (Supabase `rfq_events`). One row per touchpoint across the whole
 * lifecycle, linked to the real ids. Uses the service key so it works both in
 * request routes (pass the user's email as actor) AND in background/system paths
 * like auto quote-capture (actor defaults to 'system'). Never throws.
 */
const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

export type RfqEventType =
  | 'requested' | 'dispatched' | 'replied' | 'quoted'
  | 'recommended' | 'selected' | 'not_chosen' | 'reopened'

export async function logRfqEvent(e: {
  event_type:      RfqEventType
  case_id?:        string | null
  rfq_request_id?: string | null
  dispatch_id?:    string | null
  quote_id?:       string | null
  insurer_name?:   string | null
  actor?:          string | null
  summary?:        string
  detail?:         Record<string, unknown>
}): Promise<void> {
  try {
    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return
    await fetch(`${SB_URL}/rest/v1/rfq_events`, {
      method:  'POST',
      headers: { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        event_type:     e.event_type,
        case_id:        e.case_id        ?? null,
        rfq_request_id: e.rfq_request_id ?? null,
        dispatch_id:    e.dispatch_id    ?? null,
        quote_id:       e.quote_id       ?? null,
        insurer_name:   e.insurer_name   ?? null,
        actor:          e.actor          ?? 'system',
        summary:        e.summary         ?? null,
        detail:         e.detail          ?? {},
      }),
    })
  } catch {
    // Audit logging must never disrupt the calling flow.
  }
}
