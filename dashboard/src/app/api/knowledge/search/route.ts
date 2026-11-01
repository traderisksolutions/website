/**
 * GET /api/knowledge/search?company_id=&q= → { entries }
 * Searches a company group's knowledge base (titles and text of every logged event), newest first.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { searchKnowledge, searchTerm } from '@/lib/admin/k/retrieve'

const UUID = /^[0-9a-f-]{36}$/i

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const q = req.nextUrl.searchParams
  const companyId = q.get('company_id') ?? ''
  const text = searchTerm(q.get('q') ?? '')
  if (!UUID.test(companyId)) return NextResponse.json({ error: 'company_id is required.' }, { status: 400 })
  if (text.length < 2) return NextResponse.json({ error: 'q must be at least 2 characters.' }, { status: 400 })
  try {
    return NextResponse.json({ entries: await searchKnowledge(companyId, text, Math.min(200, Number(q.get('limit') ?? 50) || 50)) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
