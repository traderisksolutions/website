/**
 * GET  /api/engagement/skill-timeline
 *   Full version history for every surface (or ?email_type=X for one), newest first per
 *   surface, plus a heuristic pin/deprecate recommendation for each surface's current
 *   version. This is the "skill evolution over time" view the /analytics/eval dashboard
 *   renders — /api/engagement/improve-prompt only ever returns the single effective version.
 *
 * POST /api/engagement/skill-timeline   Body: { action: 'pin'|'unpin'|'deprecate', id, email_type }
 *   Manual lifecycle actions ("promote"/"deprecate" a synthesised skill version).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseDB, SkillSynthesizer, createGeminiComposer, recommendForAllSurfaces } from '@/lib/ai-learning-loop'

export async function GET(req: NextRequest) {
  try {
    const emailType = req.nextUrl.searchParams.get('email_type') ?? undefined
    const db = createSupabaseDB()
    const synth = new SkillSynthesizer(db, createGeminiComposer(undefined))

    const history = await synth.history(emailType)
    const surfaces = Array.from(new Set(history.map(v => v.surface)))
    const recommendations = await recommendForAllSurfaces(db, surfaces)

    return NextResponse.json({
      versions: history.map(v => ({
        id: v.id, email_type: v.surface, override_text: v.instructionText,
        source_eval_count: v.sourceEvalCount, status: v.status, synthesized_at: v.synthesizedAt,
      })),
      recommendations,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { action?: string; id?: string; email_type?: string }
    if (!body.id || !body.action) return NextResponse.json({ error: 'id and action required' }, { status: 400 })

    const synth = new SkillSynthesizer(createSupabaseDB(), createGeminiComposer(undefined))

    if (body.action === 'pin') {
      await synth.pin(body.id)
    } else if (body.action === 'deprecate') {
      await synth.deprecate(body.id)
    } else if (body.action === 'unpin') {
      if (!body.email_type) return NextResponse.json({ error: 'email_type required to unpin' }, { status: 400 })
      await synth.unpin(body.email_type, body.id)
    } else {
      return NextResponse.json({ error: `unknown action: ${body.action}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
