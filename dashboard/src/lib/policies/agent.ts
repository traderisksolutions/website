/**
 * The benefits-admin agent's model calls: is this mail a staff movement list, what moved, what
 * did the insurer's note say, and the endorsement request to the insurer. Every call goes
 * through callGemini under agent 'benefits_admin'; every text an insurer reads is written under
 * the house voice. Nothing here sends and nothing here writes a row.
 */
import { callGemini } from '@/lib/ai-call'
import { GEMINI_DEEP, GEMINI_LITE } from '@/lib/gemini-models'
import { withVoice } from '@/lib/voice'
import type { MailAttachment, MailMessage } from '@/lib/placement/store'
import type { MovementKind, PolicyMember, TransactionEvidence, TransactionKind } from './types'
import { MOVEMENT_KINDS, TRANSACTION_KINDS } from './types'

const AGENT = 'benefits_admin' as const

const parseJson = <T,>(text: string | null): T | null => {
  if (!text) return null
  try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as T } catch { return null }
}
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const str = (v: unknown, max = 300): string | null => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') { const n = Number(v.replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) && v.trim() ? n : null }
  return null
}

/** The email and its readable attachments, within a character budget. */
export const mailText = (msg: MailMessage, atts: MailAttachment[] = [], budget = 60_000): string => {
  let left = budget
  const out = [`--- EMAIL ${msg.sent_at ?? ''} from ${msg.from_address ?? '?'}\nSUBJECT: ${msg.subject ?? ''}\n${(msg.body_text ?? '').slice(0, Math.min(left, 15_000))}`]
  left -= Math.min(left, 15_000)
  for (const a of atts) {
    const t = (a.parsed_text ?? '').trim()
    if (t.length < 10 || left <= 0) continue
    const take = t.slice(0, Math.min(left, 25_000))
    left -= take.length
    out.push(`--- ATTACHMENT ${a.filename}\n${take}`)
  }
  return out.join('\n\n')
}

const memberLines = (members: Pick<PolicyMember, 'member_name' | 'relationship' | 'status'>[], max = 400): string =>
  members.filter(m => m.status === 'active').slice(0, max).map(m => `${m.member_name} (${m.relationship})`).join('\n') || '(no members on file)'

// ── 1. Is this a movement list? (cheap) ─────────────────────────────────────────────────────

export type MovementClassification = { isMovement: boolean; confidence: number }

export async function classifyMovementMail(msg: MailMessage, atts: MailAttachment[], ctx: { companyName: string; policyLabel: string }): Promise<MovementClassification> {
  const system = `You read an email a client (${ctx.companyName}) sent to its insurance broker about its employee benefits policy ("${ctx.policyLabel}").
Decide whether the email reports STAFF MOVEMENTS: employees or dependants joining the policy, leaving it, or changing plan / category / details. A list of names with join or leave dates, a resignation notice, a new hire to add, a dependant to add or remove: all count. A question about claims, an invoice query, a renewal discussion, a thank-you: do not.
Return JSON only: { "is_movement": boolean, "confidence": number 0-1 }`
  const { text, error } = await callGemini({
    agent: AGENT, feature: 'policy_movement_classify', model: GEMINI_LITE, system, json: true, temperature: 0, maxOutputTokens: 1_000,
    metadata: { message_id: msg.id }, parts: [{ text: mailText(msg, atts, 20_000) }],
  })
  if (error) console.error('[benefits_admin] classify', error)
  const raw = parseJson<{ is_movement?: unknown; confidence?: unknown }>(text)
  const confidence = Math.min(1, Math.max(0, num(raw?.confidence) ?? 0))
  return { isMovement: raw?.is_movement === true, confidence }
}

// ── 2. What moved ───────────────────────────────────────────────────────────────────────────

export type MovementRead = {
  kind: MovementKind
  member_name: string
  relationship: string | null
  effective_on: string | null
  detail: Record<string, unknown>
}

export async function readMovementMail(msg: MailMessage, atts: MailAttachment[], ctx: { companyName: string; policyLabel: string; members: PolicyMember[] }): Promise<{ movements: MovementRead[] } | null> {
  const system = `You read an email in which a client (${ctx.companyName}) reports staff movements on its employee benefits policy ("${ctx.policyLabel}") to its broker, and list each movement.
kind: join (a person to be added), leave (a person to be removed), change (same person, different plan / category / details).
member_name: the person's name as written. For a leaver or a change, use the EXACT spelling from the current member list below when the name is clearly the same person, so the record matches.
relationship: employee, spouse, child or other. effective_on: YYYY-MM-DD if a date is given or can be read from the email date (${msg.sent_at?.slice(0, 10) ?? 'unknown'}); otherwise null. Never invent a date.
detail: anything else reported for that person as keys: dob (YYYY-MM-DD), category, plan, employee_ref, gender, nric_last4, note.
One entry per person. A dependant added with an employee is its own entry with relationship spouse or child.

Current members on the policy:
${memberLines(ctx.members)}

Return JSON only: { "movements": [{ "kind": ..., "member_name": string, "relationship": string|null, "effective_on": string|null, "detail": {} }] }`
  const { text, error } = await callGemini({
    agent: AGENT, feature: 'policy_movement_read', model: GEMINI_DEEP, system, json: true, temperature: 0, maxOutputTokens: 12_000, thinkingShare: 0.3,
    metadata: { message_id: msg.id }, parts: [{ text: mailText(msg, atts, 60_000) }],
  })
  if (error) console.error('[benefits_admin] movement read', error)
  const raw = parseJson<{ movements?: unknown }>(text)
  if (!raw || !Array.isArray(raw.movements)) return null
  const movements: MovementRead[] = []
  for (const m of raw.movements as Record<string, unknown>[]) {
    const name = str(m?.member_name, 200)
    const kind = m?.kind
    if (!name || typeof kind !== 'string' || !(MOVEMENT_KINDS as string[]).includes(kind)) continue
    movements.push({
      kind: kind as MovementKind, member_name: name, relationship: str(m.relationship, 40),
      effective_on: isDate(m.effective_on) ? m.effective_on : null,
      detail: m.detail && typeof m.detail === 'object' && !Array.isArray(m.detail) ? (m.detail as Record<string, unknown>) : {},
    })
  }
  return { movements: movements.slice(0, 200) }
}

// ── 3. The insurer's debit / credit note ────────────────────────────────────────────────────

export type NoteRead = {
  kind: TransactionKind
  note_no: string | null
  issued_on: string | null
  pax: number | null
  amount: number | null
  currency: string | null
  period_start: string | null
  period_end: string | null
  description: string | null
  member_names: string[]
  evidence: TransactionEvidence
  /** Set when the amount has no excerpt behind it, or could not be read. */
  needs_review: boolean
}

export async function readInsurerNote(msg: MailMessage, atts: MailAttachment[], ctx: { insurerName: string; policyLabel: string; policyNumber: string | null; members: PolicyMember[] }): Promise<{ notes: NoteRead[] } | null> {
  const system = `You read an email from an insurer (${ctx.insurerName}) to a broker about an employee benefits policy ("${ctx.policyLabel}"${ctx.policyNumber ? `, policy number ${ctx.policyNumber}` : ''}) and list every DEBIT NOTE and CREDIT NOTE in it: in the email body or in the attachments.
For each note: kind (debit = the client owes more, e.g. an addition; credit = money back, e.g. a deletion refund), note_no (the insurer's number, verbatim), issued_on (YYYY-MM-DD), pax (number of lives it covers), amount (the total as a plain number, no sign, no thousands separators), currency (SGD unless written otherwise), period_start and period_end (the cover period the amount is for, YYYY-MM-DD), description (one line: what it is for), member_names (every person named on the note; use the EXACT spelling from the member list below when it is clearly the same person).
evidence: for amount, note_no, issued_on and pax give { "excerpt": the exact words you read it from, "source": "email body" or "attachment: <filename>" }.
Never compute, prorate or guess a figure. A figure with no excerpt must be null. A tax invoice or a premium schedule that is not a debit or credit note is not a note.

Members on the policy:
${memberLines(ctx.members)}

Return JSON only: { "notes": [{ "kind": ..., "note_no": ..., "issued_on": ..., "pax": ..., "amount": ..., "currency": ..., "period_start": ..., "period_end": ..., "description": ..., "member_names": [], "evidence": { "amount": { "excerpt": "...", "source": "..." } } }] }`
  const { text, error } = await callGemini({
    agent: AGENT, feature: 'policy_note_read', model: GEMINI_DEEP, system, json: true, temperature: 0, maxOutputTokens: 12_000, thinkingShare: 0.3,
    metadata: { message_id: msg.id }, parts: [{ text: mailText(msg, atts, 80_000) }],
  })
  if (error) console.error('[benefits_admin] note read', error)
  const raw = parseJson<{ notes?: unknown }>(text)
  if (!raw || !Array.isArray(raw.notes)) return null
  const notes: NoteRead[] = []
  for (const n of raw.notes as Record<string, unknown>[]) {
    const kind = n?.kind
    if (typeof kind !== 'string' || !(TRANSACTION_KINDS as string[]).includes(kind)) continue
    const evidence: TransactionEvidence = {}
    if (n.evidence && typeof n.evidence === 'object') {
      for (const [k, v] of Object.entries(n.evidence as Record<string, unknown>)) {
        const ex = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
        const excerpt = str(ex?.excerpt, 500)
        if (excerpt) evidence[k] = { excerpt, source: str(ex?.source, 200) ?? 'email body' }
      }
    }
    const amount = num(n.amount)
    notes.push({
      kind: kind as TransactionKind, note_no: str(n.note_no, 80), issued_on: isDate(n.issued_on) ? n.issued_on : null,
      pax: num(n.pax) != null ? Math.round(num(n.pax)!) : null, amount: amount != null ? Math.abs(amount) : null,
      currency: str(n.currency, 8)?.toUpperCase() ?? null,
      period_start: isDate(n.period_start) ? n.period_start : null, period_end: isDate(n.period_end) ? n.period_end : null,
      description: str(n.description, 1000),
      member_names: Array.isArray(n.member_names) ? (n.member_names as unknown[]).filter((s): s is string => typeof s === 'string' && !!s.trim()).map(s => s.trim()).slice(0, 200) : [],
      evidence, needs_review: amount == null || !evidence.amount?.excerpt,
    })
  }
  return { notes: notes.slice(0, 50) }
}

// ── 4. The endorsement request to the insurer ───────────────────────────────────────────────

export type MovementRequestInput = {
  insurerName: string; contactName: string | null
  clientName: string; policyLabel: string; policyNumber: string | null
  movements: { kind: MovementKind; member_name: string; relationship: string | null; effective_on: string | null; dob: string | null; category: string | null; plan: string | null }[]
}
export type DraftText = { subject: string; body: string }

export async function draftMovementRequest(i: MovementRequestInput): Promise<DraftText | null> {
  const line = (m: MovementRequestInput['movements'][number]) =>
    `• ${m.kind === 'join' ? 'ADD' : m.kind === 'leave' ? 'REMOVE' : 'CHANGE'}: ${m.member_name}${m.relationship ? ` (${m.relationship})` : ''}${m.dob ? `, DOB ${m.dob}` : ''}${m.category ? `, category ${m.category}` : ''}${m.plan ? `, plan ${m.plan}` : ''}${m.effective_on ? `, effective ${m.effective_on}` : ', effective date to be confirmed'}`
  const joins = i.movements.filter(m => m.kind === 'join'), leaves = i.movements.filter(m => m.kind === 'leave'), changes = i.movements.filter(m => m.kind === 'change')
  const task = `Write the email a broker at Trade Risk Solutions sends to ${i.contactName ?? 'the underwriter'} at ${i.insurerName} asking for a member endorsement on the employee benefits policy of ${i.clientName} ("${i.policyLabel}"${i.policyNumber ? `, policy no. ${i.policyNumber}` : ''}).
Movements to endorse:
${joins.length ? `Joiners:\n${joins.map(line).join('\n')}` : ''}
${leaves.length ? `Leavers:\n${leaves.map(line).join('\n')}` : ''}
${changes.length ? `Changes:\n${changes.map(line).join('\n')}` : ''}

List every person exactly as given, with relationship, date of birth and effective date where given. Ask for the endorsement to be issued and for the debit note (additions) or credit note (deletions) for the prorated premium, and for the effective dates to be confirmed back. Plain text, short paragraphs, one blank line between them. No greeting fluff, no sign-off block (the signature is added on send).
Return JSON only: { "subject": string, "body": string }`
  const { text, error } = await callGemini({
    agent: AGENT, feature: 'policy_movement_draft', model: GEMINI_DEEP, system: await withVoice(task, 'client'), json: true, temperature: 0.2, maxOutputTokens: 6_000,
    parts: [{ text: 'Write it now.' }],
  })
  if (error) console.error('[benefits_admin] movement draft', error)
  const raw = parseJson<DraftText>(text)
  if (!raw?.body) return null
  return { subject: (raw.subject ?? '').trim() || `Member endorsement — ${i.clientName}${i.policyNumber ? ` — ${i.policyNumber}` : ''}`, body: raw.body.trim() }
}
