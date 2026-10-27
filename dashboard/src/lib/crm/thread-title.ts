/**
 * The housekeeping agent's title for a thread: at most 60 characters naming the matter — the
 * client or counterparty and the policy line or topic — written to email_threads.display_subject.
 * Display reads that first (threadTitle in ./subject) and falls back to the cleaned subject.
 *
 * Two callers: /api/email/classify after each inbound message (new thread, or the subject moved),
 * and /api/cron/thread-titles for threads that predate the column. Both go through titleThread.
 */
import { callGemini } from '@/lib/ai-call'
import { GEMINI_LITE } from '@/lib/gemini-models'
import { logError } from '@/lib/error-log'
import { sb, sbTry, enc } from './db'
import { cleanSubject } from './subject'

export const TITLE_MAX = 60

export type TitleThreadRow = {
  id: string
  subject: string | null
  display_subject: string | null
  company_id: string | null
  companies: { company_name: string | null } | null
}
type MsgRow = { id: string; subject: string | null; body_text: string | null; direction: string; sent_at: string | null }

export const TITLE_THREAD_SELECT = 'id,subject,display_subject,company_id,companies(company_name)'

const SYSTEM = `You write the one-line title a Singapore insurance broker's inbox shows for an email thread.
Rules:
- At most ${TITLE_MAX} characters. Plain words. English.
- Name the matter: the client or counterparty, then the policy line or topic. Pattern "<Party> — <line or topic> (<insurer or scheme>)" when the parts are known, e.g. "Beijing Gas — SP claim (IHP)" or "Talent Trader — group benefits quotation".
- Drop reply and forward prefixes, "(TRS)", reference codes that do not identify the matter, and greetings.
- No exclamation marks. Title case only for names; everything else lower case.
- Never invent a party or a policy line that the text does not state. If the subject already names the matter, shorten it rather than rewrite it.
Return only the title, nothing else.`

/** Trim the model's answer to the house rules. Pure; exported for the test. */
export function sanitiseTitle(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = raw.split('\n').map(l => l.trim()).find(Boolean) ?? ''
  s = s.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '').replace(/^(?:title|subject)\s*:\s*/i, '')
  s = cleanSubject(s)
  if (s === '(no subject)') return null
  s = s.replace(/!/g, '').replace(/\s+/g, ' ').replace(/\s*[—–-]\s*$/, '').trim()
  if (s.length > TITLE_MAX) {
    const cut = s.slice(0, TITLE_MAX)
    const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('—'), cut.lastIndexOf('('))
    s = (at > 24 ? cut.slice(0, at) : cut).replace(/[\s—–(:,;-]+$/, '').trim()
  }
  return s || null
}

export async function latestMessages(threadId: string, limit = 2): Promise<MsgRow[]> {
  return sbTry<MsgRow[]>(`email_messages?thread_id=eq.${enc(threadId)}&deleted_at=is.null&select=id,subject,body_text,direction,sent_at&order=sent_at.desc&limit=${limit}`, [])
}

/** True when the newest message's subject names something different from the one before it. */
export function subjectMoved(msgs: Pick<MsgRow, 'subject'>[]): boolean {
  if (msgs.length < 2) return false
  return cleanSubject(msgs[0].subject).toLowerCase() !== cleanSubject(msgs[1].subject).toLowerCase()
}

/**
 * Ask the model for a title and store it. Returns the title written, or null when nothing was
 * written (no content, model failed, or the answer was empty). Never throws.
 */
export async function titleThread(thread: TitleThreadRow, latest: Pick<MsgRow, 'subject' | 'body_text'> | null): Promise<string | null> {
  try {
    const subject = cleanSubject(latest?.subject ?? thread.subject)
    const body = (latest?.body_text ?? '').replace(/\s+/g, ' ').trim().slice(0, 1500)
    if (subject === '(no subject)' && !body) return null
    const company = thread.companies?.company_name?.trim() || null
    const parts = [
      company ? `Filed under company: ${company}` : 'Company not filed yet.',
      `Subject: ${subject}`,
      body ? `Latest message (first 1,500 characters):\n${body}` : 'No message text.',
    ].join('\n\n')
    const r = await callGemini({
      agent: 'housekeeping', feature: 'thread_title', model: GEMINI_LITE,
      system: SYSTEM, parts: [{ text: parts }],
      maxOutputTokens: 400, temperature: 0,
      metadata: { thread_id: thread.id },
    })
    if (!r.text) {
      void logError({ source: 'gemini', feature: 'thread_title', message: r.error ?? 'empty', threadId: thread.id })
      return null
    }
    const title = sanitiseTitle(r.text)
    if (!title) return null
    await sb(`email_threads?id=eq.${enc(thread.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ display_subject: title }) })
    return title
  } catch (e) {
    void logError({ source: 'internal', feature: 'thread_title', message: String(e), threadId: thread.id })
    return null
  }
}

/** Title one thread by id when it has none or its subject moved. Used by classify. */
export async function titleThreadIfNeeded(threadId: string): Promise<{ written: string | null; reason: 'untitled' | 'subject moved' | 'current' | 'missing' }> {
  const [rows, msgs] = await Promise.all([
    sbTry<TitleThreadRow[]>(`email_threads?id=eq.${enc(threadId)}&select=${TITLE_THREAD_SELECT}&limit=1`, []),
    latestMessages(threadId, 2),
  ])
  const thread = rows[0]
  if (!thread) return { written: null, reason: 'missing' }
  const untitled = !(thread.display_subject ?? '').trim()
  const moved = !untitled && subjectMoved(msgs)
  if (!untitled && !moved) return { written: null, reason: 'current' }
  const written = await titleThread(thread, msgs[0] ?? null)
  return { written, reason: untitled ? 'untitled' : 'subject moved' }
}

/** Backfill: newest threads without a title. Idempotent — a titled thread is never selected. */
export async function titleUntitledThreads(limit = 200): Promise<{ scanned: number; written: number; skipped: number }> {
  const rows = await sbTry<TitleThreadRow[]>(`email_threads?display_subject=is.null&deleted_at=is.null&select=${TITLE_THREAD_SELECT}&order=last_message_at.desc.nullslast&limit=${limit}`, [])
  let written = 0, skipped = 0
  for (const t of rows) {
    const [latest] = await latestMessages(t.id, 1)
    const title = await titleThread(t, latest ?? null)
    if (title) written++; else skipped++
  }
  return { scanned: rows.length, written, skipped }
}
