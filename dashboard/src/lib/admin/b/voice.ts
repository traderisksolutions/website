/**
 * How each person signs and greets. The drafters write one neutral shape ("Dear X," … "Best
 * regards, {owner_name}, Trade Risk Solutions"); at approval or auto-send the owner's voice is laid
 * over it, so the same draft reads as Nathan's when Nathan sends it and as Hasya's when Hasya does.
 *
 * Read on 2 Nov 2026 from 1,192 of Nathan's sent emails: "Dear" on first contact, "Hi" once the
 * thread is warm, "Thank you!" before the close, "Warmest Regards," then the first name, the mobile
 * on first contact. The profile lives on user_signatures.voice (jsonb, 20261103_user_voice.sql);
 * nothing in code names a person, so the public repository carries no phone numbers.
 */
import { sbTry, enc } from '@/lib/crm/db'

export type Voice = {
  /** The name under the close: "Nathan", "Ernest Tan". */
  name: string
  /** Greeting word on first contact with an address, and once TRS has written to it before. */
  greetingFirst: 'Dear' | 'Hi'
  greetingWarm: 'Dear' | 'Hi'
  /** "Thank you!" as its own line before the close. */
  thanks: boolean
  /** "Best regards," / "Warmest Regards," */
  closing: string
  phone: string | null
  /** Mobile under the name on first contact only, or never. */
  phoneOnFirstContact: boolean
  /** "Trade Risk Solutions" line under the name. */
  company: boolean
}

export const DEFAULT_VOICE: Voice = {
  name: 'Trade Risk Solutions', greetingFirst: 'Dear', greetingWarm: 'Dear', thanks: false,
  closing: 'Best regards,', phone: null, phoneOnFirstContact: false, company: true,
}

/** The neutral close every drafter writes, matched as a block so the voice can replace it whole. */
const NEUTRAL_SIGN = /Best regards,\n\{owner_name\}\nTrade Risk Solutions/g
const GREETING = /^(Dear|Hi)\s+([^\n,]{1,80}),/

/** Pure. The close in this voice, for a first contact or a warm thread. */
export function signBlock(v: Voice, opts: { firstContact: boolean }): string {
  const lines = [v.closing, v.name]
  if (v.phone && (opts.firstContact || !v.phoneOnFirstContact)) lines.push(v.phone)
  if (v.company && v.name !== 'Trade Risk Solutions') lines.push('Trade Risk Solutions')
  return (v.thanks ? 'Thank you!\n\n' : '') + lines.join('\n')
}

/**
 * Pure. Lays the voice over a drafted body: the greeting word, the close, the name placeholder,
 * and a "{owner_phone}" line that is dropped when the voice has no phone.
 */
export function applyVoice(body: string, v: Voice, opts: { firstContact: boolean }): string {
  let out = body
  const word = opts.firstContact ? v.greetingFirst : v.greetingWarm
  out = out.replace(GREETING, (_m, _w, who) => `${word} ${who},`)
  // A body that already ends with a "Thank you!" line keeps one, not two.
  const sign = signBlock(v, opts)
  out = out.replace(NEUTRAL_SIGN, sign)
  if (v.thanks) out = out.replace(/\n\s*Thank you!\s*\n\s*\n\s*Thank you!\n/g, '\n\nThank you!\n')
  out = out.replace(/\{owner_phone\}/g, v.phone ?? '').replace(/[ \t]*\n[ \t]*\n[ \t]*\n+/g, '\n\n')
  return out.replace(/\{owner_name\}/g, v.name)
}

type SigRow = { name?: string | null; phone?: string | null; voice?: Partial<Voice> | null }

/**
 * The voice for a sender: their signature row plus its voice profile when the column exists.
 * Before the migration the select fails on the unknown column and the plain row is used.
 */
export async function voiceFor(email: string | null | undefined): Promise<Voice> {
  const e = String(email ?? '').toLowerCase().trim()
  if (!e) return DEFAULT_VOICE
  const q = (select: string) => sbTry<SigRow[]>(`user_signatures?or=(sending_email.eq.${enc(e)},email.eq.${enc(e)})&deleted_at=is.null&is_active=eq.true&select=${select}&limit=1`, [])
  let [row] = await q('name,phone,voice')
  if (!row) [row] = await q('name,phone')
  if (!row) {
    const [c] = await sbTry<{ first_name?: string; last_name?: string }[]>(`contacts?email=eq.${enc(e)}&select=first_name,last_name&limit=1`, [])
    const name = [c?.first_name, c?.last_name].filter(Boolean).join(' ')
    return name ? { ...DEFAULT_VOICE, name } : DEFAULT_VOICE
  }
  const v = (row.voice && typeof row.voice === 'object') ? row.voice : {}
  return { ...DEFAULT_VOICE, name: String(row.name ?? '').trim() || DEFAULT_VOICE.name, phone: row.phone ?? null, ...v }
}

/** Whether TRS has already written on this thread, which decides "Dear" against "Hi". */
export async function threadIsWarm(threadId: string | null | undefined): Promise<boolean> {
  if (!threadId) return false
  const rows = await sbTry<{ id: string }[]>(`email_messages?thread_id=eq.${enc(threadId)}&direction=eq.outbound&deleted_at=is.null&select=id&limit=1`, [])
  return rows.length > 0
}

/** The body as the owner would send it. */
export async function fillVoice(body: string, ownerEmail: string | null | undefined, threadId: string | null | undefined): Promise<string> {
  const [v, warm] = await Promise.all([voiceFor(ownerEmail), threadIsWarm(threadId)])
  return applyVoice(body, v, { firstContact: !warm })
}
