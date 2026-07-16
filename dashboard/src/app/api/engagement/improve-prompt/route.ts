import { NextResponse } from 'next/server'
import { synthesizeAllPromptOverrides } from '@/lib/synthesize-prompt-override'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

// GET — current synthesised instruction overrides (latest per type; older rows kept as history)
export async function GET() {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/prompt_overrides?order=synthesized_at.desc&select=id,email_type,override_text,synthesized_at,source_eval_count`,
      { headers: sbH('return=representation'), cache: 'no-store' }
    )
    const rows = res.ok ? await res.json() : []
    const seen = new Set<string>()
    const latest = (Array.isArray(rows) ? rows : []).filter((r: { email_type: string }) => {
      if (seen.has(r.email_type)) return false
      seen.add(r.email_type)
      return true
    })
    return NextResponse.json(latest)
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
