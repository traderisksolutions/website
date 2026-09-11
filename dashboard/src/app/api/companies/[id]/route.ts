/**
 * GET   /api/companies/[id]  → the company, its contacts, policies, debit notes (with derived
 *                              payment status) and a summary block for the workspace header.
 * PATCH /api/companies/[id]  → { stage?, owner_email?, domains?, notes?, industry?, address?, kind? }
 *                              Stage changes are written to the audit log so the timeline shows them.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { logActivity }               from '@/lib/log-activity'
import { getCompany, sb, sbTry, enc, getCompanyContactIds, PUBLIC_EMAIL_DOMAINS } from '@/lib/crm/db'
import { loadCompanyPayments }       from '@/lib/crm/payments-server'
import { isStage }                   from '@/lib/crm/stage'
import { COMPANY_KINDS }             from '@/lib/crm/types'
import { personName }                from '@/lib/crm/format'

const round2 = (n: number) => Math.round(n * 100) / 100

type ContactRow = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }
type CustomerRow = { id: string; status: string | null; policies: PolicyRow[] | null }
type PolicyRow = { id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null; broker: string | null; currency: string | null; premium: number | null; start_date: string | null; end_date: string | null; status: string | null }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const company = await getCompany(id)
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const contactIds = await getCompanyContactIds(id)
    const [contacts, customers, payments] = await Promise.all([
      contactIds.length ? sbTry<ContactRow[]>(`contacts?id=in.(${contactIds.join(',')})&select=id,first_name,last_name,email,phone&order=first_name.asc.nullslast`, []) : Promise.resolve([] as ContactRow[]),
      sbTry<CustomerRow[]>(`customers?company_id=eq.${enc(id)}&select=id,status,policies(id,policy_number,insurer,class_of_insurance,broker,currency,premium,start_date,end_date,status)`, []),
      loadCompanyPayments(id),
    ])
    const rawPolicies = customers.flatMap(c => c.policies ?? []).sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''))
    const activeEnds = rawPolicies.filter(p => p.status === 'active' && p.end_date).map(p => p.end_date as string).sort()

    // `policies.premium` has never been populated by any import — the money lives on the debit
    // notes, which carry a policy_id. Roll them up so every row shows what was actually billed
    // and what TRS earned, instead of a column of dashes.
    const byPolicy = new Map<string, { billed: number; commission: number; currency: string; notes: number }>()
    for (const d of payments.notes) {
      if (!d.policy_id) continue
      const cur = byPolicy.get(d.policy_id) ?? { billed: 0, commission: 0, currency: d.currency, notes: 0 }
      cur.billed = round2(cur.billed + Number(d.net_amount ?? d.gross_amount ?? 0))
      cur.commission = round2(cur.commission + Number(d.commission ?? 0))
      cur.notes += 1
      byPolicy.set(d.policy_id, cur)
    }
    const policies = rawPolicies.map(p => {
      const m = byPolicy.get(p.id)
      return {
        ...p,
        premium: p.premium ?? m?.billed ?? null,
        premiumSource: p.premium != null ? 'policy' : m ? 'debit_notes' : null,
        commission: m?.commission ?? null,
        debitNoteCount: m?.notes ?? 0,
        currency: p.currency ?? m?.currency ?? 'SGD',
      }
    })

    // What this client is worth: everything ever billed through TRS and what TRS earned on it.
    const value = new Map<string, { currency: string; billed: number; commission: number; notes: number }>()
    for (const d of payments.notes) {
      const cur = value.get(d.currency) ?? { currency: d.currency, billed: 0, commission: 0, notes: 0 }
      cur.billed = round2(cur.billed + Number(d.net_amount ?? d.gross_amount ?? 0))
      cur.commission = round2(cur.commission + Number(d.commission ?? 0))
      cur.notes += 1
      value.set(d.currency, cur)
    }
    const issueDates = payments.notes.map(d => d.issue_date).filter(Boolean).sort()

    return NextResponse.json({
      company,
      // `contacts` keeps the junction-row shape ({ contacts: {...} }) that CompanyContactPicker and
      // the legacy Contacts → Companies tab still read; `contactList` is the flat shape the
      // company workspace uses.
      contacts: contacts.map(c => ({ id: `direct-${c.id}`, role: 'stakeholder', is_primary: false, contacts: c })),
      contactList: contacts.map(c => ({ ...c, name: personName(c.first_name, c.last_name, c.email) })),
      policies,
      payments: payments.notes,
      debitNotes: payments.notes,
      paymentSummary: payments.summary,
      value: {
        byCurrency: Array.from(value.values()).sort((a, b) => (a.currency === 'SGD' ? -1 : b.currency === 'SGD' ? 1 : a.currency.localeCompare(b.currency))),
        policyCount: policies.length,
        activePolicies: policies.filter(p => p.status === 'active').length,
        firstBilled: issueDates[0] ?? null,
        lastBilled: issueDates[issueDates.length - 1] ?? null,
      },
      summary: {
        contactCount: contacts.length,
        activePolicies: policies.filter(p => p.status === 'active').length,
        nextRenewalDate: activeEnds[0] ?? null,
        openDebitNoteCount: payments.summary.openCount,
        overdueCount: payments.summary.overdueCount,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const body = await req.json() as Record<string, unknown>
    const before = await getCompany(id)
    if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.notes === 'string')    patch.notes = body.notes
    if (typeof body.industry === 'string') patch.industry = body.industry.trim() || null
    if (typeof body.address === 'string')  patch.address = body.address.trim() || null
    if (typeof body.name === 'string' && body.name.trim()) patch.company_name = body.name.trim()
    if (body.owner_email === null || typeof body.owner_email === 'string') patch.owner_email = typeof body.owner_email === 'string' ? body.owner_email.trim().toLowerCase() || null : null
    if (typeof body.kind === 'string' && (COMPANY_KINDS as readonly string[]).includes(body.kind)) patch.kind = body.kind
    if (Array.isArray(body.domains)) {
      const domains = Array.from(new Set(body.domains.map(d => String(d).trim().toLowerCase().replace(/^@/, '')).filter(d => d.includes('.') && !PUBLIC_EMAIL_DOMAINS.has(d))))
      patch.domains = domains
      patch.domain  = domains[0] ?? null
    }
    let stageChanged = false
    if (body.stage !== undefined) {
      if (!isStage(body.stage)) return NextResponse.json({ error: 'invalid stage' }, { status: 400 })
      if (body.stage !== before.stage) { patch.stage = body.stage; patch.stage_changed_at = new Date().toISOString(); stageChanged = true }
    }
    if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

    await sb(`companies?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
    if (stageChanged) void logActivity({ action: 'company.stage', resource_type: 'company', resource_id: id, old_value: { stage: before.stage }, new_value: { stage: patch.stage } })
    else void logActivity({ action: 'company.updated', resource_type: 'company', resource_id: id, new_value: patch })

    const after = await getCompany(id)
    return NextResponse.json({ ok: true, company: after })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
