/**
 * The reads and writes behind case memory (memory.ts). Every agent that works a case starts from
 * loadCaseState and ends with recordTurn, so what it learned and how far it read are on the case
 * for the next agent or person. No model is called here.
 *
 *   loadCaseState(caseId, { agent, viewer })   the case, its emails, its notes, where it stands, what `agent` has not read
 *   recordTurn(caseId, agent, turn)            notes kept with their source, emails marked read, one event on the case
 *   addPersonNote(caseId, actor, note)         a person's note: what was said outside the system
 *   setNoteStatus(noteId, actor, status)       a person rejects a note, or puts it back
 *
 * The ledger gets counts for an agent's turn and the words of a person's note; an agent's notes
 * stay on the case, since they may quote a colleague's private thread.
 */
import { sb, sbTry, enc, inChunks } from '@/lib/crm/db'
import { directory, depositEvent } from '@/lib/admin/k/deposit'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { CaseError, caseRow, caseMessages, caseThreadIds } from './sources-store'
import { agentRows, cleanNotes, evidenceNotes, ownWords, resumePoint, unreadFor, isSection, SECTION_NAME, SINGLE, type AgentRow, type CaseMessage, type CleanNote, type Dropped, type Resume, type Section } from './memory'
import type { Side, SourceMessage } from './sources'

type Row = Record<string, any>
const quiet = { Prefer: 'return=minimal' }
const NOTE_COLS = 'id,work_item_id,section,text,quote,message_id,thread_id,source_date,author,author_kind,status,superseded_by,rejected_by,rejected_at,created_at'

export type Note = {
  id: string; section: Section; text: string; quote: string | null; message_id: string | null; thread_id: string | null; source_date: string | null
  author: string; author_kind: 'agent' | 'person'; status: 'current' | 'superseded' | 'rejected'; created_at: string
  /** The source email is in a colleague's mailbox: its words are withheld. */
  private?: boolean
}
export type CaseState = {
  item: { id: string; title: string | null; case_type: string; company_id: string | null; status: string | null; next_action: string | null; owner_email: string | null; closed_at: string | null }
  threads: { id: string; side: Side }[]
  messages: SourceMessage[]
  notes: Note[]
  resume: Resume
  /** One row per agent: how far it has read and what it kept. */
  agents: AgentRow[]
  /** Emails `agent` has not read, oldest first. Every email when no agent is named. */
  unread: SourceMessage[]
}

/** What GET /api/work/:id/memory answers: the case's memory as the screens show it. */
export type CaseMemory = {
  item: CaseState['item']
  threads: CaseState['threads']
  sections: { section: Section; name: string; notes: Note[] }[]
  /** Notes off the brief: set aside by a person, or replaced by a later one. */
  set_aside: Note[]
  resume: Resume
  agents: AgentRow[]
  /** Emails the case reader has not read. */
  new_emails: number
  staff: { email: string; name: string }[]
  emails: { id: string; thread_id: string; sent_at: string | null; from: string | null; subject: string | null; direction: string; new: boolean }[]
}

const asText = (m: SourceMessage) => `${m.subject ?? ''}\n${m.body_text ?? ''}`
const asCaseMessages = (messages: readonly SourceMessage[]): CaseMessage[] => messages.map(m => ({ id: m.id, thread_id: m.thread_id, sent_at: m.sent_at, text: asText(m), own: ownWords(m) }))

export async function loadCaseState(workItemId: string, opts: { agent?: string; viewer?: string | null } = {}): Promise<CaseState> {
  const item = await caseRow(workItemId)
  const { ids, sides } = await caseThreadIds(workItemId)
  const visible = await visibleThreadIds(ids, opts.viewer ?? null)
  const shown = ids.filter(id => visible.has(id))
  const [all, notes, events, reads] = await Promise.all([
    caseMessages(ids),
    sbTry<Row[]>(`work_item_notes?work_item_id=eq.${enc(workItemId)}&select=${NOTE_COLS}&order=created_at.asc&limit=1000`, []),
    sbTry<Row[]>(`work_item_events?work_item_id=eq.${enc(workItemId)}&select=created_at,actor,kind,detail&order=created_at.desc&limit=50`, []),
    sbTry<Row[]>(`work_item_reads?work_item_id=eq.${enc(workItemId)}&select=agent,message_id,read_at&limit=5000`, []),
  ])
  const messages = all.filter(m => visible.has(m.thread_id))
  const mine = new Set(reads.filter(r => r.agent === opts.agent).map(r => r.message_id as string))
  return {
    item: { id: item.id, title: item.title ?? null, case_type: item.case_type, company_id: item.company_id ?? null, status: item.status ?? null, next_action: item.next_action ?? null, owner_email: item.owner_email ?? null, closed_at: item.closed_at ?? null },
    threads: shown.map(id => ({ id, side: sides.get(id) ?? 'other' })),
    messages,
    notes: notes.map(n => (n.thread_id && !visible.has(n.thread_id) ? { ...n, quote: null, private: true } : n) as Note),
    // Counts cover every email on the case, so a hidden thread's unread emails still show as work left.
    resume: resumePoint({ notes: notes as any[], events: events as any[], messages: all, reads: reads as any[], nextAction: item.next_action ?? null }),
    agents: agentRows({ messages: all, reads: reads as any[], notes: notes as any[] }),
    unread: unreadFor(messages, mine),
  }
}

/** Inserts notes once each. In a single-note section the newest stands and the others are superseded. */
async function storeNotes(workItemId: string, kept: readonly CleanNote[]): Promise<Row[]> {
  if (!kept.length) return []
  const made = await sb<Row[]>('work_item_notes?on_conflict=idem_key', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(kept.map(n => ({ work_item_id: workItemId, ...n }))),
  })
  for (const section of SINGLE) {
    const last = [...kept].reverse().find(n => n.section === section)
    if (!last) continue
    const [row] = await sbTry<Row[]>(`work_item_notes?idem_key=eq.${enc(last.idem_key)}&select=id,status&limit=1`, [])
    if (!row || row.status === 'rejected') continue
    // The same step stated again stands again.
    if (row.status !== 'current') await sb(`work_item_notes?id=eq.${enc(row.id)}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ status: 'current', superseded_by: null }) })
    await sb(`work_item_notes?work_item_id=eq.${enc(workItemId)}&section=eq.${section}&status=eq.current&id=neq.${enc(row.id)}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ status: 'superseded', superseded_by: row.id }) })
  }
  return made
}

export type Turn = {
  /** What the agent learned: { section, text, quote, message_id | thread_id }. Kept only with a source found by code. */
  notes?: unknown
  /** Verbatim quotes with their thread, as the case worker returns them: filed as Client said or Insurer said by who wrote the email. */
  evidence?: readonly { thread: string; quote: string }[]
  readMessageIds?: readonly string[]
  /** Every email on these threads counts as read. */
  readThreadIds?: readonly string[]
  detail?: Row
  /** false when the agent already wrote its own event for this turn (the case worker's "read"). */
  event?: boolean
}
export type TurnResult = { kept: number; stored: number; dropped: Dropped[]; read: number; /** Emails this agent had not read before the turn. */ read_new: number; event_id: string | null; /** The turn in words, for the case's history. */ note: string }

export async function recordTurn(workItemId: string, agent: string, turn: Turn): Promise<TurnResult> {
  const { ids, sides } = await caseThreadIds(workItemId)
  const messages = await caseMessages(ids)
  const fromEvidence = turn.evidence?.length ? evidenceNotes(turn.evidence, messages, (await directory()).domainKind, sides) : []
  const { kept, dropped } = cleanNotes([...(Array.isArray(turn.notes) ? turn.notes : []), ...fromEvidence], { workItemId, author: agent, authorKind: 'agent', messages: asCaseMessages(messages) })
  const made = await storeNotes(workItemId, kept)

  const on = new Set(messages.map(m => m.id))
  const threads = new Set(turn.readThreadIds ?? [])
  const read = Array.from(new Set([...(turn.readMessageIds ?? []).filter(id => on.has(id)), ...messages.filter(m => threads.has(m.thread_id)).map(m => m.id)]))
  // Only the rows written come back: the emails this agent read for the first time.
  const fresh = await inChunks(read, 500, c => sb<Row[]>('work_item_reads?on_conflict=work_item_id,agent,message_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(c.map(message_id => ({ work_item_id: workItemId, agent, message_id }))),
  }))

  const bySection = new Map<string, number>()
  for (const n of made) bySection.set(n.section, (bySection.get(n.section) ?? 0) + 1)
  const said = Array.from(bySection).map(([s, n]) => `${n} ${SECTION_NAME[s as Section].toLowerCase()}`).join(', ')
  const note = [made.length ? `${made.length} note${made.length === 1 ? '' : 's'} kept: ${said}` : null, `${read.length} email${read.length === 1 ? '' : 's'} read`].filter(Boolean).join(' · ')
  if (turn.event === false) return { kept: kept.length, stored: made.length, dropped, read: read.length, read_new: fresh.length, event_id: null, note }
  const [ev] = await sb<Row[]>('work_item_events', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    work_item_id: workItemId, kind: 'agent_turn', actor: agent, detail: { ...(turn.detail ?? {}), notes: made.length, dropped: dropped.length, read: read.length, note },
  }) })
  // The ledger hears of a turn only when it left something on the case.
  if (ev?.id && made.length) await depositEvent('work_item_events', ev.id).catch(() => 0)
  return { kept: kept.length, stored: made.length, dropped, read: read.length, read_new: fresh.length, event_id: ev?.id ?? null, note }
}

/** A person's note. It needs no source email; a source it names must be on the case. */
export async function addPersonNote(workItemId: string, actor: string, note: { section: unknown; text: unknown; message_id?: unknown }): Promise<Note> {
  await caseRow(workItemId)
  const { ids } = await caseThreadIds(workItemId)
  const messages = note.message_id ? asCaseMessages(await caseMessages(ids)) : []
  const { kept, dropped } = cleanNotes([note], { workItemId, author: actor, authorKind: 'person', messages })
  if (!kept.length) throw new CaseError(`The note was not kept: ${dropped[0]?.reason ?? 'no text'}.`, 400)
  // The same words in the same section are one note, whoever writes them again.
  if (!(await storeNotes(workItemId, kept)).length) throw new CaseError('This note is already on the case.', 409)
  const [row] = await sb<Row[]>(`work_item_notes?idem_key=eq.${enc(kept[0].idem_key)}&select=${NOTE_COLS}&limit=1`)
  const [ev] = await sb<Row[]>('work_item_events', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    work_item_id: workItemId, kind: 'note', actor, detail: { section: kept[0].section, note: `${SECTION_NAME[kept[0].section]}: ${kept[0].text}` },
  }) })
  if (ev?.id) await depositEvent('work_item_events', ev.id).catch(() => 0)
  return row as Note
}

/** A person rejects a note (it leaves the brief and stays on record) or puts a rejected note back. */
export async function setNoteStatus(workItemId: string, noteId: string, actor: string, status: 'rejected' | 'current'): Promise<void> {
  const [n] = await sb<Row[]>(`work_item_notes?id=eq.${enc(noteId)}&work_item_id=eq.${enc(workItemId)}&select=id,section,status&limit=1`)
  if (!n) throw new CaseError('This note is not on the case.', 404)
  if (!isSection(n.section)) throw new CaseError('This note cannot be changed.', 400)
  const body = status === 'rejected' ? { status, rejected_by: actor, rejected_at: new Date().toISOString() } : { status, rejected_by: null, rejected_at: null, superseded_by: null }
  await sb(`work_item_notes?id=eq.${enc(noteId)}`, { method: 'PATCH', headers: quiet, body: JSON.stringify(body) })
  if (status === 'current' && SINGLE.has(n.section)) await sb(`work_item_notes?work_item_id=eq.${enc(workItemId)}&section=eq.${n.section}&status=eq.current&id=neq.${enc(noteId)}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ status: 'superseded', superseded_by: noteId }) })
  await sb('work_item_events', { method: 'POST', headers: quiet, body: JSON.stringify({ work_item_id: workItemId, kind: status === 'rejected' ? 'note_rejected' : 'note_restored', actor, detail: { note_id: noteId, section: n.section } }) })
}
