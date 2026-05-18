import { useCallback } from 'react'

type LogPayload = {
  action:        string
  resource_type?: string
  resource_id?:  string
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
