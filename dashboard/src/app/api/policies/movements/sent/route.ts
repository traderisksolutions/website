/** POST /api/policies/movements/sent { draft_id, gmail_thread_id?, gmail_message_id? } → { ok } — called after the UI sends a POLICY_MOVEMENT draft. */
import { NextRequest, NextResponse } from 'next/server'
import * as store from '@/lib/placement/store'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import { markMovementsSent } from '@/lib/policies/members'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const b = await readBody<{ draft_id?: unknown; gmail_thread_id?: unknown; gmail_message_id?: unknown }>(req)
  if (!b || !isUuid(b.draft_id)) return fail('draft_id must be a uuid')
  try {
    const [draft] = await store.pendingDrafts([b.draft_id])
    const sent = await markMovementsSent(b.draft_id)
    if (sent.length) {
      await store.log({ company_id: sent[0].company_id, kind: 'sent', actor, text: `Endorsement request sent${draft?.to_email ? ` to ${draft.to_email}` : ''}: ${sent.length} movement${sent.length === 1 ? '' : 's'}`,
        thread_id: draft?.thread_id ?? null, detail: { ai_draft_id: b.draft_id, policy_id: sent[0].policy_id, gmail_thread_id: typeof b.gmail_thread_id === 'string' ? b.gmail_thread_id : null, gmail_message_id: typeof b.gmail_message_id === 'string' ? b.gmail_message_id : null } })
    }
    return NextResponse.json({ ok: true, movements: sent.length })
  } catch (e) {
    return errorResponse(e)
  }
}
