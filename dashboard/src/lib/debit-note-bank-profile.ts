/**
 * Looks up the bank/payment details to print on a debit note PDF, keyed by currency, from the
 * staff-editable debit_note_bank_profiles table — replaces the old single hardcoded bank block
 * (TRS_LETTERHEAD) now that USD debit notes need a correspondent/agent bank that SGD's local
 * DBS + PayNow details don't. Any currency without its own row (MYR, IDR, ...) falls back to
 * the is_default row (SGD), per product decision — not an accident of a missing row.
 */
import { SB_URL, sbH } from '@/lib/debit-note-storage'
import type { DebitNoteBankProfile } from '@/lib/debit-note-pdf'

// Last-resort fallback if the table is ever empty/unreachable, so PDF generation never throws —
// mirrors the SGD seed row exactly (same defensive spirit as the logo/QR asset fallback in
// debit-note-pdf.tsx: never block on a missing asset, but never fabricate one either).
const HARD_FALLBACK: DebitNoteBankProfile = {
  bankName: 'DBS Bank', bankAccountName: 'Trade Risk Solutions Pte. Ltd.', bankAccountNumber: '072-928492-0',
  bankCode: '7171', branchCode: '072', swiftCode: 'DBSSGSG', payNowUen: '202022795HSGD',
  agentBankSwiftBic: null, agentBankName: null,
}

async function fetchProfile(profileKey: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${SB_URL}/rest/v1/debit_note_bank_profiles?profile_key=eq.${encodeURIComponent(profileKey)}&select=*&limit=1`, { headers: sbH(), cache: 'no-store' })
  if (!res.ok) return null
  const rows = await res.json()
  return rows[0] ?? null
}

function mapRow(row: Record<string, unknown>): DebitNoteBankProfile {
  return {
    bankName: row.bank_name as string, bankAccountName: row.bank_account_name as string,
    bankAccountNumber: row.bank_account_number as string,
    bankCode: row.bank_code as string | null, branchCode: row.branch_code as string | null, swiftCode: row.swift_code as string | null,
    payNowUen: row.pay_now_uen as string | null,
    agentBankSwiftBic: row.agent_bank_swift_bic as string | null, agentBankName: row.agent_bank_name as string | null,
  }
}

export async function getBankProfileForCurrency(currency: string | null | undefined): Promise<DebitNoteBankProfile> {
  const key = (currency || 'SGD').toUpperCase()
  const row = (await fetchProfile(key)) ?? (await fetchProfile('SGD'))
  return row ? mapRow(row) : HARD_FALLBACK
}
