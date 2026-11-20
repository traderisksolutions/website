/**
 * Filing (docs/filing.md): the File button's two calls.
 *
 * GET  ?attachment=<id> | ?document=<id> [&company=<id>] → FilingSuggestion: the file, its record if
 *      any, the company (from the thread unless given), the company's policies, the suggested type and
 *      policy, and the Drive path that would result.
 * POST { attachment_id | document_id, company_id, policy_id (uuid | null), doc_type } → { document }:
 *      the record written and the file in its folder. A file already in Drive moves; same link.
 *
 * A file on a colleague's private thread answers 403. No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor } from '@/lib/cases/http'
import { FilingError, fileIt, suggest } from '@/lib/filing/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const id = (v: unknown): string | undefined => (typeof v === 'string' && UUID.test(v) ? v : undefined)

function fail(e: unknown): NextResponse {
  if (e instanceof FilingError) return NextResponse.json({ error: e.message }, { status: e.status })
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const q = req.nextUrl.searchParams
  const ref = { attachmentId: id(q.get('attachment')), documentId: id(q.get('document')), companyId: id(q.get('company')) }
  if (!ref.attachmentId && !ref.documentId) return NextResponse.json({ error: 'Choose the file.' }, { status: 400 })
  try {
    return NextResponse.json(await suggest(ref, who.actor))
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req: NextRequest) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const attachmentId = id(b?.attachment_id), documentId = id(b?.document_id), companyId = id(b?.company_id)
  if (!attachmentId && !documentId) return NextResponse.json({ error: 'Choose the file.' }, { status: 400 })
  if (!companyId) return NextResponse.json({ error: 'Choose the company.' }, { status: 400 })
  if (b?.policy_id !== null && b?.policy_id !== undefined && !id(b.policy_id)) return NextResponse.json({ error: 'Policy id is not valid.' }, { status: 400 })
  try {
    const document = await fileIt({ attachmentId, documentId, companyId, policyId: id(b?.policy_id) ?? null, docType: String(b?.doc_type ?? '') }, who.actor)
    return NextResponse.json({ document })
  } catch (e) {
    return fail(e)
  }
}
