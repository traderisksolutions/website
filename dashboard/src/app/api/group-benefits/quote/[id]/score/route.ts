/**
 * /api/group-benefits/quote/[id]/score
 *
 *   PUT  { settings }  → stores the broker's weights, filters and sort on the quotation.
 *   POST { settings }  → writes the plain-English explanation of the ranking, and stores it.
 *
 * Both live in gb_quotations.priorities as one JSON document — { score, explanation }. That
 * column was added in August for a free-text "what matters to this client" note that nothing
 * ever wrote; the weights are that note, made explicit. No DDL needed.
 *
 * The explanation is written from the numbers scoreComparison produces — the same function the
 * page runs — so the model is never asked to compare schedules itself, only to say in words what
 * the figures already show. It is told to use no figure it was not given. One Flash call per
 * click, on the Pricing Matrix key; nothing runs on page load.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/log-activity'
import { callGemini } from '@/lib/ai-call'
import { GEMINI_FLASH } from '@/lib/gemini-models'
import { withVoice } from '@/lib/voice'
import type { Comparison } from '@/lib/gb/compare'
import { BENEFIT_BY_CODE } from '@/lib/gb/canon'
import { censusProfile, DIMENSIONS, parseSettings, scoreComparison, WARD_FLOORS, type ScoreSettings } from '@/lib/gb/score'
import { VERIFICATION } from '@/lib/gb/verification'

export const maxDuration = 60

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export type Explanation = { points: string[]; model: string; at: string; settings: ScoreSettings }
type Stored = { score?: ScoreSettings; explanation?: Explanation }

type Q = {
  company_name: string | null; effective_date: string | null; basis: string | null
  census: { dob?: string | null; age?: number | null; relationship?: string | null }[] | null
  member_count: number | null; benefits_analysis: Comparison | null; priorities: string | null
}

async function load(id: string): Promise<Q | null> {
  const res = await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}` +
    `&select=company_name,effective_date,basis,census,member_count,benefits_analysis,priorities&limit=1`,
    { headers: sbH(), cache: 'no-store' })
  return res.ok ? ((await res.json())[0] as Q | undefined) ?? null : null
}

function stored(raw: string | null): Stored {
  if (!raw) return {}
  try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o as Stored : {} } catch { return {} }
}

async function save(id: string, doc: Stored) {
  const res = await fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}`, {
    method: 'PATCH', headers: sbH(), body: JSON.stringify({ priorities: JSON.stringify(doc) }),
  })
  if (!res.ok) throw new Error(`Could not save: ${res.status}`)
}

async function authed() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await authed()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as { settings?: unknown }
    const settings = parseSettings({ score: body.settings })
    const q = await load(id)
    if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    await save(id, { ...stored(q.priorities), score: settings })
    return NextResponse.json({ settings })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await authed()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as { settings?: unknown }
    const settings = parseSettings({ score: body.settings })
    const q = await load(id)
    if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    const cmp = q.benefits_analysis
    if (!cmp || !Array.isArray(cmp.options) || !Array.isArray(cmp.groups)) {
      return NextResponse.json({ error: 'Compare benefits first.' }, { status: 400 })
    }

    const profile = censusProfile(q.census ?? [], q.effective_date)
    const employees = cmp.employees || profile.employees || q.member_count || 0
    const result = scoreComparison(cmp, settings, employees)
    if (result.insurers.length < 2) {
      return NextResponse.json({ error: 'Two or more insurers are needed to explain a ranking.' }, { status: 400 })
    }
    // The ranking under each of the three orders, so the model can say what changes if the
    // broker cares about price alone or cover alone — computed, not inferred.
    const rankUnder = (sort: ScoreSettings['sort']) =>
      Object.fromEntries(scoreComparison(cmp, { ...settings, sort }, employees).insurers.map(i => [i.insurerName, i.rank]))
    const ranks = { value: rankUnder('value'), pepm: rankUnder('pepm'), coverage: rankUnder('coverage') }

    // The headline lines on which the insurers differ, with each one's printed value.
    const nameOf = Object.fromEntries(cmp.options.map(o => [o.key, `${o.insurerName} (${o.planLabel || o.planCode})`]))
    const differences = cmp.groups.flatMap(g => g.rows
      .filter(r => r.differs && BENEFIT_BY_CODE[r.benefit.code]?.headline)
      .map(r => ({
        line: `${g.productName} — ${r.benefit.name}`,
        // The engine's own direction, so the model never has to judge which value is more cover.
        values: Object.fromEntries(r.cells.map(c => [nameOf[c.optionKey],
          c.absent ? 'nothing on record' : `${c.text ?? ''}${c.best ? ' [most cover on this line]' : ''}`])),
      })))
      .slice(0, 30)

    const facts = {
      client: q.company_name, basis: q.basis, effectiveDate: q.effective_date,
      census: profile,
      weights: Object.fromEntries(DIMENSIONS.map(d => [d.label, settings.weights[d.key]])),
      filters: {
        maxPepm: settings.filters.maxPepm,
        wardFloor: WARD_FLOORS.find(w => w.rank === settings.filters.minWardRank)?.label ?? null,
        requiredProducts: settings.filters.requiredProducts,
      },
      rankedBy: settings.sort,
      dimensionsLeftOut: result.droppedDimensions.map(d => ({
        dimension: DIMENSIONS.find(x => x.key === d.key)!.label, becauseNothingComparableFor: d.insurers })),
      insurers: result.insurers.map(i => ({
        insurer: i.insurerName, plans: i.planLabels,
        annualPremiumSGD: i.annualTotal, pepmSGD: i.pepm,
        coverage0to100: i.coverage, valueIndex: i.valueIndex, rank: i.rank,
        dimensions: Object.fromEntries(DIMENSIONS.map(d => [d.label, i.dimensions[d.key].quoted ? i.dimensions[d.key].score : 'not quoted'])),
        linesScored: `${i.linesScored} of ${i.linesAvailable}`,
        unpricedMemberLines: i.pricingGaps,
        ratesChecked: VERIFICATION[i.verification ?? 'unverified'].label,
        excludedBecause: i.excluded,
        rankIfByValue: ranks.value[i.insurerName], rankIfByLowestPepm: ranks.pepm[i.insurerName],
        rankIfByCoverage: ranks.coverage[i.insurerName],
      })),
      headlineDifferences: differences,
    }

    const system = await withVoice(`You explain a group employee benefits comparison to a Singapore insurance broker.

You are given computed figures: each insurer's premium, premium per employee per month (PEPM), a coverage score built from the broker's own weights, a value index, ranks, the census profile, and the headline benefit lines where the insurers differ.

Write 3 to 6 points. Each point is one or two short sentences, at most 45 words. Cover, where the figures support it:
- Which insurer ranks first under the broker's weights, and whether that changes when ranked by lowest PEPM or by coverage alone.
- What the cheaper option gives up, named by benefit line and value (ward class, annual limit, co-payment, sub-limits).
- How this census drives the premium: group size and average age. Premiums are age-rated per member.
- Any insurer whose rates are not checked against a calculator, or that has unpriced member lines or few lines scored, and what that means for relying on its figure.
- Any insurer removed by a filter or left unranked, and why.
- Any dimension left out of the coverage score, and for which insurer nothing comparable is on record.

Rules:
- Use only figures in the input. Never invent a number, a benefit, an exclusion or a claims history.
- A value marked [most cover on this line] is the most cover among the insurers; never describe moving to it as a reduction. Do not repeat the marker itself.
- Renewal risk cannot be assessed: no claims data is held. Do not estimate it.
- Name insurers as given. Currency is SGD, written S$.
- No headings, no greeting, no closing line, no recommendation beyond what the ranking states.

Return JSON: {"points": ["...", "..."]}`, 'internal')

    const { text, error } = await callGemini({
      agent: 'group_benefit', feature: 'gb_value_explain', model: GEMINI_FLASH,
      system, parts: [{ text: JSON.stringify(facts) }],
      maxOutputTokens: 6000, json: true, temperature: 0.2,
      metadata: { quotation_id: id },
    })
    if (!text) return NextResponse.json({ error: error ?? 'The model returned nothing.' }, { status: 502 })

    let points: string[] = []
    try {
      const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as { points?: unknown }
      points = Array.isArray(parsed.points) ? parsed.points.filter((p): p is string => typeof p === 'string' && !!p.trim()).map(p => p.trim()) : []
    } catch { /* handled below */ }
    if (!points.length) return NextResponse.json({ error: 'The explanation could not be read. Try again.' }, { status: 502 })

    const explanation: Explanation = { points: points.slice(0, 6), model: GEMINI_FLASH, at: new Date().toISOString(), settings }
    await save(id, { ...stored(q.priorities), score: settings, explanation })
    void logActivity({ action: 'gb.value_explained', resource_type: 'gb_quotation', resource_id: id,
                       new_value: { insurers: result.insurers.length, sort: settings.sort } })
    return NextResponse.json({ explanation })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
