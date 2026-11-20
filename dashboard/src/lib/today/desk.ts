/**
 * Today (19 Nov 2026): the threads a person put on their list, grouped by client, with the unsent
 * drafts on those threads split into To client and To insurer. A person clears the list by editing
 * and sending; nothing joins the list unless a person adds it. Pure; the reads are in desk-server.ts.
 */
import type { ReadPlan, ReadStep } from '@/lib/chief/read'

export type DeskSide = 'client' | 'insurer'

export type DeskThread = {
  threadId: string; subject: string; side: DeskSide; companyId: string | null; owner: string
  lastAt: string | null; lastFrom: string | null; lastInbound: boolean; messages: number; addedAt: string
  /** The project under the client this thread belongs to (today_threads.project), and its short description. */
  project?: string | null; projectNote?: string | null
  /** Set when the viewer may not open this thread's mail (ring-fence): whose inbox holds it. */
  private?: PrivateInbox | null
}
/** Whose private inbox holds a thread: the address and the first name. */
export type PrivateInbox = { inbox: string; name: string }
export type DeskAttachment = { filename: string; mime_type?: string | null; storage_url: string }
export type DeskDraft = {
  id: string; side: DeskSide; threadId: string | null; anchorThreadId: string | null
  to: string; person: string | null; cc: string; subject: string; body: string; label: string
  attachments: DeskAttachment[]; removed: string[]; workItemId: string | null; createdAt: string
  /** Last change to the draft (an edit, a save, a rewrite). */
  updatedAt?: string | null
  /** The insurer by name, for an email to an insurer. */
  insurer?: string | null
  /** Set when the draft's thread lives in a colleague's private inbox: the text is not sent to this viewer. */
  private?: PrivateInbox | null
}
export type DeskPremium = { currency: string; amount: number }
export type DeskRow = {
  key: string; owner: string; companyId: string | null; companyName: string
  threads: DeskThread[]; drafts: DeskDraft[]; read: ReadPlan | null; lastAt: string | null
  /** The client's current annual premium, per currency; empty when no premium or debit note is on file. */
  premium?: DeskPremium[]
}

/** Whom an address belongs to: an insurer when its domain is an insurer's, else the client. */
export function sideOfAddress(email: string | null | undefined, insurerDomains: ReadonlySet<string>): DeskSide {
  const domain = String(email ?? '').trim().toLowerCase().split('@')[1] ?? ''
  if (!domain) return 'client'
  for (const d of insurerDomains) if (domain === d || domain.endsWith(`.${d}`)) return 'insurer'
  return 'client'
}

/** One row per owner and client. A thread with no client stands alone. */
export function rowKey(owner: string, companyId: string | null, threadId: string): string {
  return companyId ? `${owner}|${companyId}` : `${owner}|thread:${threadId}`
}

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

/** Threads and drafts into rows. A draft belongs to the row holding its thread or its anchor thread. */
export function groupRows(
  threads: readonly DeskThread[], drafts: readonly DeskDraft[],
  names: ReadonlyMap<string, string>, reads: ReadonlyMap<string, ReadPlan>,
): DeskRow[] {
  const rows = new Map<string, DeskRow>()
  const rowOfThread = new Map<string, DeskRow[]>()
  for (const t of threads) {
    const key = rowKey(t.owner, t.companyId, t.threadId)
    let row = rows.get(key)
    if (!row) {
      row = { key, owner: t.owner, companyId: t.companyId, companyName: (t.companyId && names.get(t.companyId)) || t.subject || 'No client', threads: [], drafts: [], read: reads.get(key) ?? null, lastAt: null }
      rows.set(key, row)
    }
    row.threads.push(t)
    row.lastAt = later(row.lastAt, t.lastAt)
    rowOfThread.set(t.threadId, [...(rowOfThread.get(t.threadId) ?? []), row])
  }
  for (const d of drafts) {
    // On Everyone, two people can hold the same thread: the draft shows on each of their rows.
    const owners = rowOfThread.get(d.threadId ?? '') ?? rowOfThread.get(d.anchorThreadId ?? '') ?? []
    for (const row of owners) if (!row.drafts.some(x => x.id === d.id)) row.drafts.push(d)
  }
  for (const r of rows.values()) {
    r.threads.sort((a, b) => String(b.lastAt ?? '').localeCompare(String(a.lastAt ?? '')))
    r.drafts.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  return sortRows([...rows.values()])
}

/** Most drafts to send first; then the client who wrote last waits longest; then latest activity. */
function sortRows(rows: DeskRow[]): DeskRow[] {
  const waiting = (r: DeskRow) => r.threads.some(t => t.lastInbound)
  return [...rows].sort((a, b) =>
    b.drafts.length - a.drafts.length
    || Number(waiting(b)) - Number(waiting(a))
    || String(b.lastAt ?? '').localeCompare(String(a.lastAt ?? '')))
}

/** By email: every unsent draft across the rows once, oldest first, each with its client. */
export function emailList(rows: readonly DeskRow[]): (DeskDraft & { rowKey: string; companyName: string })[] {
  const seen = new Set<string>()
  const out: (DeskDraft & { rowKey: string; companyName: string })[] = []
  for (const r of rows) for (const d of r.drafts) {
    if (seen.has(d.id)) continue
    seen.add(d.id)
    out.push({ ...d, rowKey: r.key, companyName: r.companyName })
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** The app_settings key a row's read is kept under. */
export const readKey = (key: string) => `today_read:${key}`

export type AddItem = { threadId: string; side: DeskSide; companyId: string | null }

/** An add request made safe: known sides, uuids, one entry per thread. Returns an error in words. */
export function addItemsFrom(body: unknown): { items: AddItem[] } | { error: string } {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const list = (body as { threads?: unknown })?.threads
  if (!Array.isArray(list) || !list.length) return { error: 'Pick at least one thread.' }
  if (list.length > 50) return { error: 'Add at most 50 threads at a time.' }
  const items = new Map<string, AddItem>()
  for (const raw of list as Record<string, unknown>[]) {
    const threadId = String(raw?.threadId ?? '')
    if (!UUID.test(threadId)) return { error: 'A thread id is not valid.' }
    if (raw.side !== 'client' && raw.side !== 'insurer') return { error: 'Say for each thread whether it is with the client or an insurer.' }
    const companyId = raw.companyId == null || raw.companyId === '' ? null : String(raw.companyId)
    if (companyId && !UUID.test(companyId)) return { error: 'A client id is not valid.' }
    items.set(threadId, { threadId, side: raw.side, companyId })
  }
  return { items: [...items.values()] }
}

// ── Threads, projects, folded summary (20 Nov 2026) ──────────────────────────────────────────────

/** The thread a draft belongs to: its own, else the thread it was anchored to. */
export const draftThread = (d: Pick<DeskDraft, 'threadId' | 'anchorThreadId'>): string | null => d.threadId ?? d.anchorThreadId ?? null

/** The Inbox link of a thread. */
export const threadHref = (threadId: string) => `/engagement?thread=${encodeURIComponent(threadId)}`

export type ProjectGroup = { project: string | null; note: string | null; threads: DeskThread[]; drafts: DeskDraft[] }

const cleanProject = (p: string | null | undefined) => String(p ?? '').replace(/\s+/g, ' ').trim() || null
const sameProject = (a: string | null, b: string | null) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

/**
 * A row's threads and drafts by project. Threads without a project sit under the client directly
 * (project null, first); then each project, the most recently active first. A draft goes with its
 * thread; a draft whose thread is not on the row goes under the client. Project names match without case.
 */
export function groupProjects(row: Pick<DeskRow, 'threads' | 'drafts'>): ProjectGroup[] {
  const groups: ProjectGroup[] = [{ project: null, note: null, threads: [], drafts: [] }]
  const groupOf = new Map<string, ProjectGroup>()
  for (const t of row.threads) {
    const name = cleanProject(t.project)
    let g = groups.find(x => sameProject(x.project, name))
    if (!g) { g = { project: name, note: null, threads: [], drafts: [] }; groups.push(g) }
    g.threads.push(t)
    if (!g.note && name) g.note = cleanProject(t.projectNote)
    groupOf.set(t.threadId, g)
  }
  for (const d of row.drafts) (groupOf.get(draftThread(d) ?? '') ?? groups[0]).drafts.push(d)
  const lastOf = (g: ProjectGroup) => g.threads.reduce((m, t) => (String(t.lastAt ?? '') > m ? String(t.lastAt ?? '') : m), '')
  const named = groups.slice(1).sort((a, b) => lastOf(b).localeCompare(lastOf(a)) || String(a.project).localeCompare(String(b.project)))
  return [groups[0], ...named].filter(g => g.project !== null || g.threads.length || g.drafts.length)
}

/** Every project name on a row, for the picker. */
export function projectNames(row: Pick<DeskRow, 'threads'>): string[] {
  const out: string[] = []
  for (const t of row.threads) { const p = cleanProject(t.project); if (p && !out.some(x => sameProject(x, p))) out.push(p) }
  return out.sort((a, b) => a.localeCompare(b))
}

export type FoldLine = { party: string; project: string | null; todo: string; more: number; threadId: string | null }

/**
 * Folded row, one side: per project group, who the email is to, the project's description (else its
 * name), and the to-do: the first unsent draft's subject. When no draft is on that side, the first
 * open Read step for that side. Empty when nothing waits: the side shows blank.
 */
export function foldSummary(row: DeskRow, side: DeskSide): FoldLine[] {
  const lines: FoldLine[] = []
  for (const g of groupProjects(row)) {
    const ds = g.drafts.filter(d => d.side === side)
    if (!ds.length) continue
    const d = ds[0]
    lines.push({
      party: side === 'client' ? row.companyName : d.insurer || d.person || d.to,
      project: g.project ? g.note || g.project : null, todo: d.subject || '(no subject)', more: ds.length - 1, threadId: draftThread(d),
    })
  }
  if (lines.length) return lines
  const step = (row.read?.steps ?? []).find(s => s.party === side && (s.status === 'proposed' || s.status === 'todo'))
  if (!step) return []
  return [{ party: side === 'client' ? row.companyName : step.insurer || step.to?.name || step.to?.email || 'Insurer', project: null, todo: step.title, more: 0, threadId: threadForStep(step, row) }]
}

const domainOf = (a: string | null | undefined) => String(a ?? '').toLowerCase().split('@')[1] ?? ''

/**
 * The thread a Read step is about: its draft's thread when drafted; a client step, the client thread
 * most recently active; an insurer step, the insurer thread whose last sender shares the recipient's
 * domain, else the first insurer thread. Null when the row has none.
 */
export function threadForStep(step: Pick<ReadStep, 'draftId' | 'party' | 'to'>, row: Pick<DeskRow, 'threads' | 'drafts'>): string | null {
  const d = step.draftId ? row.drafts.find(x => x.id === step.draftId) : undefined
  if (d && draftThread(d)) return draftThread(d)
  const side: DeskSide = step.party === 'insurer' ? 'insurer' : 'client'
  const on = row.threads.filter(t => t.side === side).sort((a, b) => String(b.lastAt ?? '').localeCompare(String(a.lastAt ?? '')))
  if (side === 'insurer' && step.to?.email) {
    const hit = on.find(t => t.lastFrom && domainOf(t.lastFrom) === domainOf(step.to!.email))
    if (hit) return hit.threadId
  }
  return on[0]?.threadId ?? (step.party === 'internal' ? row.threads[0]?.threadId ?? null : null)
}

/** A draft changed after it was written: the time to show beside "Updated", else null. */
export function editedAt(d: Pick<DeskDraft, 'createdAt' | 'updatedAt'>): string | null {
  if (!d.updatedAt) return null
  return new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime() > 5_000 ? d.updatedAt : null
}

// ── Attachments ──────────────────────────────────────────────────────────────────────────────────

export type ThreadFile = { id: string; filename: string; mime_type?: string | null; storage_url: string; created_at?: string | null; threadId: string }

/** Census, schedule, quotation and similar names come first: those are what an email to the other side carries. */
const KEY_FILE = /(census|member|employee|staff list|schedule|quot|proposal|renewal|debit|invoice|premium|policy|endorse|claim|plan|benefit|rate)/i

/**
 * Files to offer on an email: one per filename, key documents first, then the draft's own thread,
 * then newest first. Files already attached are left out.
 */
export function suggestFiles(files: readonly ThreadFile[], ownThread: string | null, attached: readonly DeskAttachment[]): ThreadFile[] {
  const have = new Set(attached.map(a => a.filename.toLowerCase()))
  const byName = new Map<string, ThreadFile>()
  for (const f of files) {
    const k = f.filename.toLowerCase()
    if (have.has(k)) continue
    const cur = byName.get(k)
    if (!cur || String(f.created_at ?? '') > String(cur.created_at ?? '')) byName.set(k, f)
  }
  return [...byName.values()].sort((a, b) =>
    Number(KEY_FILE.test(b.filename)) - Number(KEY_FILE.test(a.filename))
    || Number(b.threadId === ownThread) - Number(a.threadId === ownThread)
    || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
}

/** Where a browser opens an attached file: an email file through the documents route, a Drive file on Drive, a URL as itself. */
export function previewHref(a: Pick<DeskAttachment, 'storage_url'> & { document_id?: string | null }): string | null {
  const ref = a.storage_url ?? ''
  if (a.document_id) return `/api/documents/${encodeURIComponent(a.document_id)}/file`
  if (ref.startsWith('gmail:')) return `/api/engagement/attachments/${encodeURIComponent(ref.slice(6))}/download`
  if (ref.startsWith('drivefile:')) return `https://drive.google.com/file/d/${encodeURIComponent(ref.slice(10))}/view`
  if (/^https:\/\//.test(ref) && !/\/storage\/v1\//.test(ref)) return ref
  return null
}

const REF = /^(gmail:[0-9a-f-]{36}|drivefile:[\w-]{10,200}|https:\/\/[^\s]{8,2000})$/i
export const MAX_ATTACHMENTS = 10

/** A draft's new attachment list made safe: the shape /api/email/send reads, known references only, one per filename, at most ten. */
export function attachmentsFrom(raw: unknown): { attachments: DeskAttachment[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: 'attachments must be a list.' }
  const out: DeskAttachment[] = []
  for (const a of raw as Record<string, unknown>[]) {
    const filename = String(a?.filename ?? '').replace(/[\r\n"]/g, '').trim().slice(0, 200)
    const storage_url = String(a?.storage_url ?? '').trim()
    if (!filename) return { error: 'A file has no name.' }
    if (!REF.test(storage_url) || /\/storage\/v1\//.test(storage_url)) return { error: `${filename} has no stored file to attach.` }
    const mime = a?.mime_type == null || a.mime_type === '' ? null : String(a.mime_type).slice(0, 120)
    if (!out.some(x => x.filename.toLowerCase() === filename.toLowerCase())) out.push({ filename, mime_type: mime, storage_url })
  }
  if (out.length > MAX_ATTACHMENTS) return { error: `At most ${MAX_ATTACHMENTS} attachments on one email.` }
  return { attachments: out }
}

/** A project request made safe: a name of at most 80 characters (empty clears it), a description of at most 160. */
export function projectFrom(body: unknown): { project: string | null; note: string | null } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  if (b.project != null && typeof b.project !== 'string') return { error: 'The project name must be text.' }
  if (b.note != null && typeof b.note !== 'string') return { error: 'The description must be text.' }
  const project = cleanProject(b.project as string | null)
  if (project && project.length > 80) return { error: 'Keep the project name under 80 characters.' }
  const note = project ? cleanProject(b.note as string | null) : null
  if (note && note.length > 160) return { error: 'Keep the description under 160 characters.' }
  return { project, note }
}

// ── Participants ─────────────────────────────────────────────────────────────────────────────────

export type Participant = { name: string | null; email: string }

/** "Name <email>" for each, the first `max` shown, the rest counted: "+3". */
export function participantsLine(ps: readonly Participant[], max = 3): { text: string; more: number; full: string } {
  const fmt = (p: Participant) => (p.name && p.name.toLowerCase() !== p.email.toLowerCase() ? `${p.name} <${p.email}>` : p.email)
  return { text: ps.slice(0, max).map(fmt).join(', '), more: Math.max(0, ps.length - max), full: ps.map(fmt).join(', ') }
}

// ── Premium ──────────────────────────────────────────────────────────────────────────────────────

export type PremiumPolicy = { id: string; premium: number | string | null; currency: string | null }
export type PremiumNote = { policy_id: string | null; gross_amount: number | string | null; currency: string | null; issue_date: string | null; event_type: string | null }

const PLACING = new Set(['new_business', 'renewal'])
const amt = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }

/**
 * A client's current annual premium: for each live policy, the gross of its latest new-business or
 * renewal debit note, else the policy's premium. Summed per currency. Empty when no figure is on file.
 */
export function annualPremium(policies: readonly PremiumPolicy[], notes: readonly PremiumNote[]): DeskPremium[] {
  const sums = new Map<string, number>()
  for (const p of policies) {
    const latest = notes.filter(n => n.policy_id === p.id && PLACING.has(String(n.event_type)) && amt(n.gross_amount) != null)
      .sort((a, b) => String(b.issue_date ?? '').localeCompare(String(a.issue_date ?? '')))[0]
    const value = latest ? amt(latest.gross_amount) : amt(p.premium)
    if (value == null) continue
    const ccy = String((latest ? latest.currency : p.currency) || 'SGD').toUpperCase()
    sums.set(ccy, (sums.get(ccy) ?? 0) + value)
  }
  return [...sums].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount)
}
