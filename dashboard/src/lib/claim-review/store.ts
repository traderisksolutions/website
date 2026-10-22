/**
 * Claim second-opinion requests from corpcover.com: site_intakes rows with answers.form = claim-v1.
 * The report is saved on the row as answers.second_opinion, so no new table is needed while testing.
 */
import 'server-only'
import { enc, isUuid, sb } from '@/lib/sales/db'
import { listSites } from '@/lib/intake/store'
import type { ReportRun } from './analyse'

export type ClaimIntake = {
  id: string; status: string; contact_name: string | null; email: string | null; phone: string | null
  created_at: string; submitted_at: string | null; answers: Record<string, unknown> & { second_opinion?: ReportRun }
}

async function corpcoverId(): Promise<string | null> {
  return (await listSites()).find(s => s.key === 'corpcover')?.id ?? null
}

export async function listClaimIntakes(): Promise<ClaimIntake[]> {
  const site = await corpcoverId()
  if (!site) return []
  return sb<ClaimIntake[]>(`site_intakes?site_id=eq.${site}&answers->>form=eq.claim-v1&select=id,status,contact_name,email,phone,created_at,submitted_at,answers&order=created_at.desc&limit=200`)
}

export async function getClaimIntake(id: string): Promise<ClaimIntake | null> {
  if (!isUuid(id)) return null
  const site = await corpcoverId()
  if (!site) return null
  return (await sb<ClaimIntake[]>(`site_intakes?id=eq.${enc(id)}&site_id=eq.${site}&answers->>form=eq.claim-v1&select=id,status,contact_name,email,phone,created_at,submitted_at,answers&limit=1`))[0] ?? null
}

export async function saveReport(row: ClaimIntake, report: ReportRun): Promise<void> {
  await sb(`site_intakes?id=eq.${enc(row.id)}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: JSON.stringify({ answers: { ...row.answers, second_opinion: report }, updated_at: new Date().toISOString() }),
  })
}

/** The intake answers as plain lines for the model. */
export function intakeContext(row: ClaimIntake): string {
  const a = row.answers
  const pick = (k: string) => (a[k] == null || a[k] === '' ? null : `${k.replace(/_/g, ' ')}: ${Array.isArray(a[k]) ? (a[k] as unknown[]).join(', ') : String(a[k])}`)
  return [`policyholder: ${row.contact_name ?? ''}`, ...['market', 'plan', 'claim_type', 'claim_status', 'insurer', 'amount_claimed', 'decision_date', 'what_happened'].map(pick)].filter(Boolean).join('\n')
}
