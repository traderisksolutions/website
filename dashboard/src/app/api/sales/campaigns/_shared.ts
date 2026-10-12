import type { AudienceFilter } from '@/lib/sales/audience'

export function cleanAudience(v: unknown): AudienceFilter {
  const o = (v ?? {}) as Record<string, unknown>
  const list = (x: unknown, ok: (s: string) => boolean) => Array.isArray(x) ? Array.from(new Set(x.filter((s): s is string => typeof s === 'string' && ok(s)))).slice(0, 20) : []
  return {
    relationships: list(o.relationships, s => ['client', 'enquiry', 'prospect', 'other'].includes(s)),
    locations: list(o.locations, s => /^[A-Z]{2}$/.test(s)),
    sources: list(o.sources, s => /^[a-z0-9:_-]{1,60}$/.test(s)),
    verifiedOnly: o.verifiedOnly === true,
    namedOnly: o.namedOnly === true,
  }
}

/** undefined = not given; null = clear; string = a valid http(s) URL; anything else undefined-with-error. */
export function cleanUrl(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  try { const u = new URL(String(v).trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined } catch { return undefined }
}
