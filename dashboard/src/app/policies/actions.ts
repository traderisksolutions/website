'use server'
/**
 * Policies (21 Nov 2026): a policy's edits, choosing a quote, renewal advice, member
 * movements, insurer notes and billing them, and the Working on and Movements lists. They replace
 * /api/policies/[id] (GET, PATCH), /[id]/choose, /[id]/renewal, /[id]/movements,
 * /[id]/movements/request, /[id]/transactions, /movements, /movements/sent,
 * /transactions/[id]/bill and /api/placements/working. The renewal report stays: it is a file.
 */
import { staffAction } from '@/lib/auth/action'
import { db, rows } from '@/lib/db/client'
import { isDate, isText, isUuid } from '@/lib/placement/api'
import * as store from '@/lib/placement/store'
import { choosePolicyQuote, markPolicyLive, setLifecycle } from '@/lib/policies/spine'
import { isPolicyLifecycle, MOVEMENT_KINDS, POLICY_LIFECYCLES, TRANSACTION_KINDS, type MovementKind, type PolicyMovement, type TransactionKind } from '@/lib/policies/types'
import { getRenewalPack } from '@/lib/policies/ledger'
import { draftRenewalAdvice } from '@/lib/policies/ledger/advice'
import { markMovementsSent, openMovements, policyRow, recordMovement } from '@/lib/policies/members'
import { matchMovement, noteMovements, recordTransaction } from '@/lib/policies/transactions'
import { requestMovements } from '@/lib/policies/inbound'
import { bundleForTransaction } from '@/lib/policies/movement-flow'
import { extractBundle } from '@/lib/debit-notes/extract-bundle'
import { movementBatches } from '@/lib/policies/movement-batches'
import { workingRows } from '@/lib/placement/working-rows'

function policyId(id: string): string {
  if (!isUuid(id)) throw new Error('Policy id is not valid')
  return id
}

export type PolicyEdit = { lifecycle?: unknown; policy_number?: unknown; start_date?: unknown; end_date?: unknown; label?: unknown; insurer?: unknown }

const optText = (v: unknown, name: string): string | null => {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') throw new Error(`${name} must be text`)
  return v.trim() || null
}
const optDate = (v: unknown, name: string): string | null => {
  if (v === undefined || v === null || v === '') return null
  if (!isDate(v)) throw new Error(`${name} must be YYYY-MM-DD`)
  return v
}

/** Edits a policy's number, label, insurer and dates, or moves its lifecycle (live sets them all at once). */
export async function updatePolicy(id: string, b: PolicyEdit) {
  return staffAction('update policy', async user => {
    policyId(id)
    if (b.lifecycle !== undefined && !isPolicyLifecycle(b.lifecycle)) throw new Error(`lifecycle must be one of ${POLICY_LIFECYCLES.join(', ')}`)
    const policyNumber = optText(b.policy_number, 'policy_number'), label = optText(b.label, 'label'), insurer = optText(b.insurer, 'insurer')
    const startDate = optDate(b.start_date, 'start_date'), endDate = optDate(b.end_date, 'end_date')
    if (startDate && endDate && endDate < startDate) throw new Error('end_date must not be before start_date')
    const live = b.lifecycle === 'live'
    const fields: Record<string, unknown> = {}
    if (b.policy_number !== undefined && !live) fields.policy_number = policyNumber
    if (b.label !== undefined) fields.label = label
    if (b.insurer !== undefined && !live) fields.insurer = insurer
    if (b.start_date !== undefined && !live) fields.start_date = startDate
    if (b.end_date !== undefined && !live) fields.end_date = endDate
    if (Object.keys(fields).length === 0 && b.lifecycle === undefined) throw new Error('Nothing to change')
    try {
      if (Object.keys(fields).length) {
        const rows = await store.patchNoTs<{ id: string }[]>('policies', `id=eq.${id}`, { ...fields, updated_at: new Date().toISOString() })
        if (rows.length === 0) throw new Error('Policy not found')
      }
      if (live) await markPolicyLive(id, { policy_number: policyNumber, start_date: startDate, end_date: endDate, insurer }, user.email)
      else if (isPolicyLifecycle(b.lifecycle)) await setLifecycle(id, b.lifecycle, user.email)
    } catch (e) {
      if (/policies_policy_number_key|duplicate key/i.test(e instanceof Error ? e.message : '')) throw new Error('That policy number is already on another policy')
      throw e
    }
    return { ok: true as const }
  })
}

export async function choosePolicy(id: string, quoteId: string) {
  return staffAction('choose quote', async user => {
    if (!isUuid(quoteId)) throw new Error('quote_id is required')
    await choosePolicyQuote(policyId(id), quoteId, user.email)
    return { ok: true as const }
  })
}

/** The renewal pack: last term, this term, the figures for advice. `asOf` is YYYY-MM-DD. */
export async function renewalPack(id: string, asOf?: string) {
  return staffAction('renewal pack', async () => {
    if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('as_of must be YYYY-MM-DD')
    const pack = await getRenewalPack(policyId(id), asOf)
    if (!pack) throw new Error('Policy not found')
    return pack
  })
}

/** Drafts the renewal advice email (a model call) and opens the work item for it. */
export async function draftRenewal(id: string) {
  return staffAction('draft renewal', async user => draftRenewalAdvice(policyId(id), user.email))
}

export type MovementInput = { kind?: unknown; member_name?: unknown; relationship?: unknown; effective_on?: unknown; pax?: unknown; detail?: unknown }

/** Records a joiner, leaver or change on the policy. */
export async function addMovement(id: string, b: MovementInput) {
  return staffAction('add movement', async user => {
    policyId(id)
    if (typeof b.kind !== 'string' || !(MOVEMENT_KINDS as string[]).includes(b.kind)) throw new Error('kind must be join, leave or change')
    if (!isText(b.member_name)) throw new Error('member_name is required')
    if (b.effective_on != null && b.effective_on !== '' && !isDate(b.effective_on)) throw new Error('effective_on must be YYYY-MM-DD')
    if (b.pax != null && (!Number.isInteger(Number(b.pax)) || Number(b.pax) < 1)) throw new Error('pax must be a whole number of 1 or more')
    const p = await policyRow(id)
    if (!p) throw new Error('Policy not found')
    if (!p.company_id) throw new Error('Policy has no company')
    const movement = await recordMovement(id, p.company_id, {
      kind: b.kind as MovementKind, member_name: b.member_name, relationship: typeof b.relationship === 'string' ? b.relationship : null,
      effective_on: isDate(b.effective_on) ? b.effective_on : null, pax: b.pax != null ? Number(b.pax) : 1,
      detail: b.detail && typeof b.detail === 'object' && !Array.isArray(b.detail) ? (b.detail as Record<string, unknown>) : {},
    })
    await store.log({ company_id: p.company_id, kind: 'change', actor: user.email, text: `${movement.kind === 'join' ? 'Joiner' : movement.kind === 'leave' ? 'Leaver' : 'Change'} recorded: ${movement.member_name}${movement.effective_on ? ` from ${movement.effective_on}` : ''}`, detail: { policy_id: id, movement_id: movement.id } })
    return { movement }
  })
}

/** Drafts the endorsement request to the insurer for the reported movements (a draft; nothing sends). */
export async function requestEndorsement(id: string) {
  return staffAction('request endorsement', async user => {
    const p = await policyRow(policyId(id))
    if (!p) throw new Error('Policy not found')
    const movements = (await rows('Reported movements', db().from('policy_movements').select('*').eq('policy_id', id).eq('status', 'reported').is('sent_draft_id', null).order('created_at'))) as unknown as PolicyMovement[]
    if (movements.length === 0) throw new Error('No reported movements waiting for a request')
    return requestMovements(p, movements, user.email)
  })
}

/** After the endorsement request draft is sent: marks its movements sent and logs it. */
export async function movementsSent(b: { draft_id?: unknown; gmail_thread_id?: unknown; gmail_message_id?: unknown }) {
  return staffAction('movements sent', async user => {
    if (!isUuid(b.draft_id)) throw new Error('draft_id must be a uuid')
    const [draft] = await store.pendingDrafts([b.draft_id])
    const sent = await markMovementsSent(b.draft_id)
    if (sent.length) {
      await store.log({ company_id: sent[0].company_id, kind: 'sent', actor: user.email, text: `Endorsement request sent${draft?.to_email ? ` to ${draft.to_email}` : ''}: ${sent.length} movement${sent.length === 1 ? '' : 's'}`,
        thread_id: draft?.thread_id ?? null, detail: { ai_draft_id: b.draft_id, policy_id: sent[0].policy_id, gmail_thread_id: typeof b.gmail_thread_id === 'string' ? b.gmail_thread_id : null, gmail_message_id: typeof b.gmail_message_id === 'string' ? b.gmail_message_id : null } })
    }
    return { ok: true as const, movements: sent.length }
  })
}

export type TransactionInput = { kind?: unknown; note_no?: unknown; issued_on?: unknown; pax?: unknown; amount?: unknown; currency?: unknown; description?: unknown; period_start?: unknown; period_end?: unknown; member_names?: unknown }

/** Records an insurer's debit or credit note on the policy and matches it to open movements. */
export async function addTransaction(id: string, b: TransactionInput) {
  return staffAction('add transaction', async user => {
    policyId(id)
    if (typeof b.kind !== 'string' || !(TRANSACTION_KINDS as string[]).includes(b.kind)) throw new Error('kind must be debit or credit')
    const amount = Number(b.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be a positive number')
    if (b.pax != null && b.pax !== '' && (!Number.isInteger(Number(b.pax)) || Number(b.pax) < 0)) throw new Error('pax must be a whole number')
    const text = (v: unknown) => typeof v === 'string' ? v : null
    const issuedOn = optDate(b.issued_on, 'issued_on'), periodStart = optDate(b.period_start, 'period_start'), periodEnd = optDate(b.period_end, 'period_end')
    const p = await policyRow(id)
    if (!p) throw new Error('Policy not found')
    if (!p.company_id) throw new Error('Policy has no company')
    const { transaction, duplicate } = await recordTransaction(id, p.company_id, {
      kind: b.kind as TransactionKind, note_no: text(b.note_no), issued_on: issuedOn,
      pax: b.pax != null && b.pax !== '' ? Number(b.pax) : null, amount, currency: text(b.currency), description: text(b.description),
      period_start: periodStart, period_end: periodEnd, insurer: p.insurer,
      member_names: Array.isArray(b.member_names) ? b.member_names.filter((s): s is string => typeof s === 'string') : [],
    })
    if (duplicate) return { transaction, duplicate: true as const, matched: 0 }
    const matched = matchMovement(transaction, await openMovements(id))
    await noteMovements(transaction.id, matched)
    await store.log({ company_id: p.company_id, kind: 'info', actor: user.email, text: `${p.insurer ?? 'Insurer'} ${transaction.kind} note${transaction.note_no ? ` ${transaction.note_no}` : ''} recorded: ${transaction.currency} ${transaction.amount.toLocaleString('en-SG')}${matched.length ? ` for ${matched.map(m => m.member_name).join(', ')}` : ''}`,
      detail: { policy_id: id, transaction_id: transaction.id, movement_ids: matched.map(m => m.id) } })
    return { transaction, duplicate: false as const, matched: matched.length }
  })
}

/**
 * Raises TRS's debit note for an insurer's note: an import bundle from its document, then read
 * (a model call). The route this replaced called the bundle-read route over HTTP; that route went
 * with the Finance actions on 21 Nov, so the read is called directly here.
 */
export async function billTransaction(id: string) {
  return staffAction('bill transaction', async () => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Transaction id is not valid')
    const { bundleId } = await bundleForTransaction(id)
    const read = await extractBundle(bundleId)
    return { bundle_id: bundleId, extracted: read.ok }
  })
}

export async function movements() {
  return staffAction('movements', async () => movementBatches())
}

export async function working() {
  return staffAction('working on', async () => workingRows())
}
