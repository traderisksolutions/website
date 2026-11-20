/**
 * Today's reads and writes: the list of threads each person added (today_threads), the unsent drafts
 * on those threads, and the saved Read per row. Grouping and sorting are pure in desk.ts.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { oneRecipient } from '@/lib/email/recipients'
import { mailboxesByThread, ownersOf, visibleThreadIds } from '@/lib/mail/visibility-server'
import { OPERATIONS_MAILBOX } from '@/lib/mail/visibility'
import { firstNameOf } from '@/lib/mail/ring-fence'
import type { ReadPlan } from '@/lib/chief/read'
import { signalsForAdd } from './learn-server'
import { annualPremium, groupRows, readKey, sideOfAddress, type AddItem, type DeskAttachment, type DeskDraft, type DeskPremium, type DeskRow, type DeskThread } from './desk'

type Row = Record<string, any>

const inList = (ids: readonly string[]) => `(${ids.map(i => `"${i}"`).join(',')})`
const bare = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()
const nameOf = (c: Row | undefined) => c ? [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || null : null
const isTrs = (a: string) => /@trade-risksol\.com$/i.test(a)
/** Whose inbox holds a thread the viewer may not open: the owner's first name (ownersOf), else from the mailbox. */
const privateInbox = (boxes: readonly string[], owner: string | undefined) => {
  const inbox = boxes.map(b => b.toLowerCase()).find(b => b !== OPERATIONS_MAILBOX) ?? ''
  return { inbox, name: owner?.split(/[\s,]+/)[0] || (inbox ? firstNameOf(inbox) : 'a colleague') }
}

const LABEL: Record<string, string> = {
  gb_client_options: 'Employment benefits pricing', CASE_WORK: 'Prepared email', CONVERSATION: 'Reply',
  RENEWAL: 'Renewal email', POLICY_MOVEMENT: 'Movement email', NEXUS: 'Email',
}

export async function insurerDomains(): Promise<Set<string>> {
  return new Set((await insurerNames()).keys())
}

/** Insurer domain → the insurer's name. */
export async function insurerNames(): Promise<Map<string, string>> {
  const rows = await sbTry<Row[]>('companies?kind=eq.insurer&select=company_name,domains', [])
  return new Map(rows.flatMap(r => ((r.domains ?? []) as string[]).map(d => [String(d).toLowerCase(), String(r.company_name ?? '')] as const)).filter(([d]) => !!d))
}

const insurerOf = (email: string, names: ReadonlyMap<string, string>) => {
  const domain = email.toLowerCase().split('@')[1] ?? ''
  for (const [d, n] of names) if (domain === d || domain.endsWith(`.${d}`)) return n || null
  return null
}

const OPEN_LIST = 'today_threads?removed_at=is.null&order=added_at.desc&limit=2000&select=owner_email,thread_id,company_id,side,added_at'

/**
 * The open list, with each thread's project when the columns exist (20261120_today_thread_project.sql).
 * Before that migration is applied the read falls back to the list without projects.
 */
async function openList(): Promise<{ rows: Row[]; projects: boolean }> {
  try { return { rows: await sb<Row[]>(`${OPEN_LIST},project,project_note`), projects: true } }
  catch { return { rows: await sbTry<Row[]>(OPEN_LIST, []), projects: false } }
}

/** Current annual premium per client (desk.ts annualPremium): live policies and their placing debit notes. */
export async function premiums(companyIds: readonly string[]): Promise<Map<string, DeskPremium[]>> {
  const out = new Map<string, DeskPremium[]>()
  if (!companyIds.length) return out
  const policies = await sbTry<Row[]>(`policies?company_id=in.${inList(companyIds)}&lifecycle=in.(live,bound,renewal_due)&select=id,company_id,premium,currency&limit=2000`, [])
  const ids = policies.map(p => p.id as string)
  const notes: Row[] = []
  for (let i = 0; i < ids.length; i += 100) notes.push(...await sbTry<Row[]>(`debit_notes?policy_id=in.${inList(ids.slice(i, i + 100))}&event_type=in.(new_business,renewal)&select=policy_id,gross_amount,currency,issue_date,event_type&limit=2000`, []))
  for (const c of companyIds) {
    const mine = policies.filter(p => p.company_id === c)
    const ps = annualPremium(mine.map(p => ({ id: p.id, premium: p.premium, currency: p.currency })), notes.filter(n => mine.some(p => p.id === n.policy_id)) as never)
    if (ps.length) out.set(c, ps)
  }
  return out
}

/** The rows on Today for one person, or for everyone: only threads the viewer may open (the developer account opens all). */
export async function loadDesk(viewer: string, who: string): Promise<{ rows: DeskRow[]; owners: string[]; projects: boolean }> {
  const { rows: all, projects } = await openList()
  const owners = Array.from(new Set(all.map(r => String(r.owner_email)))).sort()
  const mine = who === 'all' ? all : all.filter(r => r.owner_email === who)
  if (!mine.length) return { rows: [], owners, projects }
  // Each person sees their own mail and the team's; a colleague's private thread is not listed, and
  // only the developer account sees every thread (Jarod, 20 Nov 2026, replacing the ring-fence).
  const allIds = Array.from(new Set(mine.map(r => r.thread_id as string)))
  const [visible, boxes] = await Promise.all([visibleThreadIds(allIds, viewer), mailboxesByThread(allIds)])
  const holders = await ownersOf(allIds.filter(id => !visible.has(id))).catch(() => new Map<string, string>())
  const privateOf = (id: string) => privateInbox(boxes.get(id) ?? [], holders.get(id))
  const listed = mine.filter(r => visible.has(r.thread_id as string))
  const ids = allIds.filter(id => visible.has(id))
  if (!ids.length) return { rows: [], owners, projects }

  const [threads, msgs, insurers] = await Promise.all([
    sbTry<Row[]>(`email_threads?id=in.${inList(ids)}&select=id,subject,display_subject,company_id,last_message_at`, []),
    sbTry<Row[]>(`email_messages?thread_id=in.${inList(ids)}&deleted_at=is.null&select=thread_id,direction,from_address,sent_at&order=sent_at.desc&limit=5000`, []),
    insurerNames(),
  ])
  const domains = new Set(insurers.keys())
  const threadBy = new Map(threads.map(t => [t.id as string, t]))
  const msgsBy = new Map<string, Row[]>()
  for (const m of msgs) msgsBy.set(m.thread_id, [...(msgsBy.get(m.thread_id) ?? []), m])

  const deskThreads: DeskThread[] = listed.map(r => {
    const t = threadBy.get(r.thread_id) ?? {}
    const ms = msgsBy.get(r.thread_id) ?? []
    const last = ms[0]
    return {
      threadId: r.thread_id, subject: t.display_subject || t.subject || '(no subject)', side: r.side, owner: r.owner_email,
      companyId: r.company_id ?? t.company_id ?? null, lastAt: last?.sent_at ?? t.last_message_at ?? null,
      lastFrom: last ? bare(last.from_address) : null, lastInbound: last?.direction === 'inbound' && !isTrs(bare(last.from_address)),
      messages: ms.length, addedAt: r.added_at, project: r.project ?? null, projectNote: r.project_note ?? null,
      private: visible.has(r.thread_id) ? null : privateOf(r.thread_id),
    }
  })

  // Unsent drafts written on a thread, or anchored to one (a new email to an insurer has no thread yet).
  // Requests to insurers from a placement stay with the placement, where their dispatch is recorded.
  const raw = await sbTry<Row[]>(`ai_drafts?or=(thread_id.in.${inList(ids)},context_used->>thread_id.in.${inList(ids)})&status=in.(pending,draft)&deleted_at=is.null&or=(email_type.is.null,email_type.neq.PLACEMENT_REQUEST)&select=id,thread_id,to_email,cc,subject,body,email_type,attachments,work_item_id,context_used,created_at,updated_at&order=created_at.asc&limit=500`, [])
  const fallbackTo = new Map(deskThreads.map(t => [t.threadId, t.lastInbound ? t.lastFrom : null]))
  const shaped = raw.map(d => {
    const ctx = (d.context_used ?? {}) as Row
    const anchor = (ctx.thread_id as string | undefined) ?? null
    const r = oneRecipient(d.to_email || fallbackTo.get(d.thread_id ?? anchor ?? '') || null, d.cc)
    return { d, r, ctx, anchor }
  })
  const emails = Array.from(new Set(shaped.map(x => x.r.to).filter(Boolean)))
  const people = emails.length ? await sbTry<Row[]>(`contacts?email=in.${inList(emails)}&select=email,first_name,last_name&limit=500`, []) : []
  const personBy = new Map(people.map(c => [String(c.email).toLowerCase(), nameOf(c)]))
  const drafts: DeskDraft[] = shaped.filter(({ d, anchor }) => visible.has(d.thread_id ?? anchor ?? '')).map(({ d, r, ctx, anchor }) => ({
    id: d.id, side: sideOfAddress(r.to, domains), threadId: d.thread_id ?? null, anchorThreadId: anchor,
    to: r.to, person: personBy.get(r.to) ?? null, cc: r.cc.join(', '), subject: d.subject ?? '', body: d.body ?? '',
    label: ctx.kind === 'bar_chaser' ? 'Chaser' : ctx.kind === 'read_step' ? String(ctx.title ?? 'Next step') : LABEL[d.email_type as string] ?? 'Email',
    attachments: Array.isArray(d.attachments) ? d.attachments.filter((a: Row) => a?.storage_url) : [],
    removed: [...r.removed, ...((ctx.removed_recipients as string[] | undefined) ?? [])],
    workItemId: d.work_item_id ?? null, createdAt: d.created_at, updatedAt: d.updated_at ?? null,
    insurer: insurerOf(r.to, insurers),
    ...(visible.has(d.thread_id ?? anchor ?? '') ? {} : { private: privateOf(d.thread_id ?? anchor ?? ''), body: '', attachments: [] }),
  }))

  const companyIds = Array.from(new Set(deskThreads.map(t => t.companyId).filter((x): x is string => !!x)))
  // The premium, renewal and the rest of a client's facts load after the rows (/api/today/desk/facts).
  const companies = companyIds.length ? await sbTry<Row[]>(`companies?id=in.${inList(companyIds)}&select=id,company_name`, []) : []
  const names = new Map(companies.map(c => [c.id as string, c.company_name as string]))

  const rows0 = groupRows(deskThreads, [], names, new Map())
  const keys = rows0.map(r => readKey(r.key))
  const saved = keys.length ? await sbTry<Row[]>(`app_settings?key=in.${inList(keys)}&select=key,value`, []) : []
  const reads = new Map<string, ReadPlan>()
  for (const s of saved) { try { reads.set(String(s.key).slice('today_read:'.length), JSON.parse(s.value)) } catch { /* a bad entry reads as none */ } }
  const rows = groupRows(deskThreads, drafts, names, reads)
  return { rows, owners, projects }
}

/**
 * Puts threads under a project of their client on the owner's Today (empty name: back under the
 * client). Needs 20261120_today_thread_project.sql; until it is applied this says so.
 */
export async function setProject(owner: string, threadIds: readonly string[], project: string | null, note: string | null): Promise<void> {
  if (!threadIds.length) return
  try {
    await sb(`today_threads?owner_email=eq.${enc(owner)}&thread_id=in.${inList(threadIds)}&removed_at=is.null`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ project, project_note: note }),
    })
  } catch (e) {
    if (/project/.test(String(e)) && /42703|does not exist/.test(String(e))) throw new Error('Projects are not switched on yet: the database change is waiting to be applied.')
    throw e
  }
}

/** Replaces an unsent draft's attachments with a list already made safe (desk.ts attachmentsFrom). */
export async function setDraftFiles(draftId: string, files: readonly DeskAttachment[]): Promise<DeskAttachment[]> {
  const [d] = await sb<Row[]>(`ai_drafts?id=eq.${enc(draftId)}&select=id,status,deleted_at&limit=1`)
  if (!d || d.deleted_at || !['pending', 'draft'].includes(d.status)) throw new Error('This draft was already sent or discarded.')
  await sb(`ai_drafts?id=eq.${enc(draftId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ attachments: files, updated_at: new Date().toISOString() }) })
  return [...files]
}

/** Puts threads on a person's Today. Adding a removed thread again brings it back. */
export async function addThreads(owner: string, items: readonly AddItem[]): Promise<number> {
  const now = new Date().toISOString()
  // What was true of each thread before it joined: the learning loop's positives (learn.ts).
  const signals = await signalsForAdd(owner, items.map(i => i.threadId)).catch(() => new Map<string, string[]>())
  await sb('today_threads?on_conflict=owner_email,thread_id', {
    method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify(items.map(i => ({ owner_email: owner, thread_id: i.threadId, company_id: i.companyId, side: i.side, added_at: now, removed_at: null, signals: signals.get(i.threadId) ?? [] }))),
  })
  return items.length
}

/** Takes threads off a person's Today. The threads and their drafts stay where they are. */
export async function removeThreads(owner: string, threadIds: readonly string[]): Promise<void> {
  if (!threadIds.length) return
  await sb(`today_threads?owner_email=eq.${enc(owner)}&thread_id=in.${inList(threadIds)}&removed_at=is.null`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ removed_at: new Date().toISOString() }),
  })
}

/** The threads of one row, for the Read: the person's own list, client by client. */
export async function rowThreads(owner: string, companyId: string | null, threadIds: readonly string[]): Promise<Row[]> {
  const q = companyId ? `company_id=eq.${enc(companyId)}` : `thread_id=in.${inList(threadIds)}`
  return sbTry<Row[]>(`today_threads?owner_email=eq.${enc(owner)}&${q}&removed_at=is.null&select=thread_id,side,company_id`, [])
}
