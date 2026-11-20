/**
 * Each insurer on a kept quotation (docs/eb-v2.md P5; src/lib/gb/insurer-track.ts).
 *
 * GET → { insurers, placementQuotes }: per insurer the route (computed, or a broker's override with
 *       its reason), where the request stands with each step's date, the note; and the placement
 *       module's Employment Benefits quotes for the client.
 * PUT { insurer, status?, route? ('brochure' | 'quote' | null), override_reason?, note? } → { insurer }.
 *       A new status stamps its date; a route other than the computed one needs a reason.
 *
 * No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor } from '@/lib/cases/http'
import { isInsurerStatus } from '@/lib/gb/insurer-track'
import { changeInsurer, insurersOf, TrackError } from '@/lib/gb/insurer-track-store'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fail(e: unknown) {
  if (e instanceof TrackError) return NextResponse.json({ error: e.message }, { status: e.status })
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not a quotation id' }, { status: 400 })
  try {
    const r = await insurersOf(id)
    return r ? NextResponse.json(r) : NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
  } catch (e) { return fail(e) }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not a quotation id' }, { status: 400 })
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (typeof b?.insurer !== 'string' || !b.insurer.trim()) return NextResponse.json({ error: 'Choose the insurer.' }, { status: 400 })
  if (b.status !== undefined && !isInsurerStatus(b.status)) return NextResponse.json({ error: 'That status is not known.' }, { status: 400 })
  if (b.route !== undefined && b.route !== null && b.route !== 'brochure' && b.route !== 'quote') return NextResponse.json({ error: 'That route is not known.' }, { status: 400 })
  try {
    const insurer = await changeInsurer(id, b.insurer, {
      status: b.status as never, route: b.route as never,
      override_reason: typeof b.override_reason === 'string' ? b.override_reason : undefined,
      note: b.note === null ? null : typeof b.note === 'string' ? b.note : undefined,
    }, who.actor)
    return NextResponse.json({ insurer })
  } catch (e) { return fail(e) }
}
