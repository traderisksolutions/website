/**
 * GET   /api/policies/[id] → policy + its company, so a deep link (e.g. Calendar's
 *       "Generate Debit Note" quick action) can preselect both the policy and its client.
 * PATCH /api/policies/[id] { lifecycle?, policy_number?, start_date?, end_date?, label?, insurer? } → { ok }
 *       lifecycle 'live' takes the number and term with it (markPolicyLive); any other lifecycle
 *       is set as given; the fields alone patch the row.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { markPolicyLive, setLifecycle } from '@/lib/policies/spine'
import { isPolicyLifecycle, POLICY_LIFECYCLES } from '@/lib/policies/types'
import { errorResponse, fail, gate, isDate, isUuid, readBody } from '@/lib/placement/api'
import * as store from '@/lib/placement/store'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const res = await fetch(`${SB_URL}/rest/v1/policies?id=eq.${id}&select=*,customers(company_id,companies(id,name:company_name))&limit=1`, { headers: sbH(), cache: 'no-store' })
    const row = res.ok ? (await res.json())[0] : null
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      ...row,
      companyId: row.customers?.companies?.id ?? null,
      companyName: row.customers?.companies?.name ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

type PatchBody = { lifecycle?: unknown; policy_number?: unknown; start_date?: unknown; end_date?: unknown; label?: unknown; insurer?: unknown }

const optText = (v: unknown, name: string): { value: string | null } | { error: string } => {
  if (v === undefined) return { value: null }
  if (v !== null && typeof v !== 'string') return { error: `${name} must be text` }
  return { value: typeof v === 'string' && v.trim() ? v.trim() : null }
}
const optDate = (v: unknown, name: string): { value: string | null } | { error: string } => {
  if (v === undefined || v === null || v === '') return { value: null }
  if (!isDate(v)) return { error: `${name} must be YYYY-MM-DD` }
  return { value: v }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Policy id is not valid')
  const b = await readBody<PatchBody>(req)
  if (!b) return fail('Body must be a JSON object')

  if (b.lifecycle !== undefined && !isPolicyLifecycle(b.lifecycle)) return fail(`lifecycle must be one of ${POLICY_LIFECYCLES.join(', ')}`)
  const policyNumber = optText(b.policy_number, 'policy_number')
  const label = optText(b.label, 'label')
  const insurer = optText(b.insurer, 'insurer')
  const startDate = optDate(b.start_date, 'start_date')
  const endDate = optDate(b.end_date, 'end_date')
  for (const r of [policyNumber, label, insurer, startDate, endDate]) if ('error' in r) return fail(r.error)
  if ('value' in startDate && 'value' in endDate && startDate.value && endDate.value && endDate.value < startDate.value) return fail('end_date must not be before start_date')

  const fields: Record<string, unknown> = {}
  if ('value' in policyNumber && b.policy_number !== undefined && b.lifecycle !== 'live') fields.policy_number = policyNumber.value
  if ('value' in label && b.label !== undefined) fields.label = label.value
  if ('value' in insurer && b.insurer !== undefined && b.lifecycle !== 'live') fields.insurer = insurer.value
  if ('value' in startDate && b.start_date !== undefined && b.lifecycle !== 'live') fields.start_date = startDate.value
  if ('value' in endDate && b.end_date !== undefined && b.lifecycle !== 'live') fields.end_date = endDate.value
  if (Object.keys(fields).length === 0 && b.lifecycle === undefined) return fail('Nothing to change')

  try {
    if (Object.keys(fields).length) {
      const rows = await store.patchNoTs<{ id: string }[]>('policies', `id=eq.${id}`, { ...fields, updated_at: new Date().toISOString() })
      if (rows.length === 0) return fail('Policy not found', 404)
    }
    if (b.lifecycle === 'live') {
      await markPolicyLive(id, {
        policy_number: 'value' in policyNumber ? policyNumber.value : null,
        start_date: 'value' in startDate ? startDate.value : null,
        end_date: 'value' in endDate ? endDate.value : null,
        insurer: 'value' in insurer ? insurer.value : null,
      }, actor)
    } else if (isPolicyLifecycle(b.lifecycle)) {
      await setLifecycle(id, b.lifecycle, actor)
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/policies_policy_number_key|duplicate key/i.test(msg)) return fail('That policy number is already on another policy', 409)
    return errorResponse(e)
  }
}
