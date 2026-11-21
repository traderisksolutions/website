/**
 * The scheme file (docs/eb-v2.md P2; src/lib/gb/scheme.ts).
 *
 * GET ?company=<id>[&effective=<YYYY-MM-DD>]
 *     → { tables, plan_year, scheme, previous }: that plan year's census and last year's policy as
 *       read (no date: the newest plan year on file), and the previous plan year's census for the
 *       changes. { tables: false } before the migration.
 * PUT { company_id, effective_date, basis?, insurer?, census?: { file, members }, last_year?, last_year_files? }
 *     → { scheme }: what /eb just read, kept for the plan year.
 *
 * No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor } from '@/lib/cases/http'
import { planYearFor } from '@/lib/gb/scheme'
import type { Member } from '@/lib/gb-quote'
import { getScheme, latestScheme, previousScheme, saveScheme, schemeTablesReady, type SchemeWrite } from '@/lib/gb/scheme-store'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_MEMBERS = 5000

export async function GET(req: NextRequest) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const q = req.nextUrl.searchParams
  const company = q.get('company') ?? '', effective = q.get('effective') ?? ''
  if (!UUID.test(company)) return NextResponse.json({ error: 'Choose the company.' }, { status: 400 })
  if (effective && !DATE.test(effective)) return NextResponse.json({ error: 'The policy start date is not valid.' }, { status: 400 })
  if (!(await schemeTablesReady())) return NextResponse.json({ tables: false, plan_year: null, scheme: null, previous: null })
  const scheme = effective ? await getScheme(company, planYearFor(effective)!) : await latestScheme(company)
  const planYear = scheme?.plan_year ?? (effective ? planYearFor(effective) : null)
  const previous = planYear ? await previousScheme(company, planYear) : null
  return NextResponse.json({
    tables: true, plan_year: planYear, scheme,
    previous: previous?.census ? { plan_year: previous.plan_year, file: previous.census.file, members: previous.census.members } : null,
  })
}

export async function PUT(req: NextRequest) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const company = String(b?.company_id ?? ''), effective = String(b?.effective_date ?? '')
  if (!UUID.test(company)) return NextResponse.json({ error: 'Choose the company.' }, { status: 400 })
  const planYear = DATE.test(effective) ? planYearFor(effective) : null
  if (!planYear) return NextResponse.json({ error: 'Set the policy start date.' }, { status: 400 })
  if (!(await schemeTablesReady())) return NextResponse.json({ tables: false, scheme: null })
  const w: SchemeWrite = { company_id: company, plan_year: planYear, effective_date: effective }
  if (b?.basis === 'renewal' || b?.basis === 'new_business') w.basis = b.basis
  if (typeof b?.insurer === 'string') w.insurer = b.insurer.slice(0, 120) || null
  if (b && 'census' in b) {
    const c = b.census as { file?: unknown; members?: unknown } | null
    if (c !== null && (typeof c?.file !== 'string' || !Array.isArray(c.members) || c.members.length > MAX_MEMBERS)) return NextResponse.json({ error: 'The census is not valid.' }, { status: 400 })
    w.census = c ? { file: (c.file as string).slice(0, 200), members: c.members as Member[] } : null
  }
  if (b && 'last_year' in b) {
    w.last_year = (b.last_year ?? null) as SchemeWrite['last_year']
    w.last_year_files = Array.isArray(b.last_year_files) ? (b.last_year_files as unknown[]).slice(0, 20).flatMap(f => {
      const x = f as { name?: unknown; attachment_id?: unknown }
      return typeof x?.name === 'string' ? [{ name: x.name.slice(0, 200), attachment_id: typeof x.attachment_id === 'string' && UUID.test(x.attachment_id) ? x.attachment_id : null }] : []
    }) : []
  }
  try {
    return NextResponse.json({ tables: true, scheme: await saveScheme(w, who.actor) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
