/**
 * Member movements, the parts around the email: what each movement should cost, the files that go
 * with the request to the insurer, chasing an insurer that has not billed, and turning the
 * insurer's note into a TRS debit or credit note for review.
 *
 *   reported → sent → noted (insurer's DN/CN read) → billed (TRS DN/CN issued) → settled
 *
 * Every step stamps its time on the movement (sent_at, noted_at, billed_at, settled_at, chases), so
 * billing lag and variance can be measured per client and insurer (view movement_facts).
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import * as store from '@/lib/placement/store'
import { getDriveWriteToken, findOrCreateFolder, rootFolderId, uploadFileToDrive } from '@/lib/gdrive-write'
import { driveRef, gmailRef } from '@/lib/storage/attachment-bytes'
import { isNoise } from '@/lib/documents/taxonomy'
import { movementSheetXlsx, sheetFormatFor, type SheetMovement } from './movement-sheet'
import { prorata, variance, type RateSource } from './prorata'
import type { PolicyMovement, PolicyRow, PolicyTransaction } from './types'

const LIFE = /term life|\bgtl\b|critical|\bgci\b|life/i

// ── Estimates ───────────────────────────────────────────────────────────────────────────────

/**
 * The annual rate for one member: the rate this insurer charged on this policy for the same plan or
 * category on an earlier note, else the policy premium per head. Null when neither is known.
 */
export async function annualRateFor(policy: PolicyRow, m: Pick<PolicyMovement, 'plan_code' | 'category'>): Promise<{ rate: number; source: RateSource } | null> {
  const learned = await sbTry<{ annual_rate: number; plan_code: string | null; category: string | null }[]>(
    `policy_movements?policy_id=eq.${policy.id}&rate_source=eq.insurer_note&annual_rate=not.is.null&select=annual_rate,plan_code,category&order=noted_at.desc.nullslast&limit=50`, [])
  const same = learned.find(l => (m.plan_code && l.plan_code === m.plan_code) || (m.category && l.category === m.category)) ?? learned[0]
  if (same) return { rate: Number(same.annual_rate), source: 'insurer_note' }
  const premium = Number((policy as { bound_premium?: number | null }).bound_premium ?? (policy as { premium?: number | null }).premium ?? 0)
  if (premium > 0) {
    const heads = (await sbTry<{ id: string }[]>(`policy_members?policy_id=eq.${policy.id}&status=eq.active&select=id&limit=5000`, [])).length
    if (heads > 0) return { rate: Math.round(premium / heads * 100) / 100, source: 'premium_per_head' }
  }
  return null
}

/** Pro-rata estimate for each movement, written on the movement. Movements without a date or rate are left blank. */
export async function estimateMovements(policy: PolicyRow, movements: PolicyMovement[]): Promise<void> {
  const start = (policy as { start_date?: string | null }).start_date, end = (policy as { end_date?: string | null }).end_date
  if (!start || !end) return
  const gstRate = LIFE.test(`${policy.product_line ?? ''} ${policy.class_of_insurance ?? ''} ${policy.label ?? ''}`) ? 0 : 0.09
  for (const m of movements) {
    if (m.kind === 'change' || !m.effective_on) continue
    const r = await annualRateFor(policy, m)
    if (!r) continue
    const e = prorata({ kind: m.kind, effectiveOn: m.effective_on, periodStart: start, periodEnd: end, annualRate: r.rate, rateSource: r.source, gstRate })
    await store.patchNoTs('policy_movements', `id=eq.${m.id}`, { annual_rate: r.rate, rate_source: r.source, estimate_amount: e.total, estimate_basis: e.basis })
  }
}

/**
 * The insurer's note against what TRS expected for the movements it settles. Writes the estimate
 * and variance on the transaction, flags it for review outside tolerance, stamps noted_at, and
 * learns each member's annual rate from a one-member note so the next estimate uses the insurer's
 * own price.
 */
export async function checkNote(policy: PolicyRow, t: PolicyTransaction, matched: PolicyMovement[]): Promise<{ estimate: number | null; variance: number | null; withinTolerance: boolean | null }> {
  const now = new Date().toISOString()
  if (matched.length) await store.patchNoTs('policy_movements', `id=in.(${matched.map(m => m.id).join(',')})`, { noted_at: now, next_chase_at: null })
  const fresh = matched.length ? await sbTry<(PolicyMovement & { estimate_amount: number | null })[]>(`policy_movements?id=in.(${matched.map(m => m.id).join(',')})&select=*`, []) : []
  const ests = fresh.map(m => m.estimate_amount).filter((x): x is number => x != null)
  // A one-member note is that member's price: keep the annual rate it implies.
  const start = (policy as { start_date?: string | null }).start_date, end = (policy as { end_date?: string | null }).end_date
  if (fresh.length === 1 && fresh[0].effective_on && start && end && t.amount) {
    const days = Math.max(1, Math.round((Date.parse(end) - Math.max(Date.parse(fresh[0].effective_on), Date.parse(start))) / 86_400_000) + 1)
    const net = Math.abs(t.amount) / (LIFE.test(`${policy.product_line ?? ''} ${policy.class_of_insurance ?? ''}`) ? 1 : 1.09)
    await store.patchNoTs('policy_movements', `id=eq.${fresh[0].id}`, { annual_rate: Math.round(net * 365 / days * 100) / 100, rate_source: 'insurer_note' })
  }
  if (ests.length !== fresh.length || !ests.length) return { estimate: null, variance: null, withinTolerance: null }
  const estimate = Math.round(ests.reduce((s, x) => s + x, 0) * 100) / 100
  const v = variance(estimate, t.amount)
  await store.patchNoTs('policy_transactions', `id=eq.${t.id}`, { estimate_amount: estimate, variance_amount: v.diff, ...(v.withinTolerance ? {} : { needs_review: true }) })
  return { estimate, variance: v.diff, withinTolerance: v.withinTolerance }
}

// ── Files for the insurer ───────────────────────────────────────────────────────────────────

type DraftAttachment = { filename: string; mime_type?: string; storage_url: string }

/**
 * The movement sheet in the insurer's own layout, saved to the client's Drive folder, plus the
 * client's original files from the emails that reported the movements (they carry the identity
 * numbers TRS does not keep). A Drive failure leaves the client's files; the request still goes.
 */
export async function movementAttachments(policy: PolicyRow, movements: PolicyMovement[], companyName: string, insurerName: string): Promise<{ attachments: DraftAttachment[]; sheetError: string | null }> {
  const attachments: DraftAttachment[] = []
  let sheetError: string | null = null
  const rows: SheetMovement[] = movements.map(m => {
    const x = m as PolicyMovement & { last_day?: string | null; employment_date?: string | null; category?: string | null; plan_code?: string | null }
    return {
      kind: m.kind, member_name: m.member_name, relationship: m.relationship, dob: typeof m.detail?.dob === 'string' ? m.detail.dob : null,
      gender: typeof m.detail?.gender === 'string' ? m.detail.gender : null, category: x.category ?? null, plan_code: x.plan_code ?? null,
      effective_on: m.effective_on, last_day: x.last_day ?? null, employment_date: x.employment_date ?? null,
    }
  })
  try {
    const format = sheetFormatFor(insurerName, policy.policy_number)
    const bytes = await movementSheetXlsx(format, rows, policy.policy_number, companyName)
    const today = new Date().toISOString().slice(0, 10)
    const name = `${today} ${companyName.replace(/[\\/:*?"<>|]+/g, ' ').trim()} member movement ${policy.policy_number ?? ''}`.trim() + '.xlsx'
    const token = await getDriveWriteToken()
    const company = await findOrCreateFolder(companyName.trim(), rootFolderId(), token)
    const folder = await findOrCreateFolder('Member movements', company, token)
    const id = await uploadFileToDrive(name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes, folder, token)
    attachments.push({ filename: name, mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', storage_url: driveRef(id) })
  } catch (e) {
    sheetError = e instanceof Error ? e.message : String(e)
  }
  const messages = [...new Set(movements.map(m => m.reported_message_id).filter((x): x is string => !!x))]
  if (messages.length) {
    const files = await sbTry<{ id: string; filename: string; mime_type: string | null }[]>(`email_attachments?message_id=in.(${messages.map(enc).join(',')})&select=id,filename,mime_type`, [])
    for (const f of files) if (!isNoise(f.filename, f.mime_type)) attachments.push({ filename: f.filename, mime_type: f.mime_type ?? undefined, storage_url: gmailRef(f.id) })
  }
  return { attachments, sheetError }
}

// ── Chasing the insurer ─────────────────────────────────────────────────────────────────────

const MAX_CHASES = 3

/**
 * Movements sent a week or more ago with no note from the insurer get one chaser per request
 * (draft, for a person to send), then every five days, up to three. `now` lets a test run against
 * its own movements only.
 */
export async function runMovementChases(now = new Date()): Promise<{ drafted: number; skipped: number }> {
  const due = await sbTry<(PolicyMovement & { chase_count: number })[]>(`policy_movements?status=eq.sent&next_chase_at=lte.${now.toISOString()}&sent_draft_id=not.is.null&select=*&order=sent_at.asc&limit=500`, [])
  const byDraft = new Map<string, (PolicyMovement & { chase_count: number })[]>()
  for (const m of due) byDraft.set(m.sent_draft_id!, [...(byDraft.get(m.sent_draft_id!) ?? []), m])
  let drafted = 0, skipped = 0
  for (const [draftId, ms] of byDraft) {
    const n = Math.max(...ms.map(m => m.chase_count ?? 0))
    if (n >= MAX_CHASES) { await store.patchNoTs('policy_movements', `id=in.(${ms.map(m => m.id).join(',')})`, { next_chase_at: null }); skipped++; continue }
    const original = await store.draftById(draftId)
    if (!original?.to_email || !original.contact_id) { skipped++; continue }
    const [company] = await sbTry<{ company_name: string }[]>(`companies?id=eq.${ms[0].company_id}&select=company_name&limit=1`, [])
    const sentOn = (ms[0].sent_at ?? ms[0].created_at).slice(0, 10)
    const names = ms.map(m => `${m.member_name} (${m.kind === 'join' ? 'addition' : m.kind === 'leave' ? 'deletion' : 'change'}${m.effective_on ? `, effective ${m.effective_on}` : ''})`)
    const body = [
      'Dear Underwriter,',
      '',
      `Following up on the member movement for ${company?.company_name ?? 'our client'} we sent on ${sentOn}${original.subject ? ` ("${original.subject}")` : ''}:`,
      '',
      ...names.map(x => `- ${x}`),
      '',
      'May we have the endorsement and the debit or credit note, or let us know if anything else is needed?',
      '',
      'Thank you.',
    ].join('\n')
    const draft = await store.createDraft({ contact_id: original.contact_id, to_email: original.to_email, subject: `Follow-up: ${original.subject ?? 'member movement'}`, body, thread_id: original.thread_id, email_type: 'POLICY_MOVEMENT_CHASE' })
    if (!draft) { skipped++; continue }
    await store.patchNoTs('policy_movements', `id=in.(${ms.map(m => m.id).join(',')})`, { chase_count: n + 1, last_chase_at: now.toISOString(), next_chase_at: new Date(now.getTime() + 5 * 86_400_000).toISOString() })
    await store.log({ company_id: ms[0].company_id, kind: 'chase', actor: 'system', text: `Chaser ${n + 1} drafted to the insurer: ${ms.length} movement${ms.length === 1 ? '' : 's'} sent ${sentOn}, no note yet`, detail: { ai_draft_id: draft.id, policy_id: ms[0].policy_id, movement_ids: ms.map(m => m.id) } })
    drafted++
  }
  return { drafted, skipped }
}

// ── TRS debit / credit note ─────────────────────────────────────────────────────────────────

/**
 * Puts the insurer's note into the debit-note review queue as an import bundle (its own PDF as the
 * source), tied to the transaction so approval links the TRS note back and marks the movements
 * billed. Returns the bundle id; the caller starts extraction.
 */
export async function bundleForTransaction(transactionId: string): Promise<{ bundleId: string; companyId: string }> {
  const [t] = await sbTry<(PolicyTransaction & { bundle_id?: string | null })[]>(`policy_transactions?id=eq.${enc(transactionId)}&select=*&limit=1`, [])
  if (!t) throw new Error('Transaction not found')
  if (t.debit_note_id) throw new Error('A TRS note is already linked to this insurer note')
  if (t.bundle_id) return { bundleId: t.bundle_id, companyId: t.company_id }
  if (!t.source_attachment_id) throw new Error('The insurer note has no document to read; raise the TRS note from Debit notes')
  const [att] = await sbTry<{ id: string; filename: string }[]>(`email_attachments?id=eq.${t.source_attachment_id}&select=id,filename&limit=1`, [])
  if (!att) throw new Error('The insurer document is no longer on file')
  const [bundle] = await sb<{ id: string }[]>('debit_note_bundles', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'pending', source: 'policy_movement', source_ref: t.id, suggested_company_id: t.company_id, match_confidence: 1 }) })
  await sb('pdf_import_items', { method: 'POST', body: JSON.stringify({ bundle_id: bundle.id, storage_url: gmailRef(att.id), original_filename: att.filename, status: 'pending' }) })
  await store.patchNoTs('policy_transactions', `id=eq.${t.id}`, { bundle_id: bundle.id })
  return { bundleId: bundle.id, companyId: t.company_id }
}

/** After a bundle from a movement note is approved: link the TRS note and mark its movements billed. */
export async function billedFromBundle(bundleId: string, debitNoteId: string, debitNoteNo: string | null): Promise<void> {
  const ts = await sbTry<PolicyTransaction[]>(`policy_transactions?bundle_id=eq.${enc(bundleId)}&select=*`, [])
  for (const t of ts) {
    await store.patchNoTs('policy_transactions', `id=eq.${t.id}`, { debit_note_id: debitNoteId })
    const now = new Date().toISOString()
    await store.patchNoTs('policy_movements', `transaction_id=eq.${t.id}&status=eq.noted`, { status: 'billed', billed_at: now })
    await store.log({ company_id: t.company_id, kind: 'billing', actor: 'system', text: `TRS ${t.kind === 'credit' ? 'credit' : 'debit'} note ${debitNoteNo ?? ''} issued for the insurer's ${t.note_no ?? 'note'}`.replace(/\s+/g, ' '), detail: { policy_id: t.policy_id, transaction_id: t.id, debit_note_id: debitNoteId } })
  }
}
