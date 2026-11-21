/**
 * GET  /api/placements/line-texts?line=car → { parts: { [part]: { body, edited_by, created_at } | study }, versions: { [part]: Version[] }, saving: boolean }
 * POST /api/placements/line-texts { line, part, body } → { version }
 * The lines library texts (src/lib/placement/line-library.ts). Append-only: a save or a restore adds a
 * version; the latest wins. `saving` is false until the placement_line_texts table exists.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { PARTS, bodyFrom, isLineKey, isPart, studyText, type Part } from '@/lib/placement/line-library'
import { errorResponse, fail, gate, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

type Version = { id: string; part: Part; body: string; edited_by: string; created_at: string }

export async function GET(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const line = req.nextUrl.searchParams.get('line')
  if (!isLineKey(line)) return fail('Unknown line')
  const rows = await sbTry<Version[] | null>(`placement_line_texts?line_key=eq.${enc(line)}&select=id,part,body,edited_by,created_at&order=created_at.desc&limit=500`, null)
  const versions = Object.fromEntries(PARTS.map(p => [p, (rows ?? []).filter(r => r.part === p)])) as Record<Part, Version[]>
  const parts = Object.fromEntries(PARTS.map(p => {
    const v = versions[p][0]
    return [p, v ? { body: v.body, edited_by: v.edited_by, created_at: v.created_at } : { body: studyText(line, p), edited_by: null, created_at: null }]
  }))
  return NextResponse.json({ parts, versions, saving: rows !== null })
}

export async function POST(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const b = await readBody<{ line?: unknown; part?: unknown; body?: unknown }>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isLineKey(b.line)) return fail('Unknown line')
  if (!isPart(b.part)) return fail('Unknown part')
  const body = bodyFrom(b.part, b.body)
  if (body == null) return fail('Nothing to save')
  try {
    const [version] = await sb<Version[]>('placement_line_texts', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ line_key: b.line, part: b.part, body, edited_by: actor }),
    })
    return NextResponse.json({ version: version ?? null })
  } catch (e) {
    return errorResponse(e)
  }
}
