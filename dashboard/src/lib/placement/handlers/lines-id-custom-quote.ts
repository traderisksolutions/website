/**
 * GET  /api/placements/lines/[id]/custom-quote → { counts, quotes }
 *      the line's census as counts (plans, family tiers, lives) and the custom-rate quotes on it
 * POST /api/placements/lines/[id]/custom-quote { insurer_name, rates: ProductRate[], stated_total? }
 *      → { quote, result, check }
 *      totals an insurer's per-head or per-S$1,000 rates against the census and files the quote
 *      beside the rate engine's (src/lib/placement/eb.ts fileCustomQuote). No email is sent.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { censusCounts, parseProductRate, type ProductRate } from '@/lib/gb/custom-quote'
import { censusForLine, fileCustomQuote, loadLine } from '@/lib/placement/eb'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import * as store from '@/lib/placement/store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Line id is not valid')
  try {
    const line = await loadLine(id)
    if (!line) return fail('Line not found', 404)
    const bundle = await store.loadPlacement(line.placement_id)
    const census = await censusForLine(line, bundle?.quotes ?? [])
    const quotes = (bundle?.quotes ?? []).filter(q => q.line_id === id && (q as { source?: string }).source === 'custom_rates' && q.status !== 'superseded')
      .map(q => ({ id: q.id, insurer_name: q.insurer_name, premium_amount: q.premium_amount, custom: (q.evidence as Record<string, unknown> | null)?.custom ?? null, created_at: q.created_at }))
    return NextResponse.json({ counts: census.length ? censusCounts(census) : null, quotes })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Line id is not valid')
  const b = await readBody<Record<string, unknown>>(req)
  if (!b) return fail('Send the insurer and its rates')
  const insurerName = typeof b.insurer_name === 'string' && b.insurer_name.trim().length <= 120 ? b.insurer_name.trim() : ''
  if (!insurerName) return fail('Enter the insurer')
  if (!Array.isArray(b.rates) || !b.rates.length || b.rates.length > 20) return fail('Enter rates for 1 to 20 products')
  const rates: ProductRate[] = []
  for (const r of b.rates) { const p = parseProductRate(r); if (typeof p === 'string') return fail(p); rates.push(p) }
  const given = b.stated_total != null && b.stated_total !== ''
  const statedTotal = given && typeof b.stated_total === 'number' && Number.isFinite(b.stated_total) && b.stated_total >= 0 ? b.stated_total : null
  if (given && statedTotal == null) return fail('The stated total is not a number')
  try {
    return NextResponse.json(await fileCustomQuote(id, { insurerName, rates, statedTotal, actor }), { status: 201 })
  } catch (e) {
    // Census missing, a plan without a rate: the broker can fix these.
    if (e instanceof Error && /^No (census|rate)/.test(e.message)) return fail(e.message)
    return errorResponse(e)
  }
}
