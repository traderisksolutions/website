/**
 * GET  /api/companies/[id]/actions?status=open,proposed  → the company's actions
 * POST /api/companies/[id]/actions  { title, detail?, kind?, priority?, due_date?, owner_email?, thread_id? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { sb, sbTry, enc }            from '@/lib/crm/db'
import { currentUserEmail }          from '@/lib/crm/auth'
import { ACTION_KINDS }              from '@/lib/crm/types'
import type { CompanyAction }        from '@/lib/crm/types'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const status = (req.nextUrl.searchParams.get('status') ?? 'open,proposed').split(',').map(s => s.trim()).filter(Boolean)
    const actions = await sbTry<CompanyAction[]>(`company_actions?company_id=eq.${enc(id)}&status=in.(${status.join(',')})&select=*&order=due_date.asc.nullslast,priority.asc,created_at.desc&limit=200`, [])
    return NextResponse.json({ actions })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const b = await req.json() as Partial<CompanyAction>
    const title = String(b.title ?? '').trim()
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
    const user = await currentUserEmail()
    const row = {
      company_id: id, title,
      detail: b.detail ? String(b.detail).trim() : null,
      kind: (ACTION_KINDS as readonly string[]).includes(String(b.kind)) ? b.kind : 'general',
      priority: ['high', 'medium', 'low'].includes(String(b.priority)) ? b.priority : 'medium',
      due_date: typeof b.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.due_date) ? b.due_date : null,
      owner_email: b.owner_email ? String(b.owner_email).toLowerCase() : user,
      thread_id: b.thread_id ?? null,
      debit_note_id: b.debit_note_id ?? null,
      source: 'manual', status: 'open', created_by: user,
    }
    const rows = await sb<CompanyAction[]>('company_actions', { method: 'POST', body: JSON.stringify(row) })
    return NextResponse.json({ action: rows[0] })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
