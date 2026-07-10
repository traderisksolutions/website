// Friendly, human-readable labels for audit_log actions (#2).

const LABELS: Record<string, string> = {
  'nexus.case_renamed':        'renamed the case',
  'nexus.case_status_changed': 'changed the case status',
  'nexus.case_updated':        'updated the case',
  'nexus.analysis_run':        'ran the analysis',
  'nexus.analysis_edited':     'edited the analysis',
  'nexus.thread_linked':       'linked a thread',
  'nexus.thread_unlinked':     'unlinked a thread',
  'nexus.case_viewed':         'opened the case',
  'rfq.dispatched':            'sent an RFQ to an insurer',
  'rfq.bind':                  'bound a line',
  'rfq.lost':                  'marked a line lost',
  'contacts.bulk_import':      'bulk-imported contacts',
  'dev.shipped':              'shipped a change',
}

export function activityLabel(action: string): string {
  return LABELS[action] ?? action.replace(/^[a-z_]+\./, '').replace(/_/g, ' ')
}

// "just now" / "5m ago" / "3h ago" / "2d ago" / date.
export function relTime(iso: string): string {
  const d = new Date(iso).getTime()
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604_800) return `${Math.floor(s / 86_400)}d ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}
