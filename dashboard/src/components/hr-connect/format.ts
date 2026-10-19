// HR Connect page formatting. Pure, client-safe.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 1971-12-24 → 24 Dec 1971; anything unreadable → the input. */
export function fmtDob(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso
}

/** 2026-10-24 → 24 October 2026. */
export function fmtLong(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${Number(m[3])} ${MONTHS_LONG[Number(m[2]) - 1]} ${m[1]}` : iso
}

/** An instant → "10:42 on 20 October 2026", Singapore time. */
export function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  const d = new Date(t + 8 * 3_600_000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} on ${fmtLong(d.toISOString().slice(0, 10))}`
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Gembridge Capital Management Pte Ltd" → "Gembridge" for the heading, as the design does. */
export function shortCompany(name: string): string {
  return name.replace(/\s+(pte\.?\s*ltd\.?|private limited|ltd\.?|limited|llp|inc\.?|co\.?)$/i, '').trim() || name
}
