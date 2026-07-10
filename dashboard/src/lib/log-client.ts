/**
 * Fire-and-forget client-side activity logger (#2). Records a button press /
 * interaction as the current user via POST /api/activity. Never throws, never
 * blocks the UI. Use for meaningful interactions:
 *   logClient('nexus.analysis_run', { resource_type: 'case', resource_id: caseId })
 */
export function logClient(
  action: string,
  opts?: { resource_type?: string; resource_id?: string; metadata?: Record<string, unknown> },
): void {
  try {
    void fetch('/api/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...opts }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* never disrupt the UI */ }
}
