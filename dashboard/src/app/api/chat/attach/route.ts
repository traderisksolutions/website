/**
 * POST /api/chat/attach   (multipart form-data: file)
 *
 * Extracts text from a file the employee attaches in the consultant chat so Opus
 * can read it. Returns { filename, text }. No storage — the text is passed inline
 * with the next message.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export const maxDuration = 60
const MAX_BYTES = 15_000_000
const CAP_CHARS = 40_000

async function extract(buf: Buffer, name: string, mime: string): Promise<string> {
  const lower = name.toLowerCase()
  try {
    if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('pdf-parse') as unknown
      const fn  = (typeof mod === 'function' ? mod : (mod as { default?: unknown }).default) as ((d: Buffer) => Promise<{ text?: string }>) | undefined
      const r = fn ? await fn(buf) : null
      return (r?.text ?? '').trim()
    }
    if (lower.endsWith('.docx') || mime.includes('wordprocessingml')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth') as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> }
      return (await mammoth.extractRawText({ buffer: buf })).value ?? ''
    }
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || mime.includes('spreadsheetml')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const xlsx = require('xlsx') as { read: (d: Buffer, o: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_csv: (s: unknown) => string } }
      const wb = xlsx.read(buf, { type: 'buffer' })
      return wb.SheetNames.map(n => `Sheet: ${n}\n${xlsx.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n')
    }
    // csv / txt / json / markdown / anything text-ish
    return buf.toString('utf-8')
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 15MB)' }, { status: 400 })

    const buf  = Buffer.from(await file.arrayBuffer())
    const text = (await extract(buf, file.name, file.type)).slice(0, CAP_CHARS).trim()
    if (!text) return NextResponse.json({ error: 'Could not read any text from this file' }, { status: 422 })

    return NextResponse.json({ filename: file.name, text })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
