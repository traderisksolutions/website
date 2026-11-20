/** One way for the renewal routes to answer: who is asking, and a RenewalError as its own status. */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor } from '@/lib/cases/http'
import { RenewalError } from './store'

export const renewalActor = (req: NextRequest) => caseActor(req)

export function renewalFail(e: unknown): NextResponse {
  if (e instanceof RenewalError) return NextResponse.json({ error: e.message }, { status: e.status })
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
}
