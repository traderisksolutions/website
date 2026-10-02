/**
 * How far a rate table's premiums have been checked, shown beside every premium it produces.
 *
 *   calculator   the engine reproduces the insurer's own premium calculator
 *   brochure     the rates were confirmed against the insurer's brochure; no calculator on file
 *   unverified   only TRS's own workbook; no insurer document on file to check against
 *
 * A premium from an unverified table is still quotable — the broker may need it — but it must
 * never be mistaken for a checked one.
 */
export type VerificationStatus = 'calculator' | 'brochure' | 'unverified'

export const VERIFICATION: Record<VerificationStatus, { label: string; color: string }> = {
  calculator: { label: 'Checked against calculator', color: '#137333' },
  brochure:   { label: 'Checked against brochure',   color: '#5f6368' },
  unverified: { label: 'Unverified',                 color: '#b06000' },
}

/** Tables loaded before verification was recorded have none; treat that as unverified, not as checked. */
export function verificationOf(rules: unknown): { status: VerificationStatus; basis: string | null } {
  const v = (rules as { verification?: { status?: string; basis?: string } } | null)?.verification
  const status = (v?.status === 'calculator' || v?.status === 'brochure') ? v.status : 'unverified'
  return { status, basis: v?.basis ?? null }
}
