/** One way for the case routes to answer: who is asking, and a CaseError as its own status. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { currentUserEmail } from '@/lib/crm/auth'
import { CaseError } from './sources-store'

/** The signed-in person, lower-cased, or the response that turns the request away. Mail is shown per person, so a cron call has no view. */
export async function caseActor(req: NextRequest): Promise<{ actor: string } | { refused: NextResponse }> {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return { refused: unauthorized }
  const actor = await currentUserEmail()
  if (!actor) return { refused: NextResponse.json({ error: 'Sign in to work on a case.' }, { status: 401 }) }
  return { actor: actor.toLowerCase() }
}

export function caseFail(e: unknown): NextResponse {
  if (e instanceof CaseError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status })
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
}
