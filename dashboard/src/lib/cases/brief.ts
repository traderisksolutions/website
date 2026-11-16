/**
 * The case brief: what a person needs to send the next email, in five parts and nothing else.
 *
 *   Communicated     the last email TRS sent the client, and the last it sent each insurer
 *   Client wish list what the client asked to keep or to have, from the notes
 *   Known risks and success factors   only those a client or an insurer stated
 *   Open questions   who owes whom an answer, and since when
 *   Next step        the one action, and the agent that drafts it
 *
 * Communicated is read from the emails themselves. The other parts are the case's current notes
 * (memory.ts). An agent's risk or success factor stays on the brief only when the words it rests
 * on were written by the client or an insurer: TRS's own words are no one's statement. A person's
 * note needs no source and is counted as unsourced. Words from a colleague's mailbox are withheld.
 * No model reads anything here.
 *
 * Pure. Tested in __tests__/brief.test.ts. The reads are in brief-store.ts.
 */
import { ownText, partyOf } from '@/lib/admin/k/shape'
import { isAutoReply, isInternalOnly } from '@/lib/threads/waiting'
import { bucketOf, type Side, type SourceMessage } from './sources'
import { quoteSource } from './memory'
import { senderName } from './names'
import { isNeed, type Need } from './compare'

export const BRIEF_PARTS = ['communicated', 'wish', 'stated', 'open', 'next'] as const
export type BriefPart = typeof BRIEF_PARTS[number]
export const BRIEF_PART_NAME: Record<BriefPart, string> = {
  communicated: 'Communicated', wish: 'Client wish list', stated: 'Known risks and success factors', open: 'Open questions', next: 'Next step',
}

type BriefSource = { thread_id: string; message_id: string; /** The sender of the words, as the email names them. */ from: string | null; quote: string | null }
export type BriefRow = {
  part: BriefPart
  text: string
  /** A risk or a success factor; on a wish, the grade a person gave it. */
  kind?: 'Risk' | 'Success factor' | 'Must have' | 'Good to have'
  /** Who was written to, who stated it, who owes the answer, or who drafts. Null when the email does not say. */
  who: string | null
  date: string | null
  source: BriefSource | null
  /** The note's author when it is a person's own note. */
  author?: string
  note_id?: string
  /** The source is in a colleague's mailbox: its words are withheld. */
  private?: boolean
}
export type Brief = {
  rows: BriefRow[]
  /** Rows that rest on no email. */
  unsourced: number
  /** Agent notes left off: the words are TRS's own, or no writer could be named. */
  left_off: number
}

export type BriefNote = {
  id: string; section: string; text: string; quote: string | null; message_id: string | null; thread_id: string | null
  source_date: string | null; author: string; author_kind: 'agent' | 'person'; status: string; created_at: string
  /** On a wish: 'must' or 'nice', set by a person. */
  need?: string | null
}

export type BriefInput = {
  /** Every email on the case's picked threads, hidden threads included. */
  messages: readonly SourceMessage[]
  sides: Map<string, Side>
  /** Threads the viewer may read. */
  visible: ReadonlySet<string>
  domainKind: Map<string, string>
  /** An insurer's name from an address at its domain. */
  insurerName: (address: string | null | undefined) => string | null
  notes: readonly BriefNote[]
  nextAction?: string | null
  caseType: string
  hasPlacement: boolean
}

const COMMUNICATED_MAX = 400
const NEED_KIND: Record<Need, 'Must have' | 'Good to have'> = { must: 'Must have', nice: 'Good to have' }
const INSURER = new Set(['insurer', 'tpa'])
const day = (s: string | null | undefined) => (s ? s.slice(0, 10) : null)

/** The agent that drafts the next email. A placement's emails are the placement agent's; every other onward email is the relay's. Claims forwards belong to neither. */
export function draftingAgent(caseType: string, hasPlacement: boolean): string | null {
  if (hasPlacement) return 'Placement'
  return caseType === 'claim' ? null : 'Relay'
}

type Writer = { party: 'client' | 'insurer' | 'internal' | 'other'; from: string | null; message: SourceMessage }

export function buildBrief(i: BriefInput): Brief {
  const byId = new Map(i.messages.map(m => [m.id, m]))
  const isTrs = (m: SourceMessage) => m.direction === 'outbound' || partyOf(m.from_address, i.domainKind) === 'internal'
  /** The insurer an email was written to, by name. */
  const insurerOn = (m: SourceMessage) => {
    const to = [...(m.to ?? []), ...(m.cc ?? [])].find(a => INSURER.has(partyOf(a, i.domainKind)))
    return (to ? i.insurerName(to) : null) ?? 'Insurer'
  }
  const hidden = (threadId: string | null | undefined) => !!threadId && !i.visible.has(threadId)

  // Communicated: the newest TRS email on each side; on the insurer side, the newest per insurer.
  const communicated: BriefRow[] = []
  const said = new Set<string>()
  for (const m of [...i.messages].sort((a, b) => String(b.sent_at ?? '').localeCompare(String(a.sent_at ?? '')))) {
    if (!isTrs(m) || isAutoReply(m) || isInternalOnly(m)) continue
    const bucket = bucketOf(m, i.sides.get(m.thread_id), i.domainKind)
    if (!bucket) continue
    const who = bucket === 'client' ? 'To the client' : `To ${insurerOn(m)}`
    if (said.has(who)) continue
    const text = ownText(m.body_text, m.subject, COMMUNICATED_MAX, false) || (m.files ?? []).join(', ')
    if (!text) continue
    said.add(who)
    const priv = hidden(m.thread_id)
    communicated.push({ part: 'communicated', text: priv ? '' : text, who, date: day(m.sent_at), source: { thread_id: m.thread_id, message_id: m.id, from: m.from_address, quote: null }, ...(priv ? { private: true } : {}) })
  }
  communicated.sort((a, b) => Number(b.who === 'To the client') - Number(a.who === 'To the client') || String(b.date ?? '').localeCompare(String(a.date ?? '')))

  /** Who wrote the words a note rests on. */
  const writerOf = (n: BriefNote): Writer | null => {
    const src = n.quote && n.thread_id ? quoteSource(n.quote, n.thread_id, i.messages) : null
    const message = src?.message ?? (n.message_id ? byId.get(n.message_id) : undefined)
    if (!message) return null
    const own = src ? src.own : true
    const from = src ? src.from : message.from_address
    if (own && message.direction === 'outbound') return { party: 'internal', from, message }
    const p = partyOf(from, i.domainKind, own && i.sides.get(message.thread_id) === 'client' ? 'client' : null)
    return { party: p === 'client' || p === 'internal' ? p : INSURER.has(p) ? 'insurer' : 'other', from, message }
  }
  const stater = (w: Writer) => (w.party === 'client' ? 'Client' : w.party === 'insurer' ? i.insurerName(w.from) ?? 'Insurer' : w.party === 'internal' ? 'TRS' : senderName(w.from))
  const owes = (w: Writer) => {
    if (w.party === 'client') return 'TRS owes the client'
    if (w.party === 'insurer') return `TRS owes ${i.insurerName(w.from) ?? 'the insurer'}`
    if (w.party !== 'internal') return null
    const side = i.sides.get(w.message.thread_id)
    return side === 'client' ? 'Client owes TRS' : side === 'insurer' ? `${insurerOn(w.message)} owes TRS` : null
  }
  const fromNote = (n: BriefNote, part: BriefPart, w: Writer | null, who: string | null, extra: Partial<BriefRow> = {}): BriefRow => {
    const priv = hidden(n.thread_id)
    return {
      part, text: n.text, who, date: n.source_date ?? day(n.created_at), note_id: n.id, ...extra,
      source: w ? { thread_id: w.message.thread_id, message_id: w.message.id, from: priv ? null : w.from, quote: priv ? null : n.quote } : null,
      ...(n.author_kind === 'person' ? { author: n.author } : {}), ...(priv ? { private: true } : {}),
    }
  }

  const current = i.notes.filter(n => n.status === 'current').sort((a, b) => a.created_at.localeCompare(b.created_at))
  let leftOff = 0
  const wish: BriefRow[] = [], stated: BriefRow[] = [], open: BriefRow[] = []
  for (const n of current) {
    if (n.section === 'wish') { const w = writerOf(n); wish.push(fromNote(n, 'wish', w, w ? stater(w) : null, isNeed(n.need) ? { kind: NEED_KIND[n.need] } : {})) }
    else if (n.section === 'risk' || n.section === 'success_factor') {
      const w = writerOf(n)
      // An agent's reading counts only as a statement by the client or an insurer.
      if (n.author_kind === 'agent' && (!w || (w.party !== 'client' && w.party !== 'insurer'))) { leftOff++; continue }
      stated.push(fromNote(n, 'stated', w, w ? stater(w) : null, { kind: n.section === 'risk' ? 'Risk' : 'Success factor' }))
    } else if (n.section === 'open_question') { const w = writerOf(n); open.push(fromNote(n, 'open', w, w ? owes(w) : null)) }
  }
  open.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))

  const drafter = draftingAgent(i.caseType, i.hasPlacement)
  const drafts = drafter ? `${drafter} drafts` : null
  const step = [...current].reverse().find(n => n.section === 'next_step')
  const next: BriefRow[] = step ? [fromNote(step, 'next', writerOf(step), drafts)]
    : i.nextAction?.trim() ? [{ part: 'next', text: i.nextAction.trim(), who: drafts, date: null, source: null }] : []

  const rows = [...communicated, ...wish, ...stated, ...open, ...next]
  return { rows, unsourced: rows.filter(r => !r.source).length, left_off: leftOff }
}
