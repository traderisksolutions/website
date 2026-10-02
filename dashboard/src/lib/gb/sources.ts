/**
 * Which Drive files each rate table was read from, and which files nobody has read yet.
 *
 * A rate table records its sources on itself, in rules.sources — the Drive file id, name, plan
 * year and Drive's checksum of the content at the time it was read. Matching the live folder
 * against those records answers the questions that matter once a year:
 *
 *   in use     this exact file is what a rate table was read from
 *   changed    a file of the same name is recorded, but its content is different now — the insurer
 *              reissued it, or someone replaced it, and the rates may be stale
 *   not read   nothing has been read from this file yet: a new insurer, or a new plan year
 *
 * Pure: no I/O.
 */
import type { SourceFile } from './drive'

export type RecordedSource = {
  driveFileId: string
  filename: string
  insurer: string
  planYear: string | null
  kind: string
  md5: string | null
  readAt: string
}

export type SourceStatus = 'in_use' | 'changed' | 'not_read'

export type TableSources = { rateTableId: string; insurerName: string | null; sources: RecordedSource[] }

export type SourceRow = SourceFile & {
  status: SourceStatus
  rateTables: { id: string; insurerName: string | null }[]
  recordedMd5?: string | null
}

export function matchSources(files: SourceFile[], tables: TableSources[]): SourceRow[] {
  return files.map(f => {
    const exact = tables.filter(t => t.sources.some(s => s.driveFileId === f.driveFileId && (!f.md5 || !s.md5 || s.md5 === f.md5)))
    if (exact.length) {
      return { ...f, status: 'in_use' as const, rateTables: exact.map(t => ({ id: t.rateTableId, insurerName: t.insurerName })) }
    }
    // Same file id with a different checksum, or the same name in the same insurer and year with
    // different content: either way what was read is no longer what is in the folder.
    const stale = tables.flatMap(t => t.sources
      .filter(s => s.driveFileId === f.driveFileId
        || (s.filename === f.filename && s.insurer === f.insurer && (s.planYear ?? null) === (f.planYear ?? null)))
      .map(s => ({ t, s })))
    if (stale.length) {
      return { ...f, status: 'changed' as const, recordedMd5: stale[0].s.md5,
               rateTables: stale.map(x => ({ id: x.t.rateTableId, insurerName: x.t.insurerName })) }
    }
    return { ...f, status: 'not_read' as const, rateTables: [] }
  })
}

export function toRecorded(f: SourceFile, readAt = new Date().toISOString()): RecordedSource {
  return { driveFileId: f.driveFileId, filename: f.filename, insurer: f.insurer, planYear: f.planYear,
           kind: f.kind, md5: f.md5, readAt }
}
