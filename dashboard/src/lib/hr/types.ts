// HR Connect: shared shapes for the public HR pages, the connectors and the dashboard. Pure.
//
// An employee list arrives one of four ways (CSV/XLSX upload, Talenox API, SimplePay API key,
// Workday integration user) and is normalised to the same two records so the quote engine never knows the source.

export type HrSource = 'csv' | 'talenox' | 'simplepay' | 'workday' | 'manual'

export type HrEmployee = {
  /** Stable within a submission: row number for a file, the vendor id otherwise. */
  key: string
  name: string
  /** YYYY-MM-DD, or null when unreadable or absent. Never guessed. */
  dob: string | null
  gender: 'M' | 'F' | null
  /** Category or grade as the client names it: Director, Manager, Staff, Work Permit… */
  category: string | null
  /** Citizen, PR, Employment Pass, S Pass, Work Permit, or the vendor's own label. */
  workPass: string | null
  /** YYYY-MM-DD or null. */
  hireDate: string | null
  /** Active, terminated, future-dated. Only active employees are priced. */
  status: 'active' | 'inactive' | 'unknown'
  /** Occupation class 1 to 3 for accident cover; null until the broker sets it. */
  occupationClass: '1' | '2' | '3' | null
  /** Problems the page shows next to the row; empty when complete. */
  issues: string[]
  /** The vendor's record or the file's row, kept for audit; never a credential. */
  raw?: Record<string, unknown>
}

export type HrDependant = {
  key: string
  /** HrEmployee.key of the employee this dependant belongs to. */
  employeeKey: string
  name: string
  relationship: 'spouse' | 'child'
  dob: string | null
  gender: 'M' | 'F' | null
  issues: string[]
}

export type HrList = { employees: HrEmployee[]; dependants: HrDependant[] }

/** What a connector or file reader hands back, before HR reviews it. */
export type HrRead = HrList & {
  source: HrSource
  /** Filename, matched columns, tenant host. Never a token or password. */
  meta: Record<string, unknown>
  /** Rows or records that could not be read at all, with the reason. */
  skipped: { key: string; reason: string }[]
}

export const HR_LINK_STATUSES = ['sent', 'opened', 'submitted', 'expired', 'closed'] as const
export type HrLinkStatus = typeof HR_LINK_STATUSES[number]

export type HrLink = {
  id: string
  reference: string
  company_id: string | null
  company_name: string
  quotation_id: string | null
  /** The policy (company spine) this list is for; pricing runs on its placement line when HR submits. */
  policy_id: string | null
  effective_date: string | null
  recipient_name: string
  recipient_email: string
  cc_email: string | null
  requested_by: string | null
  message: string
  status: HrLinkStatus
  sent_by: string | null
  sent_at: string
  expires_at: string
  opened_at: string | null
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export type HrLinkEvent = { id: string; link_id: string; kind: string; detail: Record<string, unknown>; created_at: string }

export type HrSubmission = {
  id: string
  link_id: string
  company_id: string | null
  source: HrSource
  source_meta: Record<string, unknown>
  employees: HrEmployee[]
  dependants: HrDependant[]
  employee_count: number
  dependant_count: number
  status: 'draft' | 'submitted'
  submitted_by_name: string | null
  submitted_by_email: string | null
  consent_text: string | null
  consent_at: string | null
  created_at: string
  updated_at: string
}

/** The quote engine's census row, built from a submission. */
export type CensusMember = { name: string; category: string; relationship: 'self' | 'spouse' | 'child'; dob: string | null; occupation_class: string | null }

export function toCensus(list: HrList, defaultCategory = 'Staff'): CensusMember[] {
  const out: CensusMember[] = []
  for (const e of list.employees) {
    if (e.status === 'inactive') continue
    out.push({ name: e.name, category: e.category || defaultCategory, relationship: 'self', dob: e.dob, occupation_class: e.occupationClass ?? '1' })
    for (const d of list.dependants.filter(d => d.employeeKey === e.key)) {
      out.push({ name: d.name, category: e.category || defaultCategory, relationship: d.relationship, dob: d.dob, occupation_class: null })
    }
  }
  return out
}

export const CONSENT_TEXT = (company: string, effective: string | null) =>
  `${company} provides this information to Trade Risk Solutions Pte Ltd to obtain group insurance quotations` +
  `${effective ? ` for the policy starting ${effective}` : ''}. Trade Risk Solutions will share it only with the insurers quoting, ` +
  `hold it under its personal data protection policy, and delete it on request. I am authorised by ${company} to provide this list, ` +
  `and the people listed have been told their details are being used to arrange group insurance.`
