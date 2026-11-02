'use client'

/**
 * Warns when a Gemini key has run out — of credit, or of quota.
 *
 * Deliberately not dismissible to a stored mark, the way the housekeeping banner is. That one
 * reports something that already happened and is over; this reports a condition that is still
 * true. Closing it hides it for this tab only, and it returns on the next load while the keys
 * are still failing — a warning you can permanently silence while it is still true is worse
 * than no warning.
 *
 * Severity follows the cause, not the noise: a spent quota usually refills on its own and is a
 * warning; billing stopped does not re-enable itself and is an error.
 *
 * Three lines, each one thing the reader needs: what to do, what is affected, what happens next.
 * The per-agent breakdown lives on the spend page; here it would only add rows to a page the
 * reader came to for something else.
 */

import { useCallback, useEffect, useState } from 'react'
import { Alert, type AlertRow } from '@/components/ui/Alert'

type Affected = {
  agent: string
  label: string
  envKey: string | null
  kind: 'billing' | 'quota' | 'cap'
  failures: number
  since: string | null
  detail: string
}
type Payload = { ok: boolean; severity: 'ok' | 'warning' | 'error'; windowMinutes: number; affected: Affected[]; cap_usd?: number | null; error?: string }

const BILLING_URL = 'https://aistudio.google.com/billing'

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : 'recently'

/** "Housekeeping and Placement", "Housekeeping, Placement and Ask AI". */
const names = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

const buyLink = (
  <a href={BILLING_URL} target="_blank" rel="noreferrer"
     className="underline decoration-[var(--trs-line-2)] underline-offset-[3px] hover:decoration-[var(--trs-ink)]"
     style={{ color: 'var(--trs-ink)' }}>
    Buy credits in Google AI Studio
  </a>
)

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
  const capped = !billing && d.affected.some(a => a.kind === 'cap')
  const failures = d.affected.reduce((n, a) => n + a.failures, 0)
  const earliest = d.affected.map(a => a.since).filter((s): s is string => !!s).sort()[0] ?? null
  const affected = names(d.affected.map(a => a.label))
  const impact = `${affected}: ${failures} call${failures === 1 ? '' : 's'} failed since ${when(earliest)}. Mail still arrives and is filed. Drafts and answers wait.`

  const rows: AlertRow[] = capped
    ? [
        { summary: `Today's AI spend reached the cap of US$${d.cap_usd ?? ''}. Reading and drafting resume tomorrow; mail still arrives and is filed.`, detail: [] },
        { summary: impact, detail: [] },
        { summary: 'To continue today, raise AI_DAILY_CAP_USD on Vercel and redeploy.', detail: [] },
      ]
    : billing
    ? [
        { summary: <>{buyLink}. Credit applies within a minute.</>, detail: [] },
        { summary: impact, detail: [] },
        { summary: 'This notice clears on its own after the next successful call. Nothing to restart.', detail: [] },
      ]
    : [
        { summary: 'No action yet. Quota refills on its own, usually within the hour.', detail: [] },
        { summary: impact, detail: [] },
        { summary: <>Still here after an hour: {buyLink}.</>, detail: [] },
      ]

  return (
    <div className="px-4 pt-4 sm:px-6">
      <Alert
        variant={billing ? 'error' : 'warning'}
        title={capped ? 'Daily AI spend cap reached' : billing ? 'Gemini credit has run out' : 'Gemini quota is spent'}
        rows={rows}
        onDismiss={() => setHidden(true)}
        dataAttr="data-ai-credits-alert"
        actionLabel="AI spend"
        actionHref="/analytics/ai-usage"
      />
    </div>
  )
}
