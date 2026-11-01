/**
 * Computes outbound_origin rows for a window of outgoing mail. Server side.
 *
 * Reads the messages, who they went to, their real files, the thread's company and the drafts
 * sent in the same window, classifies each message and matches it to a draft, then upserts.
 * Idempotent: a row is replaced by its message id, so a recompute of the last 3 days is safe.
 */
import { sb, sbTry, enc, inChunks, isInternal, bareEmail } from '@/lib/crm/db'
import { classify, withMailboxRule, AGENT_MAILBOX, type ClassifyInput } from './classify'
import { matchOrigin, type DraftCandidate } from './origin'
import type { OriginRow } from './metrics'

type Row = Record<string, any>
const PAGE = 1000

/** Every row a PostgREST path yields, 1000 at a time, by id so pages never shift. */
async function all(path: string, select: string, key = 'id'): Promise<Row[]> {
  const out: Row[] = []
  let after = '00000000-0000-0000-0000-000000000000'
  for (;;) {
    const page = await sbTry<Row[]>(`${path}${path.includes('?') ? '&' : '?'}${key}=gt.${after}&select=${select}&order=${key}.asc&limit=${PAGE}`, [])
    out.push(...page)
    if (page.length < PAGE) break
    after = page[page.length - 1][key]
  }
  return out
}

export type ComputeResult = { rows: OriginRow[]; messages: number; byOrigin: Record<string, number> }

/** Classifies and matches every outgoing message sent between `from` and `to` (ISO). Writes when asked. */
export async function computeWindow(from: string, to: string, opts: { write: boolean }): Promise<ComputeResult> {
  const msgs = await all(`email_messages?direction=eq.outbound&deleted_at=is.null&sent_at=gte.${enc(from)}&sent_at=lt.${enc(to)}`, 'id,thread_id,from_address,subject,body_text,sent_at,has_attachments')
  const outgoing = msgs.filter(m => isInternal(m.from_address))
  if (!outgoing.length) return { rows: [], messages: 0, byOrigin: {} }
  const ids = outgoing.map(m => m.id as string)
  const threadIds = Array.from(new Set(outgoing.map(m => m.thread_id as string).filter(Boolean)))

  const [parts, atts, threads, companies] = await Promise.all([
    inChunks(ids, 40, c => sbTry<Row[]>(`email_participants?message_id=in.(${c.join(',')})&deleted_at=is.null&select=message_id,email,role`, [])),
    inChunks(ids, 40, c => sbTry<Row[]>(`email_attachments?message_id=in.(${c.join(',')})&select=message_id,filename,mime_type`, [])),
    inChunks(threadIds, 40, c => sbTry<Row[]>(`email_threads?id=in.(${c.join(',')})&select=id,company_id,category`, [])),
    all('companies', 'id,company_name,kind,domain,domains'),
  ])
  // The message just before each outgoing one, so a short reply to a client's question reads as one.
  const prev = await inChunks(threadIds, 40, c => sbTry<Row[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&sent_at=gte.${enc(new Date(Date.parse(from) - 30 * 86_400_000).toISOString())}&sent_at=lt.${enc(to)}&select=id,thread_id,direction,sent_at&order=sent_at.asc`, []))
  const byThread = new Map<string, Row[]>()
  for (const p of prev) byThread.set(p.thread_id, [...(byThread.get(p.thread_id) ?? []), p])

  const domainKinds = new Map<string, string>()
  const companyById = new Map<string, Row>()
  for (const c of companies) { companyById.set(c.id, c); for (const d of [...(c.domains ?? []), c.domain].filter(Boolean)) domainKinds.set(String(d).toLowerCase(), c.kind) }
  const partsBy = new Map<string, Row[]>(); for (const p of parts) partsBy.set(p.message_id, [...(partsBy.get(p.message_id) ?? []), p])
  const attsBy = new Map<string, Row[]>(); for (const a of atts) attsBy.set(a.message_id, [...(attsBy.get(a.message_id) ?? []), a])
  const threadBy = new Map<string, Row>(threads.map(t => [t.id, t]))

  // body_as_drafted arrives with 20261103_autonomy.sql; until it is applied the draft's current body stands in.
  const keepsFirstBody = (await sbTry<Row[] | null>('ai_drafts?select=body_as_drafted&limit=1', null)) !== null
  const drafts = await all(`ai_drafts?status=eq.sent&sent_at=gte.${enc(new Date(Date.parse(from) - 3_600_000).toISOString())}&sent_at=lt.${enc(new Date(Date.parse(to) + 3_600_000).toISOString())}`, `id,thread_id,sent_at,body,${keepsFirstBody ? 'body_as_drafted,' : ''}to_email,subject,work_item_id`)
  const draftsByThread = new Map<string, DraftCandidate[]>()
  const draftsNoThread: DraftCandidate[] = []
  for (const d of drafts as DraftCandidate[]) { if (d.thread_id) draftsByThread.set(d.thread_id, [...(draftsByThread.get(d.thread_id) ?? []), d]); else draftsNoThread.push(d) }
  // Who approved: a draft sent from the agents' mailbox is attributed to the person who pressed
  // send on its case, read from the case's own event, when the draft belongs to a case.
  const itemIds = Array.from(new Set(drafts.map(d => d.work_item_id as string).filter(Boolean)))
  const sentEvents = await inChunks(itemIds, 40, c => sbTry<Row[]>(`work_item_events?work_item_id=in.(${c.join(',')})&kind=eq.sent&select=work_item_id,actor,created_at&order=created_at.asc`, []))
  const approverByItem = new Map<string, string>()
  for (const e of sentEvents) approverByItem.set(e.work_item_id, String(e.actor).toLowerCase())
  const draftById = new Map(drafts.map(d => [d.id as string, d]))

  const rows: OriginRow[] = []
  const byOrigin: Record<string, number> = {}
  for (const m of outgoing) {
    const people = partsBy.get(m.id) ?? []
    const thread = m.thread_id ? threadBy.get(m.thread_id) : undefined
    const company = thread?.company_id ? companyById.get(thread.company_id) : undefined
    const seq = m.thread_id ? byThread.get(m.thread_id) ?? [] : []
    const i = seq.findIndex(x => x.id === m.id)
    const input: ClassifyInput = {
      subject: m.subject, body_text: m.body_text, from_address: m.from_address, has_attachments: m.has_attachments,
      attachments: attsBy.get(m.id) ?? [], recipients: people.map(p => ({ email: String(p.email), role: String(p.role) })),
      thread: { company_kind: company?.kind ?? null, category: thread?.category ?? null },
      previousInbound: i > 0 && seq[i - 1].direction === 'inbound',
    }
    const to = people.filter(p => p.role === 'to').map(p => String(p.email))
    const o = matchOrigin({ id: m.id, thread_id: m.thread_id, sent_at: m.sent_at, body_text: m.body_text, to }, [...(m.thread_id ? draftsByThread.get(m.thread_id) ?? [] : []), ...draftsNoThread])
    const mailbox = bareEmail(m.from_address)
    const c = withMailboxRule(classify(input, domainKinds), mailbox, o.origin !== 'hand_written')
    byOrigin[o.origin] = (byOrigin[o.origin] ?? 0) + 1
    const item = o.draft_id ? draftById.get(o.draft_id)?.work_item_id as string | undefined : undefined
    const sender = AGENT_MAILBOX.test(mailbox) && item && approverByItem.get(item) ? approverByItem.get(item)! : mailbox
    rows.push({
      message_id: m.id, sent_at: m.sent_at, sender, thread_id: m.thread_id ?? null, company_id: thread?.company_id ?? null, company_name: company?.company_name ?? null,
      origin: o.origin, draft_id: o.draft_id, edit_share: o.edit_share,
      work_class: c.cls, work_sub: c.sub, tier: c.tier, side: c.side, words: c.words, attachments: c.attachments, effort: c.effort, side_channel: c.sideChannel,
    })
  }
  // A dashboard send is sometimes stored twice (the send route's own row and the ingest's copy,
  // a second apart). A draft goes out once, so the later row that matches the same draft is a
  // duplicate and is left out of both sides of the share.
  const seenDraft = new Map<string, OriginRow>()
  for (const r of [...rows].sort((a, b) => a.sent_at.localeCompare(b.sent_at))) {
    if (!r.draft_id) continue
    const first = seenDraft.get(r.draft_id)
    if (first && Math.abs(Date.parse(r.sent_at) - Date.parse(first.sent_at)) < 60_000) { r.tier = 'excluded'; r.work_class = 'excluded'; r.work_sub = 'duplicate_row' }
    else seenDraft.set(r.draft_id, r)
  }
  if (opts.write) {
    const computed_at = new Date().toISOString()
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map(({ company_name: _n, ...r }) => ({ ...r, computed_at }))
      await sb('outbound_origin?on_conflict=message_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(chunk) })
    }
  }
  return { rows, messages: outgoing.length, byOrigin }
}

/** The stored rows for the last `days`, with company names, for the page. */
export async function loadRows(days: number): Promise<OriginRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const rows = await all(`outbound_origin?sent_at=gte.${enc(since)}`, 'message_id,thread_id,company_id,sender,sent_at,origin,draft_id,edit_share,work_class,work_sub,tier,side,words,attachments,effort,side_channel', 'message_id')
  const companyIds = Array.from(new Set(rows.map(r => r.company_id).filter(Boolean)))
  const names = new Map((await inChunks(companyIds as string[], 40, c => sbTry<Row[]>(`companies?id=in.(${c.join(',')})&select=id,company_name`, []))).map(c => [c.id, c.company_name]))
  return rows.map(r => ({ ...r, company_name: r.company_id ? names.get(r.company_id) ?? null : null, edit_share: r.edit_share == null ? null : Number(r.edit_share) })) as OriginRow[]
}
