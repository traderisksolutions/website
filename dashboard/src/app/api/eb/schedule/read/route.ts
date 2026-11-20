/**
 * POST /api/eb/schedule/read
 *   multipart: file, ai?           an insurer's pricing schedule the broker added (.xlsx, .xls, .csv, .pdf)
 *   JSON: { attachment_id, ai? }   one on the company's emails
 * → { schedule: InsurerSchedule }
 *
 * Code reads first (src/lib/gb/insurer-schedule.ts): spreadsheets by header rules, PDFs by their
 * text. `ai: "1"` is a person's Read with AI: one model call reads the file, and
 * normaliseScheduleRead bounds every figure and checks it word for word against the file's text.
 * Nothing is saved; the schedule travels with the quotation when it is kept.
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { ebFileFrom } from '@/lib/gb/eb-files'
import { isPdf, pdfPages } from '@/lib/gb/pdf-text'
import { normaliseScheduleRead, readSchedulePdf, readScheduleSheets, scheduleInsurer, SCHEDULE_READ_PROMPT } from '@/lib/gb/insurer-schedule'
import { findInsurerName } from '@/lib/documents/money'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const f = await ebFileFrom(req, 20 * 1024 * 1024)
  if ('error' in f) return NextResponse.json({ error: f.error }, { status: f.status })
  const pdf = isPdf(f.filename, f.buf)
  if (!pdf && !/\.(xlsx|xlsm|xls|csv)$/i.test(f.filename)) return NextResponse.json({ error: 'An insurer schedule is a .xlsx, .xls, .csv or .pdf file.' }, { status: 400 })

  let text = ''
  let sheets: { name: string; rows: unknown[][] }[] = []
  let pages: { num: number; text: string }[] = []
  try {
    if (pdf) { pages = await pdfPages(f.buf); text = pages.map(p => p.text).join('\n') }
    else {
      const wb = XLSX.read(f.buf, { type: 'buffer', raw: /\.csv$/i.test(f.filename) ? false : undefined })
      sheets = wb.SheetNames.slice(0, 12).map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) as unknown[][] }))
      text = sheets.map(s => s.rows.map(r => r.map(c => c ?? '').join('\t')).join('\n')).join('\n')
    }
  } catch (e) {
    if (!pdf) return NextResponse.json({ error: `The file could not be opened: ${e instanceof Error ? e.message : String(e)}` }, { status: 422 })
  }
  const insurer = scheduleInsurer(f.filename, text, findInsurerName)

  if (f.fields.ai === '1') {
    const { callGemini } = await import('@/lib/ai-call')
    const { GEMINI_DEEP } = await import('@/lib/gemini-models')
    const { parseJsonLoose } = await import('@/lib/crm/ai')
    const parts = pdf
      ? [{ text: `File: ${f.filename}` }, { inline_data: { mime_type: 'application/pdf', data: f.buf.toString('base64') } }]
      : [{ text: `File: ${f.filename}\n\n${text.slice(0, 60_000)}` }]
    const { text: out, error } = await callGemini({
      agent: 'group_benefit', feature: 'gb_schedule_read', model: GEMINI_DEEP, system: SCHEDULE_READ_PROMPT,
      parts: [...parts, { text: 'Read the premiums and return the JSON.' }], maxOutputTokens: 8_000, thinkingShare: 0.12, temperature: 0,
    })
    if (!out) return NextResponse.json({ error: error ?? 'The schedule could not be read.' }, { status: 502 })
    const s = normaliseScheduleRead(parseJsonLoose<unknown>(out), f.filename, text.trim() ? text : null)
    return NextResponse.json({ schedule: { ...s, insurer: s.insurer ?? insurer } })
  }

  const schedule = pdf ? readSchedulePdf(f.filename, pages, insurer) : readScheduleSheets(f.filename, sheets, insurer)
  return NextResponse.json({ schedule })
}
