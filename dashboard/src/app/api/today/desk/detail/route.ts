/**
 * POST /api/today/desk/detail { owner, companyId, threadIds } → RowDetail
 * One client row's detail, read when the row is opened (substance-server.ts rowDetail): documents,
 * insurer status, timeline, links, suggested projects, parties and the kept Condense per project.
 * The threads are read from the owner's Today list, not taken from the request.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/auth/guard'
import { currentUserEmail } from '@/lib/crm/auth'
import { sbTry, enc } from '@/lib/crm/db'
import { rowDetail } from '@/lib/today/substance-server'
import type { DeskThread } from '@/lib/today/desk'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STAFF = /^[a-z0-9._%+-]+@trade-risksol\.com$/i
type Row = Record<string, any>

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const me = (await currentUserEmail())?.toLowerCase() ?? null
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const owner = String(b?.owner ?? me).toLowerCase()
  if (!STAFF.test(owner)) return NextResponse.json({ error: 'Unknown owner.' }, { status: 400 })
  const companyId = b?.companyId && UUID.test(String(b.companyId)) ? String(b.companyId) : null
  const threadIds = Array.isArray(b?.threadIds) ? (b.threadIds as unknown[]).map(String).filter(id => UUID.test(id)).slice(0, 100) : []
  if (!threadIds.length) return NextResponse.json({ error: 'No threads given.' }, { status: 400 })
  try {
    const inList = `(${threadIds.map(i => `"${i}"`).join(',')})`
    const [listed, threads] = await Promise.all([
      sbTry<Row[]>(`today_threads?owner_email=eq.${enc(owner)}&thread_id=in.${inList}&removed_at=is.null&select=thread_id,side,company_id,added_at,project,project_note`, []),
      sbTry<Row[]>(`email_threads?id=in.${inList}&select=id,subject,display_subject,last_message_at`, []),
    ])
    const by = new Map(threads.map(t => [t.id as string, t]))
    const desk: DeskThread[] = listed.map(r => {
      const t = by.get(r.thread_id) ?? {}
      return {
        threadId: r.thread_id, subject: t.display_subject || t.subject || '(no subject)', side: r.side, companyId: r.company_id ?? companyId, owner,
        lastAt: t.last_message_at ?? null, lastFrom: null, lastInbound: false, messages: 0, addedAt: r.added_at, project: r.project ?? null, projectNote: r.project_note ?? null,
      }
    })
    return NextResponse.json(await rowDetail(me, owner, companyId, desk))
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }) }
}
