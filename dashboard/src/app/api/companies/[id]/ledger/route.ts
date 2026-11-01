/**
 * GET /api/companies/:id/ledger → { company, entries, facts, policies, documents, next_before }
 * The company's knowledge base: every dated event for its group, newest first, with links.
 *   ?before=<ISO time>   page back (pass next_before from the last page)
 *   ?kinds=email_in,claim   only these kinds
 *   ?q=text              search titles and text
 *   ?scope=company       this entity only (default: the whole group)
 *   ?limit=100           at most 500
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { getCompanyKnowledge } from '@/lib/admin/k/retrieve'
import type { LedgerKind } from '@/lib/admin/ledger'

const KINDS = new Set(['email_in', 'email_out', 'email_rebuilt', 'document', 'policy', 'debit_note', 'claim', 'case', 'fact', 'note'])
const UUID = /^[0-9a-f-]{36}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown company.' }, { status: 400 })
  const q = req.nextUrl.searchParams
  const kinds = (q.get('kinds') ?? '').split(',').map(k => k.trim()).filter(Boolean)
  if (kinds.some(k => !KINDS.has(k))) return NextResponse.json({ error: 'Unknown kind.' }, { status: 400 })
  const before = q.get('before')
  if (before && Number.isNaN(Date.parse(before))) return NextResponse.json({ error: 'before must be a date.' }, { status: 400 })
  const limit = Math.min(500, Math.max(1, Number(q.get('limit') ?? 100) || 100))
  try {
    const k = await getCompanyKnowledge(id, { before: before ?? undefined, kinds: kinds as LedgerKind[], query: q.get('q') ?? undefined, limit, scope: q.get('scope') === 'company' ? 'company' : 'group' })
    if (!k) return NextResponse.json({ error: 'Company not found.' }, { status: 404 })
    const last = k.entries[k.entries.length - 1]
    return NextResponse.json({ ...k, next_before: k.entries.length === limit && last ? last.occurred_at : null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
