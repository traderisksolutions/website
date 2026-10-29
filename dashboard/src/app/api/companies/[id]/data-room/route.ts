/**
 * GET  /api/companies/[id]/data-room → every policy with its documents and data-room status,
 *      plus the documents waiting to be sorted.
 * POST /api/companies/[id]/data-room (multipart: file, policy_id?, doc_type?) → uploads a file
 *      (a PDF sent on WhatsApp, a scan), classifies it, files it in Drive. Returns the row.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { errorResponse, fail, gate, isUuid } from '@/lib/placement/api'
import * as store from '@/lib/documents/store'
import { uploadDocument } from '@/lib/documents/ingest'
import { dataRoomStatus, isDocType } from '@/lib/documents/taxonomy'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_BYTES = 25 * 1024 * 1024

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Company id is not valid')
  try {
    const [policies, docs] = await Promise.all([store.companyPolicies(id), store.companyDocuments(id)])
    const byPolicy = new Map<string, store.PolicyDocument[]>()
    for (const d of docs) if (d.policy_id) byPolicy.set(d.policy_id, [...(byPolicy.get(d.policy_id) ?? []), d])
    const rooms = policies
      .filter(p => p.lifecycle !== 'closed' && p.lifecycle !== 'declined')
      .map(p => {
        const held = byPolicy.get(p.id) ?? []
        return {
          policy: { id: p.id, label: p.label ?? p.class_of_insurance, insurer: p.insurer, policy_number: p.policy_number ?? p.cover_note_no, lifecycle: p.lifecycle, start_date: p.start_date, end_date: p.end_date, drive_folder_url: p.drive_folder_url, is_eb: p.is_eb },
          status: dataRoomStatus({ lifecycle: p.lifecycle, is_eb: p.is_eb, product_line: p.product_line }, held.map(d => d.doc_type)),
          documents: held,
        }
      })
    const letters = docs.filter(d => !d.policy_id && d.doc_type === 'broker_appointment')
    const unsorted = docs.filter(d => !d.policy_id && d.doc_type !== 'broker_appointment')
    return NextResponse.json({ rooms, unsorted, letters, total: docs.length })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Company id is not valid')
  try {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') return fail('Choose a file to upload')
    if (file.size === 0) return fail('The file is empty')
    if (file.size > MAX_BYTES) return fail('Files up to 25 MB can be uploaded')
    const policyId = form?.get('policy_id')
    const docType = form?.get('doc_type')
    if (policyId && (typeof policyId !== 'string' || !isUuid(policyId))) return fail('Policy id is not valid')
    if (docType && !isDocType(docType)) return fail('Document type is not known')
    const bytes = Buffer.from(await file.arrayBuffer())
    let text: string | null = null
    if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) text = await pdfText(bytes)
    const doc = await uploadDocument({
      companyId: id, policyId: (policyId as string) || null, filename: file.name, mimeType: file.type || 'application/octet-stream',
      bytes, actor, text, docType: (docType as string) || null,
    })
    if (!doc) return fail('The document was not saved', 500)
    return NextResponse.json({ document: doc }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}

/** Text of a PDF for the classifier; empty when it is a scan or locked. */
async function pdfText(bytes: Buffer): Promise<string | null> {
  let parser: { getText: () => Promise<{ text?: string }>; destroy: () => Promise<void> } | null = null
  try {
    const { PDFParse } = await import('pdf-parse')
    const Ctor = PDFParse as unknown as new (o: { data: Uint8Array }) => NonNullable<typeof parser>
    parser = new Ctor({ data: new Uint8Array(bytes) })
    return ((await parser.getText())?.text ?? '').trim() || null
  } catch {
    return null
  } finally {
    await parser?.destroy().catch(() => undefined)
  }
}
