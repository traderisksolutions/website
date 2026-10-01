/**
 * GET  /api/group-benefits/canon   → the vocabulary, and how much of the live data it covers
 * POST /api/group-benefits/canon   → { action: 'sync' }                push the vocabulary from code to the database
 *                                    { action: 'map', apply?: bool }   resolve insurer labels onto it
 *
 * The map action defaults to a dry run. It reports what it would write and changes nothing,
 * because the first pass over a live rate table is the moment to read the result rather than
 * trust it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { logActivity } from '@/lib/log-activity'
import { PRODUCTS, BENEFITS } from '@/lib/gb/canon'
import { syncCanon, mapLabels } from '@/lib/gb/store'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const sbH = () => {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const [rates, benefits] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/gb_rates?select=canon_codes&limit=5000`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/gb_benefits?select=canon_benefit&limit=5000`, { headers: sbH(), cache: 'no-store' }),
    ])
    const r = rates.ok ? await rates.json() as { canon_codes: string[] | null }[] : []
    const b = benefits.ok ? await benefits.json() as { canon_benefit: string | null }[] : []
    return NextResponse.json({
      products: PRODUCTS,
      benefits: BENEFITS,
      coverage: {
        rateRows:    { total: r.length, mapped: r.filter(x => x.canon_codes?.length).length },
        benefitRows: { total: b.length, mapped: b.filter(x => x.canon_benefit).length },
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { action, apply } = await req.json().catch(() => ({})) as { action?: string; apply?: boolean }
    if (action === 'sync') {
      const out = await syncCanon()
      void logActivity({ action: 'gb.canon.sync', resource_type: 'gb_canon', new_value: out })
      return NextResponse.json({ ok: true, ...out })
    }
    if (action === 'map') {
      const report = await mapLabels({ apply: !!apply })
      if (apply) void logActivity({ action: 'gb.canon.map', resource_type: 'gb_canon', new_value: report.written })
      return NextResponse.json(report)
    }
    return NextResponse.json({ error: "action must be 'sync' or 'map'" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
