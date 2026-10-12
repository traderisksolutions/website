// evidence, score_reasons and uncertainty are free-form JSON written by the lead tool: an array
// in some rows, an object in others. Normalise to something renderable, never assume. Pure.

export type EvidenceNode =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: EvidenceNode[] }
  | { kind: 'fields'; fields: { label: string; value: EvidenceNode }[] }

export function humanise(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : key
}

/** Null for anything empty, so an empty section can be hidden. */
export function toEvidence(v: unknown, depth = 0): EvidenceNode | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') { const t = v.trim(); return t ? { kind: 'text', text: t.length > 4000 ? `${t.slice(0, 4000)}…` : t } : null }
  if (typeof v === 'number' || typeof v === 'boolean') return { kind: 'text', text: String(v) }
  if (depth > 4) return { kind: 'text', text: JSON.stringify(v).slice(0, 400) }
  if (Array.isArray(v)) {
    const items = v.map(x => toEvidence(x, depth + 1)).filter((x): x is EvidenceNode => x !== null)
    return items.length ? { kind: 'list', items } : null
  }
  if (typeof v === 'object') {
    const fields = Object.entries(v as Record<string, unknown>).map(([k, x]) => ({ label: humanise(k), value: toEvidence(x, depth + 1) }))
      .filter((f): f is { label: string; value: EvidenceNode } => f.value !== null)
    return fields.length ? { kind: 'fields', fields } : null
  }
  return null
}

/** Only http(s) URLs become links. Anything else renders as text. */
export function safeHref(u: unknown): string | null {
  if (typeof u !== 'string') return null
  try { const url = new URL(u.trim()); return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null } catch { return null }
}

export const looksLikeUrl = (s: string) => /^https?:\/\//i.test(s.trim())

/** Digits for wa.me when the number is a mobile in SG, HK, MY or ID, else null. */
export function mobileForWhatsApp(phone: string | null | undefined, location: string | null | undefined): string | null {
  let d = (phone ?? '').replace(/[^0-9+]/g, '')
  if (!d) return null
  d = d.startsWith('+') ? d.slice(1) : d.startsWith('00') ? d.slice(2) : d
  const loc = (location ?? '').toUpperCase()
  if (/^65[89]\d{7}$/.test(d)) return d
  if (/^852[4-79]\d{7}$/.test(d)) return d
  if (/^62\d{9,12}$/.test(d) && d.startsWith('628')) return d
  if (/^601\d{8,9}$/.test(d)) return d
  if (loc === 'SG' && /^[89]\d{7}$/.test(d)) return `65${d}`
  if (loc === 'HK' && /^[4-79]\d{7}$/.test(d)) return `852${d}`
  if (loc === 'ID' && /^08\d{8,11}$/.test(d)) return `62${d.slice(1)}`
  if (loc === 'MY' && /^01\d{8,9}$/.test(d)) return `6${d}`
  return null
}

export function whatsappLink(digits: string, message: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
