// Apollo credit budget — the only metering that exists in this codebase (there was none
// before). Tracks spend against a monthly cap so the automated daily discovery cron
// (api/cron/daily-lead-discovery) can never silently blow through Apollo's free tier.
//
// IMPORTANT CAVEAT: this is a SELF-IMPOSED estimate, not a mirror of Apollo's real account
// balance. apollo-search reports a real `creditsUsed` count (orgs enriched), but
// apollo-people/apollo-email don't return credit counts from Apollo's API, so their spend is
// approximated here at 1 unit per person/email as a conservative proxy. Check your actual
// Apollo dashboard periodically, especially early on, until you trust this estimate.
import { SB_URL, sbHeaders } from '@/lib/sb'
import { getAppSetting } from '@/lib/app-settings'

const DEFAULT_MONTHLY_CAP = 75 // Apollo's free-tier org-enrich credit allowance

function currentMonthKey(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function getMonthlyCap(): Promise<number> {
  const raw = await getAppSetting('apollo_monthly_credit_cap', String(DEFAULT_MONTHLY_CAP))
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_CAP
}

export async function getUsedThisMonth(): Promise<number> {
  const month = currentMonthKey()
  const res = await fetch(
    `${SB_URL}/rest/v1/ob_apollo_credit_usage?month=eq.${month}&select=credits_used&limit=1`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const rows: { credits_used: number }[] = res.ok ? await res.json() : []
  return rows[0]?.credits_used ?? 0
}

export async function getRemainingBudget(): Promise<number> {
  const [cap, used] = await Promise.all([getMonthlyCap(), getUsedThisMonth()])
  return Math.max(0, cap - used)
}

// Upsert-increment. PostgREST has no atomic increment over REST, so this reads-then-writes —
// acceptable here since this cron runs once/day, not under concurrent load.
export async function recordUsage(credits: number): Promise<void> {
  if (credits <= 0) return
  const month = currentMonthKey()
  const used  = await getUsedThisMonth()
  await fetch(`${SB_URL}/rest/v1/ob_apollo_credit_usage?on_conflict=month`, {
    method:  'POST',
    headers: sbHeaders('resolution=merge-duplicates,return=minimal'),
    body:    JSON.stringify({ month, credits_used: used + credits, updated_at: new Date().toISOString() }),
  })
}
