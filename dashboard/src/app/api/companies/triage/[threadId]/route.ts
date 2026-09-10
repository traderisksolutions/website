/**
 * POST /api/companies/triage/[threadId]
 *   { decision: 'accept' } | { decision: 'reject' } | { decision: 'not_client' }
 *   { decision: 'link', companyId } | { decision: 'create', name, domain?, stage? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { decideLink, type TriageDecision } from '@/lib/crm/triage'
import { currentUserEmail }          from '@/lib/crm/auth'
import { isStage }                   from '@/lib/crm/stage'

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { threadId } = await params
  try {
    const b = await req.json() as { decision?: string; companyId?: string; name?: string; domain?: string | null; stage?: string }
    let d: TriageDecision
    switch (b.decision) {
      case 'accept':     d = { decision: 'accept' }; break
      case 'reject':     d = { decision: 'reject' }; break
      case 'not_client': d = { decision: 'not_client' }; break
      case 'link':
        if (!b.companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
        d = { decision: 'link', companyId: b.companyId }; break
      case 'create':
        if (!b.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
        d = { decision: 'create', name: b.name.trim(), domain: b.domain ?? null, stage: isStage(b.stage) ? b.stage : undefined }; break
      default: return NextResponse.json({ error: 'unknown decision' }, { status: 400 })
    }
    const user = await currentUserEmail()
    const result = await decideLink(threadId, d, user)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
