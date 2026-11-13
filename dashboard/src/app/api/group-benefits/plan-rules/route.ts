/**
 * GET → { rules, updatedBy, updatedAt, plans }: the plan rules (src/lib/gb/plan-pairs.ts) and the
 *   plans each product sells per cover, from the house workbook, so Plan rules can show the pairs.
 * PUT { rules } → saves them. Compare cover applies them from its next load.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cleanRules, loadRules, saveRules } from '@/lib/gb/plan-pairs'
import { COVERS, PRODUCTS, loadWorkbook } from '@/lib/gb/workbook'
import { logActivity } from '@/lib/log-activity'

async function who() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  if (!await who()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const [stored, wb] = await Promise.all([loadRules(), loadWorkbook()])
  const plans: Record<string, Record<string, string[]>> = {}
  for (const p of PRODUCTS) { plans[p] = {}; for (const c of COVERS) plans[p][c] = (wb?.lists[p]?.[c] ?? []).filter(x => !/FW|WP\/S Pass|WP\/SP/i.test(x)) }
  return NextResponse.json({ ...stored, plans, products: PRODUCTS, covers: COVERS })
}

export async function PUT(req: NextRequest) {
  const user = await who()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const body = await req.json().catch(() => null) as { rules?: unknown } | null
  const rules = cleanRules(body?.rules, PRODUCTS, COVERS)
  if (!rules) return NextResponse.json({ error: 'Each rule needs an insurer, a cover and a different cover it goes with; one rule per insurer and cover.' }, { status: 400 })
  const before = await loadRules()
  const saved = await saveRules(rules, user.email ?? null)
  void logActivity({ action: 'gb.plan_rules_saved', resource_type: 'app_settings', resource_id: 'gb_plan_rules', old_value: { rules: before.rules }, new_value: { rules }, metadata: { by: user.email ?? null } })
  return NextResponse.json(saved)
}
