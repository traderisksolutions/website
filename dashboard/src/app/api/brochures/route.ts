/**
 * GET    /api/brochures → { rows, drive_url, saving, drive }
 * POST   /api/brochures { product, line, version, in_force_from, note? } → { version } — creates the
 *        version folder in Drive and the row; the browser then uploads files through
 *        /api/brochures/[id]/upload-url and records each with PATCH { id, add_file }.
 * POST   /api/brochures { ..., adopt: true } → a row for a version folder already in Drive; no folder is made.
 * PATCH  /api/brochures { id, line?, in_force_from?, note?, add_file? } → { version }
 * DELETE /api/brochures?id= → marks the row removed. Drive files are never deleted from here.
 * `saving` is false until the brochure_versions table exists; `drive` is false when Drive is not configured.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { enc, sb, sbTry } from '@/lib/crm/db'
import { driveConfigured, listSourceFiles } from '@/lib/gb/drive'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import { libraryRows, newVersionFrom, uploadedFileFrom, versionPatchFrom, type DbVersion } from '@/lib/brochures/library'
import { folderUrl, versionFolder } from '@/lib/brochures/drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SELECT = 'id,line,product,version,in_force_from,drive_folder_id,drive_url,files,note,status,created_by,created_at'
const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)

/** The Drive listing takes about 9 s, so one instance keeps it 5 minutes; ?fresh=1 (after Add version) reads again. */
let listed: { at: number; files: Awaited<ReturnType<typeof listSourceFiles>> } | null = null
const LIST_TTL_MS = 5 * 60_000
async function driveFiles(fresh: boolean) {
  if (!fresh && listed && Date.now() - listed.at < LIST_TTL_MS) return listed.files
  const files = await listSourceFiles()
  listed = { at: Date.now(), files }
  return files
}

export async function GET(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const drive = driveConfigured()
  const [db, files] = await Promise.all([
    sbTry<DbVersion[] | null>(`brochure_versions?select=${SELECT}&order=product.asc&limit=2000`, null),
    drive ? driveFiles(req.nextUrl.searchParams.get('fresh') === '1').catch(() => null) : Promise.resolve(null),
  ])
  return NextResponse.json({
    rows: libraryRows(files ?? [], db ?? [], today()),
    drive_url: process.env.GOOGLE_TRS_DRIVE_FOLDER_ID ? folderUrl(process.env.GOOGLE_TRS_DRIVE_FOLDER_ID) : null,
    saving: db !== null, drive, drive_read: files !== null,
  })
}

export async function POST(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const b = await readBody<Record<string, unknown>>(req)
  if (!b) return fail('Body must be a JSON object')
  const r = newVersionFrom(b)
  if ('error' in r) return fail(r.error)
  if (b.adopt !== true && !driveConfigured()) return fail('Google Drive is not configured', 503)
  const v = r.ok
  try {
    const dup = await sb<{ id: string }[]>(`brochure_versions?product=ilike.${enc(v.product)}&version=ilike.${enc(v.version)}&status=neq.removed&select=id&limit=1`)
    if (dup.length) return fail(`${v.product} ${v.version} is already in the library`, 409)
    let folder: { id: string | null; url: string | null } = { id: null, url: null }
    if (b.adopt !== true) {
      try { folder = await versionFolder(v.line, v.product, v.version, v.in_force_from) } catch (e) {
        return fail(`Google Drive refused the folder: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown error'}`, 502)
      }
    }
    const [row] = await sb<DbVersion[]>('brochure_versions', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...v, drive_folder_id: folder.id, drive_url: folder.url, files: [], status: 'in_force', created_by: actor }),
    })
    return NextResponse.json({ version: row ?? null })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function PATCH(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const b = await readBody<Record<string, unknown>>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isUuid(b.id)) return fail('Not a version id')
  try {
    const [cur] = await sb<DbVersion[]>(`brochure_versions?id=eq.${b.id}&select=${SELECT}`)
    if (!cur) return fail('Version not found', 404)
    let patch: Record<string, unknown>
    if ('add_file' in b) {
      const f = uploadedFileFrom(b.add_file)
      if (!f) return fail('Not a Drive file')
      patch = { files: [...(cur.files ?? []).filter(x => x.id !== f.id), f] }
    } else {
      const r = versionPatchFrom(b)
      if ('error' in r) return fail(r.error)
      patch = r.ok
    }
    const [row] = await sb<DbVersion[]>(`brochure_versions?id=eq.${b.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    })
    return NextResponse.json({ version: row ?? null })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const id = req.nextUrl.searchParams.get('id')
  if (!isUuid(id)) return fail('Not a version id')
  try {
    const rows = await sb<{ id: string }[]>(`brochure_versions?id=eq.${id}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'removed', updated_at: new Date().toISOString() }),
    })
    if (!rows.length) return fail('Version not found', 404)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
