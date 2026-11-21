/**
 * Today.
 *   GET  /api/today/desk?who=<email|all>              → { rows, owners, me, who, projects }
 *   POST /api/today/desk { action: 'add', threads }    → puts threads on the signed-in person's list
 *   POST /api/today/desk { action: 'remove', owner, threadIds } → takes them off (one thread or a whole client)
 *   POST /api/today/desk { action: 'project', owner, threadIds, project, note } → puts threads under a project of the client (empty: under the client)
 *   POST /api/today/desk { action: 'read', owner, companyId, threadIds }            → one model read of the row
 *   POST /api/today/desk { action: 'draft', owner, companyId, threadIds, stepIds }  → drafts the ticked emails
 *   POST /api/today/desk { action: 'step', owner, companyId, threadIds, stepId, act: 'discard'|'update'|'done' } → one Read action
 *   POST /api/today/desk { action: 'dismiss', threadId }  → a suggestion the person does not want (learning loop)
 *   POST /api/today/desk { action: 'condense', owner, companyId, threadIds, project, projectThreadIds } → labelled facts (one model read; the kept result when the threads have not changed)
 * Read and Draft run only from a person's button (src/lib/ai-gate.ts). Nothing sends here.
 */
import { NextRequest, NextResponse } from 'next/server'
import { currentUserEmail } from '@/lib/crm/auth'
import { addItemsFrom, projectFrom } from '@/lib/today/desk'
import { addThreads, loadDesk, removeThreads, setProject } from '@/lib/today/desk-server'
import { actOnStep, condenseRow, draftRow, readRow } from '@/lib/today/desk-read'
import { dismissSuggestion } from '@/lib/today/learn-server'
import { withStaffOrCron } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STAFF = /^[a-z0-9._%+-]+@trade-risksol\.com$/i
const err = (e: unknown, status = 400) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status })

export const GET = withStaffOrCron(async (req: NextRequest) => {
  const me = (await currentUserEmail())?.toLowerCase() ?? null
  if (!me) return err('Sign in to see Today.', 401)
  const asked = (req.nextUrl.searchParams.get('who') ?? me).toLowerCase()
  const who = asked === 'all' || STAFF.test(asked) ? asked : me
  try {
    const { rows, owners, projects } = await loadDesk(me, who)
    return NextResponse.json({ rows, owners, me, who, projects })
  } catch (e) { return err(e, 500) }
})

export const POST = withStaffOrCron(async (req: NextRequest) => {
  const me = (await currentUserEmail())?.toLowerCase() ?? null
  if (!me) return err('Sign in first.', 401)
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  try {
    if (b?.action === 'add') {
      const parsed = addItemsFrom(b)
      if ('error' in parsed) return err(parsed.error)
      return NextResponse.json({ added: await addThreads(me, parsed.items) })
    }
    if (b?.action === 'dismiss') {
      const threadId = String(b.threadId ?? '')
      if (!UUID.test(threadId)) return err('A thread id is not valid.')
      await dismissSuggestion(me, threadId)
      return NextResponse.json({ ok: true })
    }
    const owner = String(b?.owner ?? me).toLowerCase()
    if (!STAFF.test(owner)) return err('Unknown owner.')
    const threadIds = Array.isArray(b?.threadIds) ? (b.threadIds as unknown[]).map(String).filter(id => UUID.test(id)) : []
    if (!threadIds.length) return err('No threads given.')
    const companyId = b?.companyId && UUID.test(String(b.companyId)) ? String(b.companyId) : null
    if (b?.action === 'remove') {
      // Each person keeps their own list; a colleague's rows are theirs to clear.
      if (owner !== me) return err('Only the owner can take threads off their Today.', 403)
      await removeThreads(owner, threadIds)
      return NextResponse.json({ ok: true })
    }
    if (b?.action === 'project') {
      if (owner !== me) return err('Only the owner can arrange their Today.', 403)
      const parsed = projectFrom(b)
      if ('error' in parsed) return err(parsed.error)
      await setProject(owner, threadIds, parsed.project, parsed.note)
      return NextResponse.json({ ok: true })
    }
    if (b?.action === 'condense') {
      const project = typeof b.project === 'string' && b.project.trim() ? b.project.trim().slice(0, 80) : null
      const scoped = Array.isArray(b.projectThreadIds) ? (b.projectThreadIds as unknown[]).map(String).filter(id => UUID.test(id) && threadIds.includes(id)) : []
      if (project && !scoped.length) return err('No threads in this project.')
      return NextResponse.json({ condensed: await condenseRow(owner, companyId, threadIds, project, project ? scoped : threadIds, me) })
    }
    if (b?.action === 'read') return NextResponse.json({ read: await readRow(owner, companyId, threadIds, me) })
    if (b?.action === 'draft') {
      const stepIds = Array.isArray(b.stepIds) ? (b.stepIds as unknown[]).map(String) : []
      if (!stepIds.length) return err('Tick at least one step.')
      return NextResponse.json({ read: await draftRow(owner, companyId, threadIds, stepIds, me) })
    }
    if (b?.action === 'step') {
      const act = b.act === 'discard' || b.act === 'update' || b.act === 'done' ? b.act : null
      if (!act || !b.stepId) return err('Say which step and what to do.')
      return NextResponse.json({ read: await actOnStep(owner, companyId, threadIds, String(b.stepId), act, me) })
    }
    return err('Unknown action.')
  } catch (e) { return err(e) }
})
