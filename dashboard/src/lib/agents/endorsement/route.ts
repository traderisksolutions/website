/**
 * The endorsement main agent's decisions, without I/O. Tested in
 * src/lib/agents/__tests__/endorsement-route.test.ts. See docs/agent-routing.md.
 */
import { readHistory } from '@/lib/admin/a/history'
import { deskFor, linesNamed } from '../desks'

export type Voice =
  | { kind: 'client' | 'insurer'; from: string; body: string; forwardedBy: null }
  | { kind: 'staff_forward'; from: string; body: string; forwardedBy: string }
  | { kind: 'staff'; from: string; body: string; forwardedBy: null }

/**
 * Who is speaking. A client or insurer is read as written. TRS staff forwarding a client's email
 * ("FW: Addition of staff") is read as that client: the forwarded message's sender and words. Any
 * other staff email is staff.
 */
export function voiceOf(msg: { from_address: string | null; subject: string | null; body_text: string | null }, internal: (email: string | null | undefined) => boolean, senderIsInsurer = false): Voice {
  const from = (msg.from_address ?? '').toLowerCase()
  const body = msg.body_text ?? ''
  if (!internal(from)) return { kind: senderIsInsurer ? 'insurer' : 'client', from, body, forwardedBy: null }
  const h = readHistory(body, msg.subject)
  const fwd = h.messages.find(m => m.origin === 'forward' && m.fromAddress && !internal(m.fromAddress))
  if (!fwd?.fromAddress) return { kind: 'staff', from, body, forwardedBy: null }
  return { kind: 'staff_forward', from: fwd.fromAddress.toLowerCase(), body: fwd.body, forwardedBy: from }
}

type P = { id: string; policy_number: string | null }

/**
 * The live policies an email touches.
 *   1. policy numbers it names
 *   2. else the product lines it names ("FWMI & EB" → both)
 *   3. else, for a staff list with no line named, the member policies, employee benefits first
 * An email that touches nothing returns no policies.
 */
export function policiesTouched<T extends P>(policies: T[], text: string, lineOf: (p: T) => string | null, looksLikeList: boolean): { policies: T[]; basis: 'policy number' | 'lines named' | 'default member policy' | 'none' } {
  const t = text.toLowerCase()
  const byNo = policies.filter(p => p.policy_number && p.policy_number.length >= 5 && t.includes(p.policy_number.toLowerCase()))
  if (byNo.length) return { policies: byNo, basis: 'policy number' }
  const named = linesNamed(text)
  if (named.length) {
    const exact = policies.filter(p => named.includes(lineOf(p) ?? ''))
    if (exact.length) return { policies: exact, basis: 'lines named' }
    // "Medical" on a company whose EB policy is filed as group_health: the same desk counts.
    const desk = policies.filter(p => deskFor(lineOf(p)) !== 'general' && named.some(l => deskFor(l) === deskFor(lineOf(p))))
    if (desk.length) return { policies: desk, basis: 'lines named' }
  }
  if (!looksLikeList) return { policies: [], basis: 'none' }
  const member = policies.filter(p => deskFor(lineOf(p)) === 'eb')
  const eb = member.filter(p => ['employee_benefits', 'group_health'].includes(lineOf(p) ?? ''))
  const pick = eb.length ? eb : member.slice(0, 1)
  return pick.length ? { policies: pick, basis: 'default member policy' } : { policies: [], basis: 'none' }
}
