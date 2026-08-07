/**
 * Pure census helpers shared between the "New quote" wizard and editing an already-saved quote.
 */
import type { CensusMember } from '@/lib/pm-quote'

/** Plain calendar age as of today, from a DOB — display-only convenience (pricing itself uses each
 *  insurer's own age basis / effective date via ageForBasis in pm-calc.ts, not this). */
export function ageAsOfToday(dob: string): number | null {
  const d = new Date(dob)
  if (isNaN(d.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const hadBirthday = today.getMonth() > d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() >= d.getDate())
  if (!hadBirthday) age--
  return age
}

export function parseCensusCsv(text: string): CensusMember[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const head = lines[0].toLowerCase().split(',').map(s => s.trim())
  const ci = (n: string) => head.indexOf(n)
  const [ni, di, ai, ri] = [ci('name'), ci('dob') >= 0 ? ci('dob') : ci('date_of_birth'), ci('age'), ci('relationship')]
  return lines.slice(1).map(l => {
    const c = l.split(',').map(s => s.trim())
    const dob = di >= 0 ? (c[di] || null) : null
    const age = ai >= 0 && c[ai] ? Number(c[ai]) : (dob ? ageAsOfToday(dob) : null)
    return { name: ni >= 0 ? c[ni] : c[0], date_of_birth: dob, age, relationship: ri >= 0 ? (c[ri] || 'Self') : 'Self' }
  })
}
