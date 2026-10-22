import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { isUuid } from '@/lib/sales/db'
import { applyDraftAction, draftBlockers, loadDraftForAccount } from '@/lib/sales/outreach'
import { workflowStatus } from '@/lib/sales/config'
import type { DraftAction } from '@/lib/sales/rules'

// Approve, reject, reopen, edit or mark replied: the human step between a draft and the sender.
// [id] is the lead (sales_accounts) id.
export const dynamic = 'force-dynamic'
const ACTIONS: DraftAction[] = ['approve', 'reject', 'reopen', 'edit', 'mark_replied']

/** What the drawer needs to draw the controls: can this draft be approved, and if not, why. */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!isUuid(params.id)) return json({ error: 'Not found' }, 404)
  const draft = await loadDraftForAccount(params.id)
  if (!draft) return json({ draft: null, workflow: workflowStatus() })
  const blockers = draft.status === 'pending_approval' ? await draftBlockers(draft) : []
  return json({ draft: { status: draft.status, blockers }, workflow: workflowStatus() })
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!isUuid(params.id)) return json({ error: 'Not found' }, 404)
  const body = (await req.json().catch(() => null)) as { action?: string; subject?: unknown; body?: unknown; reason?: unknown } | null
  const action = body?.action as DraftAction
  if (!ACTIONS.includes(action)) return json({ error: 'Unknown action' }, 400)
  try {
    const result = await applyDraftAction({
      accountId: params.id, action, actor: who.email,
      subject: typeof body?.subject === 'string' ? body.subject : undefined,
      body: typeof body?.body === 'string' ? body.body : undefined,
      reason: typeof body?.reason === 'string' ? body.reason : undefined,
    })
    if (!result.ok) return json({ error: result.error }, result.status ?? 400)
    return json({ status: result.status })
  } catch (e) {
    console.error('draft action failed', action, e instanceof Error ? e.message : e)
    return json({ error: 'Could not update the draft' }, 500)
  }
}
