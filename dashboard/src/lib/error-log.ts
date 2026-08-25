const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

export interface ErrorLogEntry {
  source:        string                       // 'gemini' | 'anthropic' | 'roadplus' | 'supabase' | ...
  feature?:      string                       // e.g. 'draft_reply_drafter' — matches gemini-usage.ts features where applicable
  statusCode?:   number
  message:       string                       // full error text — never truncate before logging
  threadId?:     string | null
  resourceType?: string | null
  resourceId?:   string | null
  metadata?:     Record<string, unknown> | null
}

/**
 * Fire-and-forget log for background/API failures — the system-side counterpart to useAuditLog
 * (which records user actions). Written directly from server code with the service key, since
 * these happen server-side with no user session to attach. Never throws — logging must never
 * break the flow it's observing.
 */
export async function logError(e: ErrorLogEntry): Promise<void> {
  try {
    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return
    await fetch(`${SB_URL}/rest/v1/error_logs`, {
      method:  'POST',
      headers: { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        source:        e.source,
        feature:       e.feature      ?? null,
        status_code:   e.statusCode   ?? null,
        message:       e.message,
        thread_id:     e.threadId     ?? null,
        resource_type: e.resourceType ?? null,
        resource_id:   e.resourceId   ?? null,
        metadata:      e.metadata ?? null,
      }),
    })
  } catch {
    // Non-fatal
  }
}
