/**
 * POST /api/group-benefits/census/parse   multipart: file (.csv, .txt, .xlsx, .xls)
 *
 * Reads a census by rule — no model — and returns the members, the dates it could not read, and
 * which header each field came from. Nothing is saved.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { xlsxSheetsAsText } from '@/lib/xlsx-text'
import { parseDelimited, censusFromRows, type CensusRead } from '@/lib/gb/census-parse'

const MAX_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Attach a .csv or .xlsx file' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is over 5 MB' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const isSheet = /\.(xlsx|xlsm|xls)$/i.test(file.name)
  // A workbook is read sheet by sheet; the one yielding the most people is the census.
  const texts = isSheet
    ? xlsxSheetsAsText(buf, 2_000_000).map(s => ({ sheet: s.name, text: s.text }))
    : [{ sheet: null as string | null, text: buf.toString('utf8').replace(/^﻿/, '') }]
  const reads: (CensusRead & { sheet: string | null })[] =
    texts.map(t => ({ ...censusFromRows(parseDelimited(t.text)), sheet: t.sheet }))
  const best = reads.sort((x, y) => y.members.length - x.members.length)[0]
  if (!best || !best.members.length) {
    return NextResponse.json({ error: best?.error ?? 'Nothing could be read from that file' }, { status: 422 })
  }
  return NextResponse.json({ ...best, filename: file.name })
}
