/**
 * The brochure library (Employment Benefits › Brochures): every brochure and rate file TRS prices
 * from, one row per product version. Drive holds the files (<product>/<version folder>/files, the
 * same folder the Pricing Matrix reads); brochure_versions holds the line, the label, the in-force
 * date and a note. Pure; tested in src/__tests__/brochure-library.test.ts.
 *
 * Status by date: per product, the latest version in force on or before today is In force, a later
 * one is Scheduled, earlier ones are Superseded. A file dropped straight into a product folder is
 * To confirm.
 */
import type { SourceFile } from '@/lib/gb/drive'

export const BROCHURE_LINES = ['Employment Benefits', 'Travel', 'Personal Accident', 'SME Package', 'Professional Indemnity', 'Cyber'] as const
export type BrochureLine = (typeof BROCHURE_LINES)[number]
export const isBrochureLine = (v: unknown): v is BrochureLine => typeof v === 'string' && (BROCHURE_LINES as readonly string[]).includes(v)

export type FileKind = 'brochure' | 'rates' | 'other'
export type VersionFile = { id: string; name: string; kind: FileKind; url: string | null }
export type Status = 'in_force' | 'scheduled' | 'superseded' | 'to_confirm' | 'not_dated'
export const STATUS_WORD: Record<Status, string> = { in_force: 'In force', scheduled: 'Scheduled', superseded: 'Superseded', to_confirm: 'To confirm', not_dated: 'No date' }

/** A brochure_versions row. */
export type DbVersion = {
  id: string; line: string; product: string; version: string; in_force_from: string | null
  drive_folder_id: string | null; drive_url: string | null; files: VersionFile[] | null; note: string | null
  status: 'in_force' | 'superseded' | 'removed'; created_by: string; created_at: string
}

export type LibraryRow = {
  key: string; id: string | null; product: string; line: string; version: string; in_force_from: string | null
  files: VersionFile[]; note: string | null; drive_url: string | null; status: Status
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v))
const norm = (s: string) => s.trim().toLowerCase()

/** The version folder's name in Drive. */
export const folderName = (version: string, inForce: string | null) => inForce ? `${version} · in force ${inForce}` : version

/** A version folder's name read back: "v14 · in force 2026-10-01" or a bare "2026". */
export function parseFolder(name: string): { version: string; in_force_from: string | null } {
  const m = name.match(/^(.*?)\s*·\s*in force\s+(\d{4}-\d{2}-\d{2})\s*$/i)
  if (m && isDate(m[2])) return { version: m[1].trim(), in_force_from: m[2] }
  return { version: name.trim(), in_force_from: null }
}

export function fileKind(name: string, mimeType = ''): FileKind {
  if (/\.(xlsx|xlsm|xls|csv)$/i.test(name) || mimeType.includes('spreadsheet')) return 'rates'
  if (/\.pdf$/i.test(name) || mimeType === 'application/pdf') return 'brochure'
  return 'other'
}

/** When a version starts: its date, or 1 January of a bare year label. */
const effective = (r: { version: string; in_force_from: string | null }) => r.in_force_from ?? (/^\d{4}$/.test(r.version.trim()) ? `${r.version.trim()}-01-01` : null)

/** Drive's files and the saved rows as one list: product A–Z, newest version first. */
export function libraryRows(files: SourceFile[], db: DbVersion[], today: string): LibraryRow[] {
  const rows = new Map<string, LibraryRow>()
  for (const f of files) {
    if (f.insurer.startsWith('_')) continue
    const unfiled = f.planYear == null
    const p = unfiled ? { version: 'Not in a version folder', in_force_from: null } : parseFolder(f.planYear!)
    const key = `${norm(f.insurer)}|${unfiled ? '' : norm(p.version)}`
    const row = rows.get(key) ?? { key, id: null, product: f.insurer, line: 'Employment Benefits', version: p.version, in_force_from: p.in_force_from, files: [], note: null, drive_url: null, status: unfiled ? 'to_confirm' as const : 'not_dated' as const }
    row.files.push({ id: f.driveFileId, name: f.filename, kind: fileKind(f.filename, f.mimeType), url: f.webViewLink })
    rows.set(key, row)
  }
  const manual = new Set<string>()
  for (const d of db) {
    const key = `${norm(d.product)}|${norm(d.version)}`
    if (d.status === 'removed') { rows.delete(key); continue }
    const seen = rows.get(key)
    const own = (d.files ?? []).filter(f => !seen?.files.some(s => s.id === f.id))
    rows.set(key, {
      key, id: d.id, product: d.product, line: d.line, version: d.version, in_force_from: d.in_force_from ?? seen?.in_force_from ?? null,
      files: [...(seen?.files ?? []), ...own], note: d.note, drive_url: d.drive_url, status: 'not_dated',
    })
    if (d.status === 'superseded') manual.add(key)
  }

  const byProduct = new Map<string, LibraryRow[]>()
  for (const r of rows.values()) byProduct.set(norm(r.product), [...(byProduct.get(norm(r.product)) ?? []), r])
  const out: LibraryRow[] = []
  for (const list of byProduct.values()) {
    const dated = list.filter(r => r.status !== 'to_confirm' && effective(r)).sort((a, b) => effective(b)!.localeCompare(effective(a)!))
    let current = false
    for (const r of dated) {
      if (manual.has(r.key)) r.status = 'superseded'
      else if (effective(r)! > today) r.status = 'scheduled'
      else if (!current) { r.status = 'in_force'; current = true }
      else r.status = 'superseded'
    }
    out.push(...dated, ...list.filter(r => !dated.includes(r)))
  }
  return out.sort((a, b) => a.product.localeCompare(b.product) || order(a, b))
}

const order = (a: LibraryRow, b: LibraryRow) => {
  const ea = effective(a), eb = effective(b)
  if (ea && eb) return eb.localeCompare(ea)
  return ea ? -1 : eb ? 1 : 0
}

/** The label a product's next version gets: one past its highest vN, else v1. */
export function nextVersion(rows: Pick<LibraryRow, 'product' | 'version'>[], product: string): string {
  const ns = rows.filter(r => norm(r.product) === norm(product)).map(r => r.version.match(/^v(\d+)$/i)?.[1]).filter(Boolean).map(Number)
  return `v${ns.length ? Math.max(...ns) + 1 : 1}`
}

const text = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const SAFE = /^[^/\\]+$/

export type NewVersion = { product: string; line: BrochureLine; version: string; in_force_from: string; note: string | null }

/** Add version, checked at the boundary. */
export function newVersionFrom(b: Record<string, unknown>): { ok: NewVersion } | { error: string } {
  const product = text(b.product, 120), version = text(b.version, 40), note = text(b.note, 500) || null
  if (!product || !SAFE.test(product) || product.startsWith('_')) return { error: 'Product name is required, without / or a leading _' }
  if (!isBrochureLine(b.line)) return { error: 'Pick a line' }
  if (!version || !SAFE.test(version)) return { error: 'Version is required, without /' }
  if (!isDate(b.in_force_from)) return { error: 'In force from must be a date' }
  return { ok: { product, line: b.line, version, in_force_from: b.in_force_from, note } }
}

/** Edit: only the fields given, each checked. The version label is fixed once made (it names the Drive folder). */
export function versionPatchFrom(b: Record<string, unknown>): { ok: Record<string, unknown> } | { error: string } {
  const out: Record<string, unknown> = {}
  if ('line' in b) { if (!isBrochureLine(b.line)) return { error: 'Pick a line' }; out.line = b.line }
  if ('in_force_from' in b) { if (!isDate(b.in_force_from)) return { error: 'In force from must be a date' }; out.in_force_from = b.in_force_from }
  if ('note' in b) out.note = text(b.note, 500) || null
  if (!Object.keys(out).length) return { error: 'Nothing to change' }
  return { ok: out }
}

/** A file the browser uploaded into a version folder, as recorded on its row. */
export function uploadedFileFrom(v: unknown): VersionFile | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const id = text(o.id, 100), name = text(o.name, 200)
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id) || !name) return null
  return { id, name, kind: fileKind(name, text(o.mime_type, 100)), url: `https://drive.google.com/file/d/${id}/view` }
}
