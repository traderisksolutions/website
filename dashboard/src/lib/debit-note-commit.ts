/**
 * Single commit path for turning a (company, contact, policy, debit-note) tuple into rows —
 * used identically by the manual "Generate Debit Note" form and the PDF-import "Approve"
 * action, so there is exactly one place that decides how companies/contacts/policies get
 * resolved-or-created. Follows the rest of the codebase's convention: auth is checked by the
 * caller (API route), this module talks to Supabase via service-key REST-over-fetch.
 */
import { SB_URL, sbH } from '@/lib/debit-note-storage'
import { logActivity }  from '@/lib/log-activity'

type Json = Record<string, unknown>

async function pg(path: string, init?: RequestInit): Promise<Json[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...sbH(), ...(init?.headers as Record<string, string> ?? {}) },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Supabase ${path} failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const text = await res.text()
  return text ? JSON.parse(text) : []
}

const enc = (s: string) => encodeURIComponent(s)

// ── Company ──────────────────────────────────────────────────────────────────────────────────
export type CompanyInput =
  | { companyId: string }
  | { companyName: string; address?: string | null; type?: 'institution' | 'sme' | 'corporate' | null }

export async function resolveCompany(input: CompanyInput): Promise<string> {
  if ('companyId' in input) return input.companyId
  const name = input.companyName.trim()
  // NB: the live companies table's name column is "company_name", not "name" (full_schema.sql's
  // dump was stale on this table).
  const existing = await pg(`companies?company_name=ilike.${enc(name)}&select=id&limit=1`)
  if (existing[0]) return existing[0].id as string
  const created = await pg('companies', {
    method: 'POST',
    body: JSON.stringify({ company_name: name, address: input.address ?? null, type: input.type ?? null }),
  })
  return created[0].id as string
}

// ── Contact (person) ────────────────────────────────────────────────────────────────────────
export type ContactInput =
  | { contactId: string }
  | { email: string; name?: string | null; phone?: string | null; role?: 'decision_maker' | 'cc' | 'stakeholder' | 'billing' }
  | null

export async function resolveContact(input: ContactInput): Promise<string | null> {
  if (input === null) return null
  if ('contactId' in input) return input.contactId
  const email = input.email.trim().toLowerCase()
  const existing = await pg(`contacts?email=ilike.${enc(email)}&select=id&limit=1`)
  if (existing[0]) return existing[0].id as string
  const [first_name, ...rest] = (input.name ?? '').trim().split(/\s+/).filter(Boolean)
  const created = await pg('contacts', {
    method: 'POST',
    body: JSON.stringify({
      email, first_name: first_name || null, last_name: rest.join(' ') || null,
      phone: input.phone?.trim() || null, source: 'manual',
    }),
  })
  return created[0].id as string
}

/** Links a contact to a company (many-to-many — a person can be a contact at more than one
 *  company). Idempotent; the first contact linked to a company becomes its primary. */
export async function linkCompanyContact(companyId: string, contactId: string, role: string): Promise<void> {
  const existing = await pg(`company_contacts?company_id=eq.${companyId}&contact_id=eq.${contactId}&select=id&limit=1`)
  if (existing[0]) return
  const hasPrimary = await pg(`company_contacts?company_id=eq.${companyId}&is_primary=eq.true&select=id&limit=1`)
  await pg('company_contacts', {
    method: 'POST',
    body: JSON.stringify({ company_id: companyId, contact_id: contactId, role, is_primary: hasPrimary.length === 0 }),
  })
}

// ── Customer (the companies→customers→policies chain the schema already models) ───────────────
async function resolveCustomer(companyId: string, contactId: string | null): Promise<string> {
  const existing = await pg(`customers?company_id=eq.${companyId}&type=eq.company&select=id,contact_id&limit=1`)
  if (existing[0]) {
    if (contactId && !existing[0].contact_id) {
      await pg(`customers?id=eq.${existing[0].id}`, { method: 'PATCH', body: JSON.stringify({ contact_id: contactId }) })
    }
    return existing[0].id as string
  }
  const created = await pg('customers', {
    method: 'POST',
    body: JSON.stringify({ type: 'company', company_id: companyId, contact_id: contactId, status: 'active' }),
  })
  return created[0].id as string
}

// ── Policy ──────────────────────────────────────────────────────────────────────────────────
export type PolicyInput =
  | { policyId: string }
  | {
      policyNumber?: string | null
      insurer: string
      productType?: string | null
      classOfInsurance?: string | null
      coverNoteNo?: string | null
      description?: string | null
      broker?: string | null
      currency?: string
      sumInsured?: number | null
      premium?: number | null
      startDate?: string | null
      endDate?: string | null
      source: 'manual' | 'pdf_import'
    }

async function resolvePolicy(input: PolicyInput, customerId: string): Promise<string> {
  if ('policyId' in input) return input.policyId
  const created = await pg('policies', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: customerId,
      policy_number: input.policyNumber ?? null,
      insurer: input.insurer,
      product_type: input.productType ?? null,
      class_of_insurance: input.classOfInsurance ?? null,
      cover_note_no: input.coverNoteNo ?? null,
      description: input.description ?? null,
      broker: input.broker ?? null,
      currency: input.currency ?? 'SGD',
      sum_insured: input.sumInsured ?? null,
      premium: input.premium ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      status: 'active',
      source: input.source,
    }),
  })
  return created[0].id as string
}

// ── Debit note number: DN + issue date (YYMMDD), -2/-3… suffix on same-day collision ───────────
export function debitNoteNumberBase(issueDateISO: string): string {
  const d  = new Date(issueDateISO)
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `DN${yy}${mm}${dd}`
}

/** Pure: picks the first free number given the base and the set of numbers already in use
 *  (matching the same `DN<yymmdd>` prefix) — no I/O, so it's directly unit-testable. */
export function pickFreeDebitNoteNumber(base: string, existingNumbers: string[]): string {
  const used = new Set(existingNumbers)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export async function generateDebitNoteNumber(issueDateISO: string): Promise<string> {
  const base = debitNoteNumberBase(issueDateISO)
  const existing = await pg(`debit_notes?debit_note_no=like.${enc(base)}*&select=debit_note_no`)
  return pickFreeDebitNoteNumber(base, existing.map(r => r.debit_note_no as string))
}

// ── Top-level commit ────────────────────────────────────────────────────────────────────────
export type LineItem = { description: string; amount: number }

export type DebitNoteInput = {
  currency:           string
  lineItems:          LineItem[]
  gstAmount?:         number | null
  feeRebate?:         number | null
  commission?:        number | null
  issueDate:          string
  paymentDueDate?:    string | null
  insurer?:           string | null
  status?:            'unpaid' | 'partially_paid' | 'paid'
  paidAmount?:        number | null
  paidDirectAmount?:  number | null
  source:             'manual' | 'pdf_import'
}

export interface CommitResult {
  companyId:    string
  contactId:    string | null
  policyId:     string
  debitNoteId:  string
  debitNoteNo:  string
  grossAmount:  number
}

export async function commitDebitNote(input: {
  company:   CompanyInput
  contact:   ContactInput
  policy:    PolicyInput
  debitNote: DebitNoteInput
}): Promise<CommitResult> {
  const companyId = await resolveCompany(input.company)
  const contactId = await resolveContact(input.contact)
  if (contactId) {
    const role = (input.contact && 'email' in input.contact && input.contact.role) || 'billing'
    await linkCompanyContact(companyId, contactId, role)
  }

  const customerId = await resolveCustomer(companyId, contactId)
  const policyId    = await resolvePolicy(input.policy, customerId)

  const grossAmount   = input.debitNote.lineItems.reduce((s, l) => s + l.amount, 0) + (input.debitNote.gstAmount ?? 0)
  const debitNoteNo   = await generateDebitNoteNumber(input.debitNote.issueDate)

  const created = await pg('debit_notes', {
    method: 'POST',
    body: JSON.stringify({
      policy_id: policyId, company_id: companyId, contact_id: contactId,
      debit_note_no: debitNoteNo,
      issue_date: input.debitNote.issueDate,
      payment_due_date: input.debitNote.paymentDueDate ?? null,
      currency: input.debitNote.currency,
      line_items: input.debitNote.lineItems,
      gst_amount: input.debitNote.gstAmount ?? 0,
      gross_amount: grossAmount,
      fee_rebate: input.debitNote.feeRebate ?? 0,
      commission: input.debitNote.commission ?? null,
      paid_amount: input.debitNote.paidAmount ?? 0,
      paid_direct_amount: input.debitNote.paidDirectAmount ?? 0,
      status: input.debitNote.status ?? 'unpaid',
      insurer: input.debitNote.insurer ?? null,
      source: input.debitNote.source,
    }),
  })
  const debitNoteId = created[0].id as string

  void logActivity({
    action: 'debit_note.created', resource_type: 'debit_note', resource_id: debitNoteId,
    new_value: { debit_note_no: debitNoteNo, company_id: companyId, gross_amount: grossAmount, source: input.debitNote.source },
  })

  return { companyId, contactId, policyId, debitNoteId, debitNoteNo, grossAmount }
}

/** Attaches the generated PDF's storage path to an already-committed debit note. */
export async function attachDebitNotePdf(debitNoteId: string, pdfStoragePath: string): Promise<void> {
  await pg(`debit_notes?id=eq.${debitNoteId}`, {
    method: 'PATCH', body: JSON.stringify({ pdf_storage_url: pdfStoragePath }),
  })
}
