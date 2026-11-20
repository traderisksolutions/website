/** One way for the case routes to answer: who is asking, and a CaseError as its own status. */
import { NextRequest, NextResponse } from 'next/server'
import { isCron, staffUser } from '@/lib/auth/guard'
import { CaseError } from './sources-store'

/** The signed-in person, lower-cased, or the response that turns the request away. Mail is shown per person, so a cron call has no view. */
export async function caseActor(req: NextRequest): Promise<{ actor: string } | { refused: NextResponse }> {
  const user = await staffUser()
  if (user) return { actor: user.email.toLowerCase() }
  if (isCron(req)) return { refused: NextResponse.json({ error: 'Sign in to work on a case.' }, { status: 401 }) }
  return { refused: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
}

export function caseFail(e: unknown): NextResponse {
  if (e instanceof CaseError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status })
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
}
