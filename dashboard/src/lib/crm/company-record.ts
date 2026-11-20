/**
 * The company record (21 Nov 2026): what the pickers, dialogs and panels read about one company,
 * and the edits they make. Moved from /api/companies/[id] for the companyDetail and updateCompany
 * actions (src/app/companies/actions.ts).
 */
import { logActivity } from '@/lib/log-activity'
import { getCompany, sbTry, enc, getCompanyContactIds, PUBLIC_EMAIL_DOMAINS } from '@/lib/crm/db'
import { db } from '@/lib/db/client'
import { loadCompanyPayments } from '@/lib/crm/payments-server'
import { isStage } from '@/lib/crm/stage'
import { COMPANY_KINDS } from '@/lib/crm/types'
import { personName } from '@/lib/format'

const round2 = (n: number) => Math.round(n * 100) / 100

type ContactRow = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }
type CustomerRow = { id: string; status: string | null; policies: PolicyRow[] | null }
type PolicyRow = { id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null; broker: string | null; currency: string | null; premium: number | null; start_date: string | null; end_date: string | null; status: string | null }

/** The company with its contacts, policies (billed figures from the debit notes), payments and value. */
export async function loadCompanyDetail(id: string) {
  const company = await getCompany(id)
  if (!company) throw new Error('Not found')

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
      premiumSource: (p.premium != null ? 'policy' : m ? 'debit_notes' : null) as 'policy' | 'debit_notes' | null,
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

  return {
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
  }
}

export type CompanyEdit = Record<string, unknown>

/** Applies the edits a person made; `viewer` is recorded on a confirm or a pin. */
export async function updateCompanyRecord(id: string, body: CompanyEdit, viewer: string) {
  const before = await getCompany(id)
  if (!before) throw new Error('Not found')

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.notes === 'string')    patch.notes = body.notes
  if (typeof body.industry === 'string') patch.industry = body.industry.trim() || null
  if (typeof body.address === 'string')  patch.address = body.address.trim() || null
  if (typeof body.name === 'string' && body.name.trim()) patch.company_name = body.name.trim()
  // Owners: one or many. `owner_emails` is the list; `owner_email` mirrors its first entry so
  // every older read keeps working. A single owner_email still sets the list.
  if (Array.isArray(body.owner_emails)) {
    const list = Array.from(new Set(body.owner_emails.map(e => String(e).trim().toLowerCase()).filter(Boolean)))
    patch.owner_emails = list; patch.owner_email = list[0] ?? null
  } else if (body.owner_email === null || typeof body.owner_email === 'string') {
    const one = typeof body.owner_email === 'string' ? body.owner_email.trim().toLowerCase() || null : null
    patch.owner_email = one; patch.owner_emails = one ? [one] : []
  }
  if (typeof body.kind === 'string' && (COMPANY_KINDS as readonly string[]).includes(body.kind)) patch.kind = body.kind
  if (Array.isArray(body.domains)) {
    const domains = Array.from(new Set(body.domains.map(d => String(d).trim().toLowerCase().replace(/^@/, '')).filter(d => d.includes('.') && !PUBLIC_EMAIL_DOMAINS.has(d))))
    patch.domains = domains
    patch.domain  = domains[0] ?? null
  }
  // A person has looked at a record the mail filing created on its own.
  if (body.confirmed === true) {
    patch.confirmed_at = new Date().toISOString()
    patch.confirmed_by = viewer
  }
  // Pin to Home, or take it off. Who pinned is kept so the card can say so.
  if (body.pinned === true)  { patch.home_pinned_at = new Date().toISOString(); patch.home_pinned_by = viewer }
  if (body.pinned === false) { patch.home_pinned_at = null; patch.home_pinned_by = null }
  let stageChanged = false
  if (body.stage !== undefined) {
    if (!isStage(body.stage)) throw new Error('invalid stage')
    if (body.stage !== before.stage) { patch.stage = body.stage; patch.stage_changed_at = new Date().toISOString(); stageChanged = true }
  }
  if (Object.keys(patch).length === 1) throw new Error('nothing to update')
  const { error } = await db().from('companies').update(patch as never).eq('id', id)
  if (error) throw new Error(error.message)
  if (stageChanged) void logActivity({ action: 'company.stage', resource_type: 'company', resource_id: id, old_value: { stage: before.stage }, new_value: { stage: patch.stage } })
  else void logActivity({ action: 'company.updated', resource_type: 'company', resource_id: id, new_value: patch })
  const company = await getCompany(id)
  if (!company) throw new Error('Not found')
  return { ok: true as const, company }
}
