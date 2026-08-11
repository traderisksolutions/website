import { NextResponse } from 'next/server'
import { synthesizeAllPromptOverrides } from '@/lib/synthesize-prompt-override'
import { createSupabaseDB, createGeminiComposer, SkillSynthesizer } from '@/lib/ai-learning-loop'

// GET — the currently-effective instruction override per surface (pinned version if pinned,
// else the newest active one — deprecated/superseded versions are excluded). Full version
// history per surface is available at /api/engagement/skill-timeline.
export async function GET() {
  try {
    const synth = new SkillSynthesizer(createSupabaseDB(), createGeminiComposer(undefined))
    const history = await synth.history()
    const surfaces = Array.from(new Set(history.map(v => v.surface)))
    const effective = (await Promise.all(surfaces.map(s => synth.getEffective(s))))
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => b.synthesizedAt.localeCompare(a.synthesizedAt))
      .map(v => ({ id: v.id, email_type: v.surface, override_text: v.instructionText, synthesized_at: v.synthesizedAt, source_eval_count: v.sourceEvalCount, status: v.status }))
    return NextResponse.json(effective)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

// POST — manual "synthesise now": rebuild every email type that currently has signal.
// (Synthesis also runs automatically after each substantive miss — see run-draft-evaluation.)
export async function POST() {
  try {
    const r = await synthesizeAllPromptOverrides()
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Synthesis failed' }, { status: 500 })
  }
}
