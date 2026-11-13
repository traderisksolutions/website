/**
 * TPA claim notices, read by rule (Client 360 phase 3, 14 Nov 2026). Integrated Health Plans
 * (claims@ihp.com.sg) sends the same two notices for every claim it handles, to the member with
 * TRS copied: "Claim Pending Further Action" (the member must submit something) and "Claim
 * Settlement Document Ready for Viewing" (the claim is settled). Each names the claim references
 * on one line. For the top clients these arrive weekly; a person used to read each one.
 *
 * The rule moves the claim on the register forward only: pending → documents_pending, waiting on
 * the member (the client's side); settlement → settled. A claim already settled, declined or withdrawn is left alone,
 * and a pending notice never reopens a settled claim. A reference with no claim on the register
 * becomes one: the client is the one its thread is filed against (as Nexus resolves it) or the one
 * the subject names; the policy is the number in the subject ("…-N0018218"), which gives the
 * insurer and class. The claimant and amounts are not in the notice and stay empty. No model.
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
  const refs = [...new Set(line.split(/[,\s;]+/).map(x => x.trim().toUpperCase()).filter(x => /^[A-Z]\d{8,}$/.test(x)))]
  return refs.length ? { kind, refs } : null
}

/** The stage a notice moves a claim to, or null when it should stay. Pure. */
export function nextStage(current: ClaimStage, notice: TpaNotice['kind']): ClaimStage | null {
  if (current === 'settled' || current === 'declined' || current === 'withdrawn') return null
  const want: ClaimStage = notice === 'settled' ? 'settled' : 'documents_pending'
  return ORDER.indexOf(want) > ORDER.indexOf(current) ? want : null
}

/** Applies every IHP notice since `since` to the claims register. Server only. */
/** The policy number in a notice subject: "( HEALTHWAY MEDICAL GROUP PTE LTD-N0018218 )" → N0018218. Pure. */
export const policyInSubject = (subject: string | null | undefined): string | null => (subject ?? '').match(/-\s*([A-Z]\d{6,})\s*\)/)?.[1] ?? null
/** The client named in a notice subject's brackets. Pure. */
export const clientInSubject = (subject: string | null | undefined): string | null => (subject ?? '').match(/\(\s*([^()]+?)\s*(?:-\s*[A-Z]\d{6,})?\s*\)\s*$/)?.[1]?.trim() ?? null

export async function applyTpaNotices(since: string, opts: { dryRun?: boolean } = {}): Promise<{ notices: number; moved: number; created: number; planned: Record<string, unknown>[]; unmatched: string[]; moves: { ref: string; from: ClaimStage; to: ClaimStage }[] }> {
  const { sb, sbTry, enc, inChunks } = await import('@/lib/crm/db')
  const { logActivity } = await import('@/lib/log-activity')
  const msgs = await sbTry<{ id: string; thread_id: string; from_address: string | null; subject: string | null; body_text: string | null; sent_at: string | null }[]>(
    `email_messages?from_address=ilike.*ihp.com.sg*&sent_at=gte.${enc(since)}&deleted_at=is.null&select=id,thread_id,from_address,subject,body_text,sent_at&order=sent_at.asc&limit=2000`, [])
  const notices = msgs.map(m => ({ m, n: readTpaNotice(m.from_address, m.subject, m.body_text) })).filter((x): x is { m: typeof msgs[number]; n: TpaNotice } => !!x.n)
  const refs = [...new Set(notices.flatMap(x => x.n.refs))]
  const claims = await inChunks(refs, 80, c => sbTry<{ id: string; insurer_ref: string | null; stage: ClaimStage }[]>(`claims?insurer_ref=in.(${c.map(enc).join(',')})&select=id,insurer_ref,stage`, []))
  const byRef = new Map(claims.map(c => [String(c.insurer_ref).toUpperCase(), c]))
  let moved = 0, created = 0
  const planned: Record<string, unknown>[] = []
  // References with no claim yet: one new claim each, from its notices.
  const missing = refs.filter(r => !byRef.has(r))
  if (missing.length) {
    const { clientsForThreads } = await import('@/lib/nexus/company-view')
    const { normCompany } = await import('@/lib/gb/intake')
    const clientOf = await clientsForThreads([...new Set(notices.filter(x => x.n.refs.some(r => missing.includes(r))).map(x => x.m.thread_id))])
    const clients = await sbTry<{ id: string; company_name: string }[]>('companies?kind=eq.client&select=id,company_name&limit=5000', [])
    for (const ref of missing) {
      const mine = notices.filter(x => x.n.refs.includes(ref))
      const first = mine[0].m, latest = mine[mine.length - 1]
      const named = clientInSubject(first.subject)
      const company = clientOf.get(first.thread_id)?.id ?? (named ? clients.find(c => normCompany(c.company_name) === normCompany(named))?.id : undefined)
      if (!company) continue
      const pno = policyInSubject(first.subject)
      const [pol] = pno ? await sbTry<{ id: string; insurer: string | null; class_of_insurance: string | null }[]>(`policies?policy_number=eq.${enc(pno)}&select=id,insurer,class_of_insurance&limit=1`, []) : []
      const stage: ClaimStage = mine.some(x => x.n.kind === 'settled') ? 'settled' : 'documents_pending'
      const row = {
        company_id: company, policy_id: pol?.id ?? null, policy_number: pno, insurer_name: pol?.insurer ?? 'Integrated Health Plans (TPA)', class: 'other',
        insurer_ref: ref, stage, waiting_on: stage === 'settled' ? null : 'client', notified_at: first.sent_at?.slice(0, 10) ?? null,
        last_mail_at: latest.m.sent_at, closed_at: stage === 'settled' ? latest.m.sent_at : null, opened_mode: 'normal', source: 'tpa_notice', currency: 'SGD',
      }
      planned.push(row)
      if (!opts.dryRun) {
        const [made] = await sbTry<{ id: string }[]>('claims', [], { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) })
        if (!made) continue
        // Into the client's knowledge base, like every claim (src/lib/admin/k/deposit.ts).
        await import('@/lib/admin/k/deposit').then(k => k.depositEvent('claims', made.id)).catch(() => 0)
        void logActivity({ action: 'claim.created_by_notice', resource_type: 'claim', resource_id: made.id, new_value: { ref, stage, company_id: company, message_id: first.id } })
        byRef.set(ref, { id: made.id, insurer_ref: ref, stage })
      } else byRef.set(ref, { id: `dry-${ref}`, insurer_ref: ref, stage })
      created++
    }
  }
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
  return { notices: notices.length, moved, created, planned, unmatched: [...unmatched], moves }
}
