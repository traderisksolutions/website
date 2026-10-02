/**
 * GET  /api/group-benefits/sources  → every file in the Pricing Matrix Drive folder, with whether a
 *                                     rate table was read from it, it has changed since, or nobody
 *                                     has read it yet
 * POST /api/group-benefits/sources  → { rateTableId, driveFileIds } record that a rate table was
 *                                     read from these files, at their current content
 *
 * Sources are recorded on the rate table itself (rules.sources), beside the calculator provenance
 * the loader already writes, so a premium can be traced to the exact file version it came from.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { logActivity } from '@/lib/log-activity'
import { driveConfigured, listSourceFiles } from '@/lib/gb/drive'
import { matchSources, toRecorded, type RecordedSource, type TableSources } from '@/lib/gb/sources'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const sbH = (prefer?: string) => {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }
}

type TableRow = { id: string; insurer_name: string | null; rules: { sources?: RecordedSource[] } & Record<string, unknown> | null }

async function tables(): Promise<TableRow[]> {
  const res = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?select=id,insurer_name,rules&limit=500`, { headers: sbH(), cache: 'no-store' })
  return res.ok ? await res.json() as TableRow[] : []
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  if (!driveConfigured()) {
    return NextResponse.json({ configured: false, folderId: null, files: [] })
  }
  try {
    const [files, rows] = await Promise.all([listSourceFiles(), tables()])
    const ts: TableSources[] = rows.map(r => ({ rateTableId: r.id, insurerName: r.insurer_name, sources: r.rules?.sources ?? [] }))
    return NextResponse.json({ configured: true, folderId: process.env.GOOGLE_TRS_DRIVE_FOLDER_ID, files: matchSources(files, ts) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { rateTableId, driveFileIds } = await req.json() as { rateTableId?: string; driveFileIds?: string[] }
    if (!rateTableId || !driveFileIds?.length) return NextResponse.json({ error: 'rateTableId and driveFileIds are required' }, { status: 400 })
    const files = (await listSourceFiles()).filter(f => driveFileIds.includes(f.driveFileId))
    if (files.length !== driveFileIds.length) return NextResponse.json({ error: 'A file is not in the Pricing Matrix folder.' }, { status: 400 })
    const table = (await tables()).find(t => t.id === rateTableId)
    if (!table) return NextResponse.json({ error: 'Rate table not found' }, { status: 404 })

    // Replace any earlier record of the same file, so re-reading a reissued file updates its
    // checksum instead of leaving two records.
    const kept = (table.rules?.sources ?? []).filter(s => !files.some(f => f.driveFileId === s.driveFileId || (f.filename === s.filename && f.insurer === s.insurer && f.planYear === s.planYear)))
    const sources = [...kept, ...files.map(f => toRecorded(f))]
    const res = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${rateTableId}`, {
      method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ rules: { ...(table.rules ?? {}), sources } }),
    })
    if (!res.ok) return NextResponse.json({ error: (await res.text()).slice(0, 200) }, { status: 500 })
    void logActivity({ action: 'gb.sources_recorded', resource_type: 'gb_rate_table', resource_id: rateTableId,
                       new_value: { files: files.map(f => f.filename) } })
    return NextResponse.json({ ok: true, sources })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
