/**
 * PATCH /api/documents/[id] { doc_type?, policy_id? (uuid | null), ignore? } → the corrected row.
 * A broker re-types or re-sorts a document; its Drive file moves to match.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import { updateDocument } from '@/lib/documents/ingest'
import { isDocType } from '@/lib/documents/taxonomy'
import * as store from '@/lib/documents/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Document id is not valid')
  const b = await readBody<{ doc_type?: unknown; policy_id?: unknown; ignore?: unknown }>(req)
  if (!b) return fail('Send the fields to change')
  const patch: Parameters<typeof updateDocument>[1] = {}
  if (b.doc_type !== undefined) {
    if (!isDocType(b.doc_type)) return fail('Document type is not known')
    patch.doc_type = b.doc_type
  }
  if (b.policy_id !== undefined) {
    if (b.policy_id !== null && !isUuid(b.policy_id)) return fail('Policy id is not valid')
    if (b.policy_id) {
      const [doc, policy] = await Promise.all([store.documentById(id), store.policy(b.policy_id as string)])
      if (!doc || !policy) return fail('Document or policy not found', 404)
      if (policy.company_id !== doc.company_id) return fail('That policy belongs to another company', 409)
    }
    patch.policy_id = b.policy_id as string | null
  }
  if (b.ignore === true) patch.status = 'ignored'
  if (Object.keys(patch).length === 0) return fail('Nothing to change')
  try {
    const doc = await updateDocument(id, patch)
    if (!doc) return fail('Document not found', 404)
    return NextResponse.json({ document: doc })
  } catch (e) {
    return errorResponse(e)
  }
}
