/**
 * Combine: one case from the threads a person ticked on Today › Mail (src/lib/cases/combine.ts).
 *
 * GET  ?threads=a,b,c[&company=<id>] → what the form opens with: each thread's side, the insurer it
 *      names and the case that holds it, the insurers on file, the client most of the threads
 *      belong to (or the one asked for) and that client's open cases, a kind of case and a title.
 * POST { company_id, case_type, title, threads: [{ id, side, insurer_id? }], move?: [thread id] }
 *      starts the case; { work_item_id, threads, move? } adds the threads to an open one.
 *      → { id }. A thread another case holds answers 409 with `conflicts` unless it is in `move`.
 *
 * A thread in a colleague's mailbox answers 403. No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { COMBINE_MAX, isId, readCombine } from '@/lib/cases/combine'
import { combinePreview, combineThreads } from '@/lib/cases/combine-store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const q = req.nextUrl.searchParams
  const threads = [...new Set((q.get('threads') ?? '').split(',').filter(isId))]
  if (threads.length > COMBINE_MAX) return NextResponse.json({ error: `Combine up to ${COMBINE_MAX} threads at a time.` }, { status: 400 })
  const company = q.get('company')
  if (company && !isId(company)) return NextResponse.json({ error: 'Choose the client.' }, { status: 400 })
  try {
    return NextResponse.json(await combinePreview(threads, who.actor, company || null))
  } catch (e) {
    return caseFail(e)
  }
}

export async function POST(req: NextRequest) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const input = readCombine(await req.json().catch(() => null))
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })
  try {
    return NextResponse.json(await combineThreads(input, who.actor))
  } catch (e) {
    return caseFail(e)
  }
}
