/** Display helpers for intake rows. Client-safe. Times in Singapore. */
const TZ = 'Asia/Singapore'

export function bookingLabel(b: { day?: string; time?: string } | null | undefined): string | null {
  if (!b?.day || !b.time) return null
  const d = new Date(`${b.day}T12:00:00+08:00`)
  if (Number.isNaN(d.getTime())) return `${b.day} ${b.time}`
  return `${d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })}, ${b.time}`
}

export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '–'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '–'
  return d.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
}

/** wa.me link from a stored "+65 81234567" phone. */
export function whatsappHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? `https://wa.me/${digits}` : null
}
