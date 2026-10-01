'use client'

/**
 * Warns when an AI key has run out — of quota, or of credit.
 *
 * Deliberately not dismissible to a stored mark, the way the housekeeping banner is. That one
 * reports something that already happened and is over; this reports a condition that is still
 * true. Closing it hides it for this tab only, and it returns on the next load while the keys
 * are still failing — a warning you can permanently silence while it is still true is worse
 * than no warning.
 *
 * Severity follows the cause, not the noise: a spent quota usually refills on its own and is a
 * warning; billing stopped does not re-enable itself and is an error.
 */

import { useCallback, useEffect, useState } from 'react'
import { Alert, type AlertRow } from '@/components/ui/Alert'

type Affected = {
  agent: string
  label: string
  envKey: string | null
  kind: 'billing' | 'quota'
  failures: number
  since: string | null
  detail: string
}
type Payload = { ok: boolean; severity: 'ok' | 'warning' | 'error'; windowMinutes: number; affected: Affected[]; error?: string }

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : 'recently'

export function AiCreditsAlert() {
  const [d, setD] = useState<Payload | null>(null)
  const [hidden, setHidden] = useState(false)

  const load = useCallback(() => {
    fetch('/api/ai/status', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j && !j.error) setD(j as Payload) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    // While a key is down the state changes without anyone navigating, so re-check periodically.
    const t = setInterval(load, 5 * 60_000)
    return () => clearInterval(t)
  }, [load])

  if (!d || d.ok || hidden) return null

  const billing = d.affected.some(a => a.kind === 'billing')

  const rows: AlertRow[] = d.affected.map(a => ({
    summary: `${a.label} — ${a.failures} failure${a.failures === 1 ? '' : 's'} since ${when(a.since)}`,
    detail: [
      a.kind === 'billing'
        ? 'Billing stopped. Nothing on this key will work until it is restored.'
        : 'Quota spent. This usually clears on its own when the window resets.',
      a.envKey ? `Key: ${a.envKey}` : 'Key: one of the shared keys',
      a.detail || 'No further detail was returned.',
    ].filter(Boolean),
  }))

  return (
    <div className="px-4 pt-4 sm:px-6">
      <Alert
        variant={billing ? 'error' : 'warning'}
        title={billing ? 'An AI key has no credit' : 'An AI key is out of quota'}
        rows={rows}
        onDismiss={() => setHidden(true)}
        dataAttr="data-ai-credits-alert"
        actionLabel="See AI spend"
        actionHref="/analytics/ai-usage"
      >
        {billing
          ? 'Drafting and answers on the affected agent will fail until billing is restored. Mail still arrives and is still filed.'
          : `No successful call on the affected agent in the last ${d.windowMinutes} minutes. Mail still arrives and is still filed.`}
      </Alert>
    </div>
  )
}
