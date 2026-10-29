/** GET /api/policies/[id]/members → { members, movements, transactions, weekly, position }; POST adds members from a list. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { errorResponse, fail, isUuid } from '@/lib/placement/api'
import { listMembers, listMovements, policyRow } from '@/lib/policies/members'
import { listTransactions } from '@/lib/policies/transactions'
import { listWeeks } from '@/lib/policies/position'
import { readSpreadsheet } from '@/lib/hr/spreadsheet'
import { sb } from '@/lib/crm/db'
import * as store from '@/lib/placement/store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Policy id is not valid')
  try {
    const policy = await policyRow(id)
    if (!policy) return fail('Policy not found', 404)
    const [members, movements, transactions, weekly] = await Promise.all([listMembers(id), listMovements(id), listTransactions(id), listWeeks(id)])
    const net_to_date = Math.round(transactions.reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100
    return NextResponse.json({
      members, movements, transactions, weekly,
      position: { pax_active: members.filter(m => m.status === 'active').length, net_to_date, last_week: weekly[0] ?? null },
    })
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * POST /api/policies/[id]/members (multipart: file) → { added, already, skipped }
 * The member list on a live policy from the client's or insurer's listing (Excel or CSV, any
 * layout the HR reader understands). Adds the people not on file; never removes anyone, so a
 * partial list cannot wipe the roster. Gives existing policies the baseline leavers are matched to.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Policy id is not valid')
  try {
    const policy = await policyRow(id)
    if (!policy?.company_id) return fail('Policy not found', 404)
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') return fail('Choose a file to upload')
    if (file.size > 10 * 1024 * 1024) return fail('Files up to 10 MB can be uploaded')
    const read = readSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name)
    const existing = await listMembers(id)
    const key = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '')
    const have = new Set(existing.filter(m => m.status === 'active').map(m => key(m.member_name)))
    const rows: Record<string, unknown>[] = []
    let already = 0
    const push = (name: string, relationship: string, dob: string | null, gender: string | null, category: string | null, ref: string | null, joined: string | null) => {
      if (!name.trim()) return
      if (have.has(key(name))) { already++; return }
      have.add(key(name))
      rows.push({ policy_id: id, company_id: policy.company_id, member_name: name.trim().slice(0, 200), relationship, dob, gender, category, employee_ref: ref, joined_on: joined, status: 'active', source: 'census' })
    }
    for (const e of read.employees.filter(e => e.status !== 'inactive')) {
      push(e.name, 'employee', e.dob, e.gender, e.category, e.key, e.hireDate)
      for (const d of read.dependants.filter(d => d.employeeKey === e.key)) push(d.name, d.relationship, d.dob, d.gender, e.category, null, null)
    }
    if (rows.length) await sb('policy_members', { method: 'POST', body: JSON.stringify(rows) })
    await store.log({ company_id: policy.company_id, kind: 'movement', actor: 'broker', text: `Member list uploaded for ${policy.policy_number ?? 'the policy'}: ${rows.length} added, ${already} already on file`, detail: { policy_id: id, filename: file.name } })
    return NextResponse.json({ added: rows.length, already, skipped: read.skipped.length }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
