/**
 * Where an outgoing email came from. Pure.
 *
 *   agent_approved  an agent drafted it and a person sent it (edited or not);
 *   agent_auto      an agent sent it with no person (reserved; nothing sends this way yet);
 *   hand_written    no draft matches: a person wrote it in their mail client.
 *
 * A draft matches a message when both sit on the same thread and the message went out within
 * ten minutes of the draft being marked sent, or, for a draft with no thread, when it went to the
 * draft's address in that window. Among candidates the closest body wins. The send route stamps
 * the message and the draft with the same instant, so most matches are exact on time.
 *
 * edit_share is how much of the agent's draft the person changed before sending: 0 is sent as
 * drafted, 1 is rewritten. It is the share of the draft's words that did not survive, measured
 * against the draft as first written when the database kept that (ai_drafts.body_as_drafted),
 * else against the draft's current body. A name or line the person added does not count.
 */
import { newText, retained, similarity } from './text'

export type Origin = 'agent_approved' | 'agent_auto' | 'hand_written'

export type DraftCandidate = {
  id: string; thread_id: string | null; sent_at: string | null; body: string | null
  body_as_drafted?: string | null; to_email?: string | null; subject?: string | null
  /** Set when a future auto-send path marks the draft as sent by an agent. */
  sent_by_agent?: boolean | null
}
export type MessageForOrigin = { id: string; thread_id: string | null; sent_at: string | null; body_text: string | null; to: string[] }

export const MATCH_WINDOW_MS = 10 * 60_000
const BODY_MATCH_FLOOR = 0.35

export type OriginMatch = { origin: Origin; draft_id: string | null; edit_share: number | null }

export function matchOrigin(m: MessageForOrigin, drafts: DraftCandidate[]): OriginMatch {
  const t = m.sent_at ? Date.parse(m.sent_at) : NaN
  const own = newText(m.body_text)
  let best: { d: DraftCandidate; sim: number; dt: number } | null = null
  for (const d of drafts) {
    if (!d.sent_at) continue
    const dt = Math.abs(Date.parse(d.sent_at) - t)
    if (!(dt <= MATCH_WINDOW_MS)) continue
    const sameThread = !!d.thread_id && d.thread_id === m.thread_id
    const sameTo = !d.thread_id && !!d.to_email && m.to.some(a => a.toLowerCase() === d.to_email!.toLowerCase())
    if (!sameThread && !sameTo) continue
    const sim = similarity(newText(d.body), own)
    // An exact-instant stamp is the send route's own signature; a body check guards everything else.
    if (dt > 2_000 && sim < BODY_MATCH_FLOOR) continue
    if (!best || sim > best.sim || (sim === best.sim && dt < best.dt)) best = { d, sim, dt }
  }
  if (!best) return { origin: 'hand_written', draft_id: null, edit_share: null }
  const drafted = newText(best.d.body_as_drafted ?? best.d.body)
  const edit = 1 - retained(drafted, own)
  return { origin: best.d.sent_by_agent ? 'agent_auto' : 'agent_approved', draft_id: best.d.id, edit_share: Math.round(Math.min(1, Math.max(0, edit)) * 1000) / 1000 }
}

/** Sent as drafted: the person changed less than a tenth of the words. */
export const UNEDITED_MAX = 0.1
export const isUnedited = (editShare: number | null) => editShare != null && editShare <= UNEDITED_MAX
