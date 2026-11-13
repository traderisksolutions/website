/**
 * POST /api/group-benefits/quote/:id/last-year   multipart: files[] (PDF, image, .xlsx)
 * → { read: LastYear, stored: number }
 *
 * Last year's policy added on Compare cover: each file is kept in the Shared Drive
 * (group-benefits/last-year) so Today links to it, one model call reads them all
 * (src/lib/gb/last-year.ts), and the read is saved on the quotation with what each census plan
 * means. The policy's numbers replace the schedule's for the plans it states; others are kept.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enc, sb, sbTry } from '@/lib/crm/db'
import { readLastYear, scheduleFromLastYear } from '@/lib/gb/last-year'
import { LAST_YEAR_MAX_BYTES, lastYearPart } from '@/lib/gb/last-year-files'
import { planValues, type Schedule } from '@/lib/gb/current'
import { storeUpload } from '@/lib/storage/drive-upload'
import { logActivity } from '@/lib/log-activity'
import type { Member } from '@/lib/gb-quote'

export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const [q] = await sbTry<{ id: string; census: Member[] | null; requirement: Record<string, unknown> | null }[]>(`gb_quotations?id=eq.${enc(id)}&select=id,census,requirement&limit=1`, [])
  if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

  const form = await req.formData().catch(() => null)
  const list = (form?.getAll('files') ?? []).filter((f): f is File => f instanceof File).slice(0, 12)
  if (!list.length) return NextResponse.json({ error: 'Attach the policy schedule, endorsements or debit note.' }, { status: 400 })
  const files: { name: string; mime: string; bytes: Buffer; raw: Buffer; type: string }[] = []
  const skipped: string[] = []
  for (const f of list) {
    if (f.size > LAST_YEAR_MAX_BYTES) { skipped.push(`${f.name}: over 20 MB`); continue }
    const raw = Buffer.from(await f.arrayBuffer())
    const p = await lastYearPart(f.name, raw).catch(() => null)
    if (p) files.push({ ...p, raw, type: f.type || p.mime }); else skipped.push(`${f.name}: not a PDF, image or spreadsheet`)
  }
  if (!files.length) return NextResponse.json({ error: skipped.join('; ') }, { status: 422 })

  const [out, refs] = await Promise.all([
    readLastYear(files.map(({ name, mime, bytes }) => ({ name, mime, bytes }))),
    Promise.all(files.map(f => storeUpload('group-benefits/last-year', f.name, f.type, f.raw).catch(() => null))),
  ])
  if ('error' in out) return NextResponse.json({ error: out.error, skipped }, { status: 502 })
  const refOf = new Map(files.map((f, i) => [f.name.trim().toLowerCase(), refs[i]]))
  const read = { ...out.read, documents: out.read.documents.map(d => ({ ...d, ref: refOf.get(d.file.trim().toLowerCase()) ?? null })) }

  const req0 = q.requirement ?? {}
  const before = (req0.current_schedule ?? null) as Schedule | null
  const fromPolicy = q.census?.length ? scheduleFromLastYear(read, planValues(q.census)) : {}
  const schedule = before || Object.keys(fromPolicy).length
    ? Object.fromEntries((['GHS', 'EMM', 'GOPC', 'GOSC', 'GD', 'GTL'] as const).map(c => [c, { ...(before?.[c] ?? {}), ...(fromPolicy[c] ?? {}) }])) as Schedule
    : null
  const requirement = { ...req0, last_year: read, current_schedule: schedule, current_insurer: req0.current_insurer ?? read.insurer ?? null }
  await sb(`gb_quotations?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ requirement }) })
  void logActivity({ action: 'gb.last_year_added', resource_type: 'gb_quotation', resource_id: id, new_value: { files: files.map(f => f.name), total: read.total, insurer: read.insurer }, metadata: { by: user.email ?? null } })
  return NextResponse.json({ read, stored: refs.filter(Boolean).length, skipped })
}
