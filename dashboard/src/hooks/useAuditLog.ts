import { useCallback } from 'react'

export type LogPayload = {
  action:        string
  resource_type?: string
  resource_id?:  string
  lead_email?:   string
  old_value?:    Record<string, unknown>
  new_value?:    Record<string, unknown>
  metadata?:     Record<string, unknown>
}

// Fire-and-forget audit logger. Never throws — logging must never break the UI.
export function useAuditLog() {
  return useCallback((payload: LogPayload) => {
    fetch('/api/audit-log', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }).catch(() => { /* silent — logging must not disrupt UX */ })
  }, [])
}
