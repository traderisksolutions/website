/**
 * The forms TRS sends clients, by line (client_forms). When a request is missing data, or a renewal
 * opens, the client email attaches the forms for that line by rule: the line from the intake read,
 * the liability flow from the request (src/lib/placement/lines.ts), the forms in the library.
 * Seeded on 4 Nov 2026 from what Catherine, Hasya and Nathan actually sent; admins add, retire or
 * re-file forms on Settings → Client forms.
 *
 * file_ref is a storage path or `gmail:<email_attachments.id>`; the send route reads either
 * (src/lib/storage/attachment-bytes.ts), so a form never stored is still attachable.
 */
import { sbTry } from '@/lib/crm/db'
import { liabilityFlow } from '@/lib/placement/lines'
import type { Spec } from '@/lib/placement/types'

export type FormKind = 'proposal_form' | 'template' | 'brochure' | 'product_summary' | 'claim_form' | 'letter'
export type AttachOn = 'new_request' | 'renewal'
export type ClientForm = {
  id: string; line: string; flow: string | null; kind: FormKind; insurer: string | null; title: string
  filename: string; mime_type: string | null; file_ref: string; attach_on: AttachOn[]; active: boolean
  sent_count: number; last_sent: string | null; note: string | null
}
export type DraftAttachment = { filename: string; mime_type: string | null; storage_url: string }

/** What a data request carries: the forms the client fills in, not brochures or claim forms. */
export const REQUEST_KINDS: FormKind[] = ['proposal_form', 'template']
export const MAX_FORMS = 3

/** The sub-flow a line's forms are chosen by; only liability has flows today. */
export const flowOf = (productLine: string, spec: Spec | undefined): string | null => productLine === 'general_liability' ? liabilityFlow(spec) : null

/**
 * Pure. The forms to attach: active, for the line and the occasion, of the kinds asked; a form for
 * the request's flow before a form for any flow; the most-sent first; one per filename; at most three.
 */
export function selectForms(rows: ClientForm[], q: { line: string; flow: string | null; on: AttachOn; kinds?: FormKind[] }): ClientForm[] {
  const kinds = q.kinds ?? REQUEST_KINDS
  const fit = rows.filter(r => r.active && r.line === q.line && r.attach_on.includes(q.on) && kinds.includes(r.kind) && (!r.flow || r.flow === q.flow))
  fit.sort((a, b) => Number(!!b.flow && b.flow === q.flow) - Number(!!a.flow && a.flow === q.flow) || b.sent_count - a.sent_count)
  const seen = new Set<string>()
  return fit.filter(r => { const k = r.filename.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }).slice(0, MAX_FORMS)
}

export const toAttachment = (f: ClientForm): DraftAttachment => ({ filename: f.filename, mime_type: f.mime_type, storage_url: f.file_ref })

let cache: { at: number; rows: ClientForm[] } | null = null
export async function loadForms(): Promise<ClientForm[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows
  const rows = await sbTry<ClientForm[]>('client_forms?active=eq.true&select=*&limit=1000', [])
  cache = { at: Date.now(), rows }
  return rows
}
export const clearFormsCache = () => { cache = null }

/** The attachments for one line of a request or renewal. */
export async function formsFor(productLine: string, spec: Spec | undefined, on: AttachOn): Promise<DraftAttachment[]> {
  return selectForms(await loadForms(), { line: productLine, flow: flowOf(productLine, spec), on }).map(toAttachment)
}
