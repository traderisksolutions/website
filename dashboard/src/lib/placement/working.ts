/**
 * Policies being worked on: one row per open placement line, grouped by client, with two stages a
 * person can read at a glance (client side, insurer side). A stage set by hand wins; otherwise it is
 * worked out from where the line stands (src/lib/placement/grid.ts lineStage). Pure.
 */
import type { RegisterStage } from './grid'

export const CLIENT_STAGES = [
  ['data_requested', 'Data requested'], ['data_received', 'Data received'], ['quote_sent', 'Quote sent'],
  ['client_decided', 'Client decided'], ['signed_paid', 'Signed and paid'],
] as const
export const INSURER_STAGES = [
  ['not_asked', 'Not asked'], ['asked', 'Asked'], ['quotes_in', 'Quotes in'], ['placed', 'Placed'], ['policy_issued', 'Policy issued'],
] as const
export const REQUEST_TYPES = [['renewal', 'Renewal'], ['new', 'New policy'], ['endorsement', 'Endorsement'], ['claim', 'Claim']] as const

export type ClientStage = (typeof CLIENT_STAGES)[number][0]
export type InsurerStage = (typeof INSURER_STAGES)[number][0]
export type RequestType = (typeof REQUEST_TYPES)[number][0]

const has = <T extends string>(list: readonly (readonly [T, string])[], v: unknown): v is T => typeof v === 'string' && list.some(([k]) => k === v)
export const isClientStage = (v: unknown): v is ClientStage => has(CLIENT_STAGES, v)
export const isInsurerStage = (v: unknown): v is InsurerStage => has(INSURER_STAGES, v)
export const isRequestType = (v: unknown): v is RequestType => has(REQUEST_TYPES, v)

/** Where each side stands, from the line's register stage, when nobody has set it. */
export function derivedStages(stage: RegisterStage): { client: ClientStage; insurer: InsurerStage } {
  const insurer: InsurerStage =
    stage === 'not_asked' || stage === 'drafted' ? 'not_asked'
      : stage === 'waiting' || stage === 'chase' ? 'asked'
        : stage === 'quoting' || stage === 'all_in' || stage === 'shared' || stage === 'client_chose' ? 'quotes_in'
          : stage === 'done' ? 'policy_issued'
            : stage === 'confirming' || stage === 'dn_due' || stage === 'bound' ? 'placed'
              : 'not_asked'
  const client: ClientStage =
    stage === 'shared' ? 'quote_sent'
      : stage === 'client_chose' || stage === 'confirming' || stage === 'dn_due' || stage === 'bound' ? 'client_decided'
        : stage === 'done' ? 'signed_paid'
          : 'data_received'
  return { client, insurer }
}

/** The stage shown: the one a person set, else the derived one. */
export function shownStages(line: { client_stage?: string | null; insurer_stage?: string | null }, stage: RegisterStage): { client: ClientStage; insurer: InsurerStage; clientSet: boolean; insurerSet: boolean } {
  const d = derivedStages(stage)
  const clientSet = isClientStage(line.client_stage), insurerSet = isInsurerStage(line.insurer_stage)
  return { client: clientSet ? line.client_stage as ClientStage : d.client, insurer: insurerSet ? line.insurer_stage as InsurerStage : d.insurer, clientSet, insurerSet }
}

/** Days from today to a date, whole days, negative when past. */
export function daysTo(iso: string | null | undefined, today: string): number | null {
  if (!iso) return null
  const a = Date.parse(iso.slice(0, 10)), b = Date.parse(today.slice(0, 10))
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((a - b) / 86_400_000)
}

export type LinePatch = Partial<{ client_stage: ClientStage | null; insurer_stage: InsurerStage | null; request_type: RequestType | null; existing: boolean | null; renewal_date: string | null; previous_premium: number | null; status: 'dropped' }>

/** A line update from a request body: only the known fields, each checked. Returns an error in words. */
export function linePatchFrom(b: Record<string, unknown>): { patch: LinePatch } | { error: string } {
  const patch: LinePatch = {}
  if ('client_stage' in b) { if (b.client_stage !== null && !isClientStage(b.client_stage)) return { error: 'Unknown client stage' }; patch.client_stage = b.client_stage as ClientStage | null }
  if ('insurer_stage' in b) { if (b.insurer_stage !== null && !isInsurerStage(b.insurer_stage)) return { error: 'Unknown insurer stage' }; patch.insurer_stage = b.insurer_stage as InsurerStage | null }
  if ('request_type' in b) { if (b.request_type !== null && !isRequestType(b.request_type)) return { error: 'Unknown request type' }; patch.request_type = b.request_type as RequestType | null }
  if ('existing' in b) { if (b.existing !== null && typeof b.existing !== 'boolean') return { error: 'existing must be true, false or null' }; patch.existing = b.existing as boolean | null }
  if ('renewal_date' in b) { if (b.renewal_date !== null && !(typeof b.renewal_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.renewal_date) && !Number.isNaN(Date.parse(b.renewal_date)))) return { error: 'renewal_date must be YYYY-MM-DD' }; patch.renewal_date = b.renewal_date as string | null }
  if ('previous_premium' in b) {
    const v = b.previous_premium
    if (v !== null && !(typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9)) return { error: 'previous_premium must be a positive amount' }
    patch.previous_premium = v as number | null
  }
  if ('status' in b) { if (b.status !== 'dropped') return { error: 'Only removing a line is allowed here' }; patch.status = 'dropped' }
  if (!Object.keys(patch).length) return { error: 'Nothing to change' }
  return { patch }
}

/** "EQ Insurance Company Limited" → "EQ Insurance"; "Allianz Insurance Singapore Pte. Ltd." → "Allianz Insurance". */
export function shortInsurer(name: string): string {
  const s = name.replace(/\s*\((?:singapore|s)\)\s*/gi, ' ')
    .replace(/[,.]?\s*(pte\.?\s*ltd\.?|private limited|limited|ltd\.?|company|co\.|berhad|bhd\.?)\b\.?/gi, ' ')
    .replace(/\bsingapore\b/gi, ' ').replace(/\s{2,}/g, ' ').trim()
  return s || name
}
