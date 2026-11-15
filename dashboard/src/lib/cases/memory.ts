/**
 * Case memory: what every agent and person learned on a case, kept so the next turn starts where
 * the last one stopped.
 *
 * A note is one statement in one section of the case brief. An agent's note is kept only with its
 * source: an email on the case's picked threads and words found in that email by code. When the
 * agent names the thread and the words but not the email, code finds the email. A person's note
 * needs no source. Reads record which emails each agent has been through; `unreadFor` is what its
 * next turn takes. There is one current next step: a new one supersedes the last.
 *
 * Pure. Tested in __tests__/memory.test.ts. The reads and writes are in memory-store.ts.
 */
import { createHash } from 'node:crypto'

export const SECTIONS = ['client_said', 'insurer_said', 'wish', 'risk', 'success_factor', 'open_question', 'next_step', 'decision', 'handover'] as const
export type Section = typeof SECTIONS[number]
export const SECTION_NAME: Record<Section, string> = {
  client_said: 'Client said', insurer_said: 'Insurer said', wish: 'Client wish list', risk: 'Known risks', success_factor: 'Success factors',
  open_question: 'Open questions', next_step: 'Next step', decision: 'Decisions', handover: 'Hand-over',
}
export const isSection = (v: unknown): v is Section => typeof v === 'string' && (SECTIONS as readonly string[]).includes(v)
/** Sections that hold one current note: a new one supersedes the last. */
export const SINGLE: ReadonlySet<Section> = new Set<Section>(['next_step'])

export const TEXT_MAX = 600
export const QUOTE_MAX = 240

export type CaseMessage = { id: string; thread_id: string; sent_at: string | null; text: string }
export type CleanNote = {
  section: Section; text: string; quote: string | null; message_id: string | null; thread_id: string | null
  source_date: string | null; author: string; author_kind: 'agent' | 'person'; idem_key: string
}
export type Dropped = { text: string; reason: 'no section' | 'no text' | 'no source email' | 'email not on this case' | 'words not found in the email' }

const flat = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
/** Whether the quoted words are in the text, ignoring case, line breaks and curly quotes. */
export const quoted = (quote: string, text: string) => { const q = flat(quote); return q.length >= 8 && flat(text).includes(q) }

export const noteKey = (workItemId: string, section: string, text: string, messageId: string | null) =>
  createHash('sha1').update(`${workItemId}|${section}|${flat(text)}|${messageId ?? ''}`).digest('hex')

/**
 * Bounds what is stored. `messages` are the emails on the case's picked threads: nothing outside
 * them can be cited.
 */
export function cleanNotes(raw: unknown, ctx: { workItemId: string; author: string; authorKind: 'agent' | 'person'; messages: readonly CaseMessage[] }): { kept: CleanNote[]; dropped: Dropped[] } {
  const kept: CleanNote[] = []; const dropped: Dropped[] = []
  const byId = new Map(ctx.messages.map(m => [m.id, m]))
  const seen = new Set<string>()
  for (const r of Array.isArray(raw) ? raw : []) {
    const n = (r ?? {}) as Record<string, unknown>
    const text = String(n.text ?? '').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX)
    if (!isSection(n.section)) { dropped.push({ text, reason: 'no section' }); continue }
    if (!text) { dropped.push({ text, reason: 'no text' }); continue }
    const quote = typeof n.quote === 'string' && n.quote.trim() ? n.quote.trim().slice(0, QUOTE_MAX) : null
    let msg = typeof n.message_id === 'string' ? byId.get(n.message_id) ?? null : null
    const named = typeof n.message_id === 'string' && !!n.message_id
    // The agent named the thread and the words: the email is the one that holds them.
    if (!msg && !named && quote && typeof n.thread_id === 'string') msg = ctx.messages.find(m => m.thread_id === n.thread_id && quoted(quote, m.text)) ?? null
    if (ctx.authorKind === 'agent') {
      if (!quote || (!named && typeof n.thread_id !== 'string')) { dropped.push({ text, reason: 'no source email' }); continue }
      if (!msg) { dropped.push({ text, reason: named ? 'email not on this case' : 'words not found in the email' }); continue }
      if (!quoted(quote, msg.text)) { dropped.push({ text, reason: 'words not found in the email' }); continue }
    } else if (named && !msg) { dropped.push({ text, reason: 'email not on this case' }); continue }
    const idem_key = noteKey(ctx.workItemId, n.section, text, msg?.id ?? null)
    if (seen.has(idem_key)) continue
    seen.add(idem_key)
    kept.push({
      section: n.section, text, quote: msg ? quote : null, message_id: msg?.id ?? null, thread_id: msg?.thread_id ?? null,
      source_date: msg?.sent_at ? msg.sent_at.slice(0, 10) : null, author: ctx.author, author_kind: ctx.authorKind, idem_key,
    })
  }
  return { kept, dropped }
}

/** The emails an agent has not been through yet, oldest first. */
export function unreadFor<T extends { id: string; sent_at: string | null }>(messages: readonly T[], read: ReadonlySet<string>): T[] {
  return messages.filter(m => !read.has(m.id)).sort((a, b) => String(a.sent_at ?? '').localeCompare(String(b.sent_at ?? '')))
}

export type Resume = {
  /** The last thing recorded on the case, by anyone. */
  last: { at: string; actor: string | null; kind: string } | null
  next_step: string | null
  open_questions: string[]
  handover: string | null
  /** Emails each agent has still to read, by agent. `new` counts emails no agent has read. */
  unread: Record<string, number>
}

/** Where the case stands for whoever picks it up: the last event, the standing next step, open questions and unread email counts. */
export function resumePoint(i: {
  notes: readonly { section: string; text: string; status: string; created_at: string }[]
  events: readonly { created_at: string; actor: string | null; kind: string }[]
  messages: readonly { id: string }[]
  reads: readonly { agent: string; message_id: string }[]
  nextAction?: string | null
}): Resume {
  const current = i.notes.filter(n => n.status === 'current').sort((a, b) => b.created_at.localeCompare(a.created_at))
  const last = [...i.events].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  const on = new Set(i.messages.map(m => m.id))
  const byAgent = new Map<string, Set<string>>()
  const any = new Set<string>()
  for (const r of i.reads) if (on.has(r.message_id)) { byAgent.set(r.agent, (byAgent.get(r.agent) ?? new Set()).add(r.message_id)); any.add(r.message_id) }
  const unread: Record<string, number> = { new: on.size - any.size }
  for (const [agent, ids] of byAgent) unread[agent] = on.size - ids.size
  return {
    last: last ? { at: last.created_at, actor: last.actor, kind: last.kind } : null,
    next_step: current.find(n => n.section === 'next_step')?.text ?? i.nextAction ?? null,
    open_questions: current.filter(n => n.section === 'open_question').map(n => n.text),
    handover: current.find(n => n.section === 'handover')?.text ?? null,
    unread,
  }
}
