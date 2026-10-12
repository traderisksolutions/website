// Human actions on one draft in sales_outreach. Every change is conditional on the status the
// action expects, so a stale page cannot overwrite a newer state, and every change writes an
// audit row.
import 'server-only'
import { enc, sb } from './db'
import { logSalesEvent } from './events'
import { ACTION_FROM, ACTION_TO, approvalBlockers, type DraftAction } from './rules'

type Draft = { id: string; account_id: string; contact_id: string | null; status: string; channel: string | null; email: string | null; version: number | null }

export async function loadDraftForAccount(accountId: string): Promise<Draft | null> {
  const rows = await sb<Draft[]>(`sales_outreach?account_id=eq.${accountId}&select=id,account_id,contact_id,status,channel,email,version&order=version.desc,created_at.desc&limit=1`)
  return rows[0] ?? null
}

/** The contact the draft is addressed to: its own contact_id, else the account's contact
 *  holding the recipient email. */
async function recipientContact(d: Draft): Promise<{ id: string; email_status: string | null; suppressed: boolean } | null> {
  let q = `sales_contacts?account_id=eq.${d.account_id}&select=id,email_status,suppressed&limit=1`
  if (d.contact_id) q += `&id=eq.${d.contact_id}`
  else if (d.email) q += `&email=ilike.${enc(d.email)}`
  else return null
  const rows = await sb<{ id: string; email_status: string | null; suppressed: boolean | null }[]>(q)
  return rows[0] ? { id: rows[0].id, email_status: rows[0].email_status, suppressed: Boolean(rows[0].suppressed) } : null
}

export async function draftBlockers(d: Draft): Promise<string[]> {
  const c = await recipientContact(d)
  return approvalBlockers({ status: d.status, channel: d.channel, email: d.email, contactEmailStatus: c?.email_status ?? null, contactSuppressed: c?.suppressed ?? false })
}

export type ActionResult = { ok: true; status: string } | { ok: false; error: string; status?: number }

export async function applyDraftAction(input: { accountId: string; action: DraftAction; actor: string; subject?: string; body?: string; reason?: string }): Promise<ActionResult> {
  const d = await loadDraftForAccount(input.accountId)
  if (!d) return { ok: false, error: 'This lead has no draft', status: 404 }
  if (!ACTION_FROM[input.action].includes(d.status)) return { ok: false, error: `Draft is ${d.status.replace(/_/g, ' ')}`, status: 409 }

  if (input.action === 'approve') {
    const blockers = await draftBlockers(d)
    if (blockers.length) return { ok: false, error: blockers.join('. '), status: 422 }
  }

  const now = new Date().toISOString()
  let patch: Record<string, unknown>
  if (input.action === 'edit') {
    const subject = (input.subject ?? '').trim().slice(0, 200)
    const body = (input.body ?? '').trim().slice(0, 10_000)
    if (!body) return { ok: false, error: 'The message is empty', status: 422 }
    patch = { subject: subject || null, body, version: (d.version ?? 1) + 1, updated_at: now }
  } else {
    patch = { status: ACTION_TO[input.action], updated_at: now }
    if (input.action === 'approve') patch.approved_at = now
    if (input.action === 'reopen') patch.approved_at = null
  }

  // Only if nobody changed it since we read it.
  const rows = await sb<{ id: string; status: string }[]>(`sales_outreach?id=eq.${d.id}&status=eq.${d.status}&select=id,status`, { method: 'PATCH', body: JSON.stringify(patch) })
  if (!rows.length) return { ok: false, error: 'The draft changed. Reload and try again.', status: 409 }

  const kind = ({ approve: 'approved', reject: 'rejected', reopen: 'reopened', edit: 'edited', mark_replied: 'marked_replied' } as const)[input.action]
  await logSalesEvent({ kind, actor: input.actor, accountId: d.account_id, contactId: d.contact_id, outreachId: d.id, detail: { from: d.status, to: rows[0].status, ...(input.reason ? { reason: input.reason.slice(0, 300) } : {}) } })
  return { ok: true, status: rows[0].status }
}
