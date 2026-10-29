/**
 * POST /api/documents/[id]/policy { class_of_insurance? } → { policy_id, document }
 * A document proves cover the dashboard has no record of: create the policy from what the agent
 * read off it, link the document, and move its Drive file into the new policy's folder.
 * 409 when the company already has a policy with that number.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import * as store from '@/lib/documents/store'
import { updateDocument } from '@/lib/documents/ingest'
import { createPolicy, policyExists, policyFromDocument } from '@/lib/documents/policy'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Document id is not valid')
  try {
    const doc = await store.documentById(id)
    if (!doc) return fail('Document not found', 404)
    if (!doc.company_id) return fail('File the document to a company first', 409)
    if (doc.policy_id) return fail('This document already belongs to a policy', 409)
    if (doc.policy_number) {
      const existing = await policyExists(doc.company_id, doc.policy_number)
      if (existing) return fail(`A policy numbered ${doc.policy_number} is already on file for this company`, 409)
    }
    const b = await readBody<{ class_of_insurance?: unknown }>(req)
    const cls = typeof b?.class_of_insurance === 'string' && b.class_of_insurance.trim() ? b.class_of_insurance.trim().slice(0, 80) : doc.class_of_insurance ?? doc.title
    const { id: policyId } = await createPolicy(policyFromDocument(doc, cls), actor)
    const updated = await updateDocument(id, { policy_id: policyId })
    return NextResponse.json({ policy_id: policyId, document: updated }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
