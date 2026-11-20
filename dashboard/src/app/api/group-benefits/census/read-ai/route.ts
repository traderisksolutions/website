/**
 * POST /api/group-benefits/census/read-ai
 *   multipart: file              a census PDF the broker added
 *   JSON: { attachment_id }      a census PDF on the company's emails
 * → { filename, sheets } as census/read answers.
 *
 * A person's Read with AI on /eb, for a census PDF code could not read (a scan, an odd layout).
 * One model call transcribes the rows; normaliseCensusRead bounds them and the census code reads
 * names, dates of birth and categories. No age, date or count is taken from the model.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ebFileFrom } from '@/lib/gb/eb-files'
import { CENSUS_READ_PROMPT, normaliseCensusRead } from '@/lib/gb/census-pdf'
import { isPdf } from '@/lib/gb/pdf-text'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const f = await ebFileFrom(req, 20 * 1024 * 1024)
  if ('error' in f) return NextResponse.json({ error: f.error }, { status: f.status })
  const mime = isPdf(f.filename, f.buf) ? 'application/pdf' : /\.png$/i.test(f.filename) ? 'image/png' : /\.jpe?g$/i.test(f.filename) ? 'image/jpeg' : null
  if (!mime) return NextResponse.json({ error: 'Read with AI takes a PDF or an image.' }, { status: 400 })

  const { callGemini } = await import('@/lib/ai-call')
  const { GEMINI_DEEP } = await import('@/lib/gemini-models')
  const { parseJsonLoose } = await import('@/lib/crm/ai')
  const { text, error } = await callGemini({
    agent: 'group_benefit', feature: 'gb_census_read', model: GEMINI_DEEP, system: CENSUS_READ_PROMPT,
    parts: [{ text: `File: ${f.filename}` }, { inline_data: { mime_type: mime, data: f.buf.toString('base64') } }, { text: 'Transcribe every person and return the JSON.' }],
    maxOutputTokens: 30_000, thinkingShare: 0.1, temperature: 0,
  })
  if (!text) return NextResponse.json({ error: error ?? 'The census could not be read.' }, { status: 502 })
  const r = normaliseCensusRead(parseJsonLoose<unknown>(text))
  const employees = r.members.filter(m => m.relationship === 'self').length
  const sheets = [{ sheet: f.filename, members: r.members.map(m => ({ ...m, entity: null })), employees, dependants: r.members.length - employees, unread: r.unread, found: r.found, error: r.error, planCovers: [...new Set(r.members.flatMap(m => Object.keys(m.plans ?? {})))] }]
  return NextResponse.json({ filename: f.filename, sheets, readBy: 'model' })
}
