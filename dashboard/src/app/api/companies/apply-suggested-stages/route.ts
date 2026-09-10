/**
 * POST /api/companies/apply-suggested-stages   { dryRun?: boolean; ids?: string[] }
 *
 * Moves every company whose facts disagree with its recorded stage onto the suggested one.
 * The suggestion is recomputed here rather than trusted from the client. A dry run returns
 * exactly what would change so the UI can say so before anything moves. Each change is
 * audit-logged, so the company timeline shows who applied it and when.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { listCompanySummaries }      from '@/lib/crm/aggregates'
import { sb, enc }                   from '@/lib/crm/db'
import { logActivity }               from '@/lib/log-activity'
import { STAGE_LABEL }               from '@/lib/crm/types'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { dryRun, ids } = await req.json().catch(() => ({})) as { dryRun?: boolean; ids?: string[] }
    const only = ids?.length ? new Set(ids) : null

    const rows = await listCompanySummaries()
    const changes = rows
      .filter(r => r.suggestedStage && (!only || only.has(r.id)))
      .map(r => ({ id: r.id, name: r.name, from: r.stage, to: r.suggestedStage!, fromLabel: STAGE_LABEL[r.stage], toLabel: STAGE_LABEL[r.suggestedStage!] }))

    if (dryRun) return NextResponse.json({ changes, applied: 0 })

    const now = new Date().toISOString()
    let applied = 0
    for (const c of changes) {
      try {
        await sb(`companies?id=eq.${enc(c.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ stage: c.to, stage_changed_at: now, updated_at: now }) })
        void logActivity({ action: 'company.stage', resource_type: 'company', resource_id: c.id, old_value: { stage: c.from }, new_value: { stage: c.to, applied_from_suggestion: true } })
        applied++
      } catch { /* skip this one, keep going */ }
    }
    return NextResponse.json({ changes, applied })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
