'use server'
/**
 * Debit notes (21 Nov 2026): the register, one note, issue, edit, delete, its documents zipped,
 * the next number, the preview's context, the import bundles and the policy lookup. They replace
 * /api/debit-notes, /[id], /[id]/zip-attachment, /next-number, /preview-context,
 * /imports/bundles[/id][/approve|/extract|/reject|/from-zip] and /api/policies/lookup.
 * The PDF and preview routes stay: they return files.
 */
import { staffAction } from '@/lib/auth/action'
import { db, rows, one } from '@/lib/db/client'
import { generateDebitNoteNumber } from '@/lib/debit-note-commit'
import { getBankProfileForCurrency } from '@/lib/debit-note-bank-profile'
import { debitNoteAssetsPresent } from '@/lib/debit-note-pdf-server'
import { extractBundle } from '@/lib/debit-notes/extract-bundle'
import type { ExtractedDebitNote } from '@/lib/debit-note-extract'
import { logActivity } from '@/lib/log-activity'
import {
  approveBundle, bundleFromZip, deleteDebitNote, issueDebitNote, loadFull, lookupPolicy, updateDebitNote, zipDebitNoteDocuments,
  type BundleApproval, type DebitNotePatch, type IssueInput, type PolicyLookup,
} from '@/lib/debit-notes/server'

const REGISTER = 'id, debit_note_no, issue_date, payment_due_date, currency, gross_amount, fee_rebate, net_amount, commission, paid_amount, status, insurer, source, company_id, policy_id, companies(name:company_name), policies(policy_number, broker, class_of_insurance, end_date)'

/** The latest 500 debit notes, optionally for one company, status or insurer. */
export async function debitNotes(filter: { companyId?: string | null; status?: string | null; insurer?: string | null } = {}) {
  return staffAction('debit notes', async () => {
    let q = db().from('debit_notes').select(REGISTER)
    if (filter.companyId) q = q.eq('company_id', filter.companyId)
    if (filter.status) q = q.eq('status', filter.status)
    if (filter.insurer) q = q.ilike('insurer', `%${filter.insurer.replace(/[%_\\]/g, m => `\\${m}`)}%`)
    return rows<Record<string, unknown>>('Debit notes', q.order('issue_date', { ascending: false }).limit(500))
  })
}

export async function debitNote(id: string) {
  return staffAction('debit note', async () => {
    const row = await loadFull(id)
    if (!row) throw new Error('Not found')
    return row as Record<string, unknown>
  })
}

export async function issue(input: IssueInput) {
  return staffAction('issue debit note', async user => issueDebitNote(input, user.email))
}

export async function editDebitNote(id: string, patch: DebitNotePatch) {
  return staffAction('edit debit note', async () => updateDebitNote(id, patch))
}

export async function removeDebitNote(id: string) {
  return staffAction('delete debit note', async () => deleteDebitNote(id))
}

export async function zipDocuments(id: string, storageUrls: string[]) {
  return staffAction('zip documents', async () => zipDebitNoteDocuments(id, storageUrls))
}

export async function nextDebitNoteNumber(issueDate?: string | null) {
  return staffAction('next number', async () => ({ debitNoteNo: await generateDebitNoteNumber(issueDate || new Date().toISOString().slice(0, 10)) }))
}

/** What the live preview needs: the bank details for the currency, the client's name and address. */
export async function previewContext(currency?: string | null, companyId?: string | null) {
  return staffAction('preview context', async () => {
    const [bankProfile, company] = await Promise.all([
      getBankProfileForCurrency(currency ?? null),
      companyId ? one<{ name: string; address: string | null }>('Company', db().from('companies').select('name:company_name, address').eq('id', companyId).maybeSingle()) : Promise.resolve(null),
    ])
    return { bankProfile, company, assets: debitNoteAssetsPresent() }
  })
}

export async function policyLookup(q: PolicyLookup) {
  return staffAction('policy lookup', async () => lookupPolicy(q))
}

// ── Imports ─────────────────────────────────────────────────────────────────

const BUNDLE = '*, companies:suggested_company_id(id, name:company_name), pdf_import_items(id, storage_url, original_filename, doc_type, status, error_message)'

export async function bundles(status?: string | null) {
  return staffAction('bundles', async () => {
    let q = db().from('debit_note_bundles').select(BUNDLE)
    if (status) q = q.eq('status', status)
    return rows<Record<string, unknown>>('Bundles', q.order('created_at', { ascending: false }).limit(500))
  })
}

/** A new bundle from files already uploaded. */
export async function createBundle(files: { storage_url: string; original_filename?: string }[]) {
  return staffAction('create bundle', async () => {
    if (!files?.length) throw new Error('files required')
    const bundle = await one<{ id: string }>('New bundle', db().from('debit_note_bundles').insert({ status: 'pending', source: 'manual_upload' }).select('id').single())
    if (!bundle) throw new Error('The bundle was not created.')
    const { error } = await db().from('pdf_import_items').insert(files.map(f => ({ bundle_id: bundle.id, storage_url: f.storage_url, original_filename: f.original_filename ?? null, status: 'pending' })))
    if (error) throw new Error(error.message)
    return { id: bundle.id }
  })
}

export async function createBundleFromZip(storageUrl: string) {
  return staffAction('bundle from zip', async () => bundleFromZip(storageUrl))
}

/** Reads the bundle's files (a model call, up to 180 s). */
export async function extract(id: string) {
  return staffAction('extract bundle', async () => {
    const r = await extractBundle(id)
    if (!r.ok) throw new Error(r.error)
    return { ok: true as const, merged: r.merged, warning: r.warning, suggestedCompanyId: r.suggestedCompanyId, matchConfidence: r.matchConfidence }
  })
}

/** Keeps a person's corrections to what was read. */
export async function saveBundle(id: string, merged: Partial<ExtractedDebitNote>) {
  return staffAction('save bundle', async () => {
    if (!merged) throw new Error('merged required')
    const { error } = await db().from('debit_note_bundles').update({ merged: merged as never }).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })
}

export async function approve(id: string, body: BundleApproval) {
  return staffAction('approve bundle', async user => approveBundle(id, body, user.email))
}

export async function reject(id: string) {
  return staffAction('reject bundle', async () => {
    const { error } = await db().from('debit_note_bundles').update({ status: 'rejected' }).eq('id', id)
    if (error) throw new Error(error.message)
    void logActivity({ action: 'debit_note_bundle.rejected', resource_type: 'debit_note_bundle', resource_id: id })
    return { ok: true as const }
  })
}
