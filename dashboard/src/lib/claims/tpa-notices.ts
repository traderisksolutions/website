/**
 * TPA claim notices, read by rule (Client 360 phase 3, 14 Nov 2026). Integrated Health Plans
 * (claims@ihp.com.sg) sends the same two notices for every claim it handles, to the member with
 * TRS copied: "Claim Pending Further Action" (the member must submit something) and "Claim
 * Settlement Document Ready for Viewing" (the claim is settled). Each names the claim references
 * on one line. For the top clients these arrive weekly; a person used to read each one.
 *
 * The rule moves the claim on the register forward only: pending → documents_pending, waiting on
 * the member (the client's side); settlement → settled. A claim already settled, declined or withdrawn is left alone,
 * and a pending notice never reopens a settled claim. No model.
 *
 * readTpaNotice and nextStage are pure; tested in src/__tests__/tpa-notices.test.ts.
 */
import type { ClaimStage } from '@/lib/admin/b/claim-read'

export type TpaNotice = { kind: 'pending' | 'settled'; refs: string[] }

const SENDERS = /@ihp\.com\.sg\b/i
const ORDER: ClaimStage[] = ['notified', 'documents_pending', 'with_insurer', 'adjuster', 'offer', 'settled']

/** A TPA notice in an email, or null. */
export function readTpaNotice(from: string | null | undefined, subject: string | null | undefined, body: string | null | undefined): TpaNotice | null {
  if (!SENDERS.test(from ?? '')) return null
  const s = (subject ?? '').replace(/^(\s*(re|fw|fwd)\s*:\s*)+/i, '')
  const kind = /claim settlement document ready/i.test(s) ? 'settled' : /claim pending further action/i.test(s) ? 'pending' : null
  if (!kind) return null
  const line = (body ?? '').match(/Claim Reference No\.?\s*:\s*([^\n]+)/i)?.[1] ?? ''
  const refs = [...new Set(line.split(/[,\s;]+/).map(x => x.trim().toUpperCase()).filter(x => /^[A-Z]\d{6,}$/.test(x)))]
  return refs.length ? { kind, refs } : null
}

/** The stage a notice moves a claim to, or null when it should stay. Pure. */
export function nextStage(current: ClaimStage, notice: TpaNotice['kind']): ClaimStage | null {
  if (current === 'settled' || current === 'declined' || current === 'withdrawn') return null
  const want: ClaimStage = notice === 'settled' ? 'settled' : 'documents_pending'
  return ORDER.indexOf(want) > ORDER.indexOf(current) ? want : null
}

/** Applies every IHP notice since `since` to the claims register. Server only. */
export async function applyTpaNotices(since: string, opts: { dryRun?: boolean } = {}): Promise<{ notices: number; moved: number; unmatched: string[]; moves: { ref: string; from: ClaimStage; to: ClaimStage }[] }> {
  const { sb, sbTry, enc, inChunks } = await import('@/lib/crm/db')
  const { logActivity } = await import('@/lib/log-activity')
  const msgs = await sbTry<{ id: string; from_address: string | null; subject: string | null; body_text: string | null; sent_at: string | null }[]>(
    `email_messages?from_address=ilike.*ihp.com.sg*&sent_at=gte.${enc(since)}&deleted_at=is.null&select=id,from_address,subject,body_text,sent_at&order=sent_at.asc&limit=2000`, [])
  const notices = msgs.map(m => ({ m, n: readTpaNotice(m.from_address, m.subject, m.body_text) })).filter((x): x is { m: typeof msgs[number]; n: TpaNotice } => !!x.n)
  const refs = [...new Set(notices.flatMap(x => x.n.refs))]
  const claims = await inChunks(refs, 80, c => sbTry<{ id: string; insurer_ref: string | null; stage: ClaimStage }[]>(`claims?insurer_ref=in.(${c.map(enc).join(',')})&select=id,insurer_ref,stage`, []))
  const byRef = new Map(claims.map(c => [String(c.insurer_ref).toUpperCase(), c]))
  let moved = 0
  const moves: { ref: string; from: ClaimStage; to: ClaimStage }[] = []
  const unmatched = new Set<string>()
  for (const { m, n } of notices) for (const ref of n.refs) {
    const c = byRef.get(ref)
    if (!c) { unmatched.add(ref); continue }
    const to = nextStage(c.stage, n.kind)
    if (!to) continue
    moves.push({ ref, from: c.stage, to })
    if (opts.dryRun) { c.stage = to; moved++; continue }
    await sb(`claims?id=eq.${enc(c.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ stage: to, waiting_on: to === 'documents_pending' ? 'client' : null, ...(to === 'settled' ? { closed_at: m.sent_at } : {}), updated_at: new Date().toISOString() }) })
    void logActivity({ action: 'claim.stage_by_notice', resource_type: 'claim', resource_id: c.id, old_value: { stage: c.stage }, new_value: { stage: to, ref, message_id: m.id } })
    c.stage = to; moved++
  }
  return { notices: notices.length, moved, unmatched: [...unmatched], moves }
}
