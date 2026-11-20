/**
 * Inline images out of email_messages.body_html (20 Nov 2026). A data: URI in body_html is the
 * image's bytes stored as text in Postgres: on 20 Nov 2026 they were about 79% of the 2.5 GB
 * email_messages table. Ingest and scripts/move-inline-images.ts put each image in Drive
 * (email-images/stored/<YYYY-MM>/) and write a signed link to /api/public/email-image instead.
 *
 * Pure: finding, decoding, planning and replacing data: URIs, and signing the link. The Drive
 * write is in inline-image-store.ts. Tested in src/__tests__/inline-images.test.ts.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/** A data: URI shorter than this stays inline: spacers and tracking pixels, under about 750 bytes. */
export const INLINE_MIN_CHARS = 1_000
/** Larger than this is left as it is and reported; Drive takes it, but no email image is this big. */
export const INLINE_MAX_BYTES = 10 * 1024 * 1024

/** Raster types the public route serves. SVG stays inline: it can carry script and the route
 *  serves from the dashboard's own origin. */
const SNIFF: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png',  ext: 'png',  test: b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', ext: 'jpg',  test: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif',  ext: 'gif',  test: b => b.length > 6 && b.subarray(0, 4).toString('latin1') === 'GIF8' },
  { mime: 'image/webp', ext: 'webp', test: b => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { mime: 'image/bmp',  ext: 'bmp',  test: b => b.length > 2 && b[0] === 0x42 && b[1] === 0x4d },
]

/** The raster type the bytes really are, or null. The declared type is not trusted (image/jpg,
 *  a PNG labelled JPEG, application/octet-stream from Outlook). */
export function sniffImage(bytes: Buffer): { mime: string; ext: string } | null {
  const hit = SNIFF.find(s => s.test(bytes))
  return hit ? { mime: hit.mime, ext: hit.ext } : null
}

export interface DataUri {
  /** The exact text in the HTML, replaced as written. */
  raw: string
  /** Declared type, lower case. */
  declared: string
  /** The base64 payload with line breaks, entities and URL-safe characters normalised. */
  base64: string
}

// data:image/<type>[;param=value…];base64,<payload>. The payload may be wrapped by line breaks
// (quoted-printable bodies), HTML-escaped line breaks (&#10; &#13;) or URL-escaped ones (%0A %0D),
// and may use the URL-safe alphabet. Spaces are not allowed inside: on an unquoted attribute a
// space starts the next attribute.
const DATA_URI = /data:(image\/[a-z0-9.+-]+)((?:;[a-z0-9-]+=[^;,"'\s)>]*)*);base64,((?:[A-Za-z0-9+/=_-]|\r?\n[ \t]*|&#1[03];|%0[aAdD])+)/gi

const normalise = (payload: string) => payload.replace(/\r?\n[ \t]*|&#1[03];|%0[aAdD]/g, '').replace(/-/g, '+').replace(/_/g, '/')

/** Every data:image URI in the HTML, once each, in order of first appearance. */
export function findDataUris(html: string): DataUri[] {
  const seen = new Set<string>(), out: DataUri[] = []
  for (const m of (html ?? '').matchAll(DATA_URI)) {
    const raw = m[0].replace(/(?:\r?\n[ \t]*|&#1[03];|%0[aAdD])+$/, '')   // a trailing break belongs to the HTML
    if (seen.has(raw)) continue
    seen.add(raw)
    out.push({ raw, declared: m[1].toLowerCase(), base64: normalise(m[3]) })
  }
  return out
}

export interface PlannedImage {
  raw: string
  bytes: Buffer
  mime: string
  ext: string
  /** sha256 of the bytes, hex, 32 characters: the file name in Drive and the job log's key. */
  hash: string
}
export type KeepReason = 'small' | 'too_large' | 'not_raster' | 'unreadable'
export interface InlinePlan { move: PlannedImage[]; keep: { raw: string; reason: KeepReason }[]; movedChars: number; keptChars: number }

export const imageHash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex').slice(0, 32)

/** Which data: URIs leave the row, and why the others stay. */
export function planInline(html: string, opts: { minChars?: number; maxBytes?: number } = {}): InlinePlan {
  const minChars = opts.minChars ?? INLINE_MIN_CHARS, maxBytes = opts.maxBytes ?? INLINE_MAX_BYTES
  const plan: InlinePlan = { move: [], keep: [], movedChars: 0, keptChars: 0 }
  const keep = (raw: string, reason: KeepReason) => { plan.keep.push({ raw, reason }); plan.keptChars += raw.length }
  for (const u of findDataUris(html)) {
    if (u.raw.length < minChars) { keep(u.raw, 'small'); continue }
    if (u.base64.length * 0.75 > maxBytes + 3) { keep(u.raw, 'too_large'); continue }
    const bytes = Buffer.from(u.base64, 'base64')
    if (!bytes.length) { keep(u.raw, 'unreadable'); continue }
    const kind = sniffImage(bytes)
    if (!kind) { keep(u.raw, u.declared === 'image/svg+xml' ? 'not_raster' : 'unreadable'); continue }
    plan.move.push({ raw: u.raw, bytes, mime: kind.mime, ext: kind.ext, hash: imageHash(bytes) })
    plan.movedChars += u.raw.length
  }
  return plan
}

/** The HTML with each data: URI in the map replaced by its link, everywhere it appears. */
export function replaceDataUris(html: string, links: Map<string, string>): string {
  let out = html
  // Longest first, so a URI that is a prefix of another is never replaced inside it.
  for (const raw of Array.from(links.keys()).sort((a, b) => b.length - a.length)) out = out.split(raw).join(links.get(raw)!)
  return out
}

// ── The link ──────────────────────────────────────────────────────────────────────────────────

const secret = () => { const k = process.env.AUTH_SECRET; if (!k) throw new Error('AUTH_SECRET not set'); return k }
const sign = (id: string, key: string) => createHmac('sha256', key).update(`email-image:${id}`).digest('base64url')

/** The live dashboard; links stored in body_html are absolute so quoted replies carry them out. */
export const publicOrigin = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://trs-dashboard-pi.vercel.app').replace(/\/$/, '')

/** A signed link to a stored image. The signature does not expire: the email it sits in is kept. */
export function emailImageUrl(driveId: string, origin = publicOrigin(), key = secret()): string {
  return `${origin}/api/public/email-image/${driveId}?s=${sign(driveId, key)}`
}

export function verifyEmailImageSig(driveId: string, sig: string | null | undefined, key = secret()): boolean {
  if (!sig || !/^[\w-]{43}$/.test(sig)) return false
  const want = Buffer.from(sign(driveId, key)), got = Buffer.from(sig)
  return want.length === got.length && timingSafeEqual(want, got)
}

// ── The one-time job's planner ────────────────────────────────────────────────────────────────

export interface BatchRow { id: string; body_html: string | null }
export interface BatchPlan { rows: number; rowsToChange: number; images: number; uniqueImages: number; movedChars: number; keptImages: number; keptChars: number; nextCursor: string | null }

/** What one batch of rows would move. `nextCursor` is the last id read, for `id=gt.<cursor>`. */
export function planBatch(rows: BatchRow[], opts?: { minChars?: number; maxBytes?: number }): BatchPlan {
  const hashes = new Set<string>()
  const out: BatchPlan = { rows: rows.length, rowsToChange: 0, images: 0, uniqueImages: 0, movedChars: 0, keptImages: 0, keptChars: 0, nextCursor: rows.length ? rows[rows.length - 1].id : null }
  for (const r of rows) {
    const p = planInline(r.body_html ?? '', opts)
    if (p.move.length) out.rowsToChange++
    out.images += p.move.length
    for (const m of p.move) hashes.add(m.hash)
    out.movedChars += p.movedChars
    out.keptImages += p.keep.length
    out.keptChars += p.keptChars
  }
  out.uniqueImages = hashes.size
  return out
}

/** The PostgREST path for one batch: id + body_html of rows holding a data:image, after the cursor, by id. */
export function batchPath(cursor: string | null, size = 25): string {
  return `email_messages?select=id,body_html&body_html=like.*data:image*${cursor ? `&id=gt.${encodeURIComponent(cursor)}` : ''}&order=id.asc&limit=${size}`
}
