/**
 * GET /api/cron/chat-evals   (nightly)
 *
 * Distils the last 24h of consultant chats into evals + a learned prompt override.
 * For each conversation it scores how well the consultant did and extracts one
 * concrete key learning (stored in draft_evaluations under surface
 * CHAT_CONSULTANT), then synthesises those learnings into a CHAT_CONSULTANT
 * prompt_override that /api/chat appends to its system prompt. Self-improvement,
 * inferred from the conversation itself (no thumbs required).
 *
 * Storage/synthesis goes through the ai-learning-loop library (src/lib/ai-learning-loop/)
 * so this surface's overrides are versioned (superseded, not deleted) the same as every
 * other surface — this previously DELETEd the prior override outright, losing history.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseDB, createGeminiComposer, EvalStore, SkillSynthesizer } from '@/lib/ai-learning-loop'
import { logError } from '@/lib/error-log'

export const maxDuration = 300

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent'
const SURFACE     = 'CHAT_CONSULTANT'
const MIN_LEARNINGS_TO_SYNTHESIZE = 3

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function gemini(prompt: string, key: string): Promise<string> {
  const r = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 800, responseMimeType: 'application/json' } }),
  })
  if (!r.ok) {
    void logError({ source: 'gemini', feature: 'chat_evals', statusCode: r.status, message: await r.text() })
    return ''
  }
  const d = await r.json()
  return (d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
}

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET ?? ''
    const ok = !!req.headers.get('x-vercel-cron') || req.headers.get('x-internal-secret') === secret || (secret && req.headers.get('authorization') === `Bearer ${secret}`)
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const key = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS
    if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY_EMAIL_ANALYSIS not set' }, { status: 500 })

    const db = createSupabaseDB()
    const evalStore = new EvalStore(db)

    // Last 24h of chat messages, grouped into conversations.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const mRes = await fetch(`${SB_URL}/rest/v1/chat_messages?created_at=gte.${since}&order=thread_id.asc,created_at.asc&select=thread_id,role,content,metadata_json&limit=2000`, { headers: sbH('return=representation'), cache: 'no-store' })
    const rows: { thread_id: string; role: string; content: string; metadata_json: { action_done?: boolean } | null }[] = mRes.ok ? await mRes.json() : []

    const convos = new Map<string, typeof rows>()
    for (const r of rows) { if (!convos.has(r.thread_id)) convos.set(r.thread_id, []); convos.get(r.thread_id)!.push(r) }

    let evaluated = 0
    for (const [, msgs] of Array.from(convos.entries()).slice(0, 40)) {
      if (!msgs.some(m => m.role === 'assistant')) continue
      const transcript = msgs.map(m => {
        const done = m.role === 'assistant' && m.metadata_json?.action_done ? ' [broker applied a proposed action]' : ''
        return `${m.role === 'user' ? 'Broker' : 'Consultant'}: ${m.content.slice(0, 1200)}${done}`
      }).join('\n\n').slice(0, 12_000)

      const prompt = `You review an AI insurance-strategy consultant chatting with a broker at TRS (Singapore brokerage). Judge how well the CONSULTANT performed across this conversation.

Signals of quality: accurate + grounded answers, correctly used data/tools, proposed useful actions the broker applied, the broker seemed satisfied (no repeated corrections or frustration).

Score 1-5 (5 = excellent, 1 = poor). Give ONE specific, actionable key_learning the consultant's instructions should adopt to be better next time.

Return ONLY JSON: { "score": <1-5>, "key_learning": "<one concrete rule>", "summary": "<one line>" }

CONVERSATION:
${transcript}`

      const raw = await gemini(prompt, key)
      let p: { score?: number; key_learning?: string; summary?: string }
      try { p = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()) } catch { continue }
      const score = typeof p.score === 'number' ? Math.min(5, Math.max(1, Math.round(p.score))) : 0
      if (!score) continue

      const keyLearning = p.key_learning ?? ''
      await evalStore.record({
        surface: SURFACE,
        aiOutput: transcript.slice(0, 4000),
        humanOutput: '', // no human-authored "ideal" reply for a chat conversation
        substance: score,
        style: score,
        editType: score <= 4 && keyLearning.trim().length > 0 ? 'substance' : 'none',
        whatChanged: '',
        whyBetter: '',
        keyLearning,
        contextSummary: p.summary ?? '',
      }).catch(() => {})
      evaluated++
    }

    // Synthesise recent CHAT_CONSULTANT learnings into one override the chat applies.
    // Unconditional nightly resynthesis (not throttled like the email-type auto-trigger) —
    // matches this cron's original behaviour of always refreshing from the latest signal.
    const composer = createGeminiComposer(key)
    const synth = new SkillSynthesizer(db, composer, {
      [SURFACE]: 'General guidance for an AI insurance-strategy consultant chatting with brokers at TRS: give accurate, grounded answers; use available data/tools correctly; propose useful next actions.',
    })
    const learnings = await evalStore.listLearnings(SURFACE, { maxScore: 4, limit: 60 })
    const synthResult = learnings.length >= MIN_LEARNINGS_TO_SYNTHESIZE
      ? await synth.synthesize(SURFACE)
      : { synthesized: false, count: learnings.length, reason: 'not enough signal yet' }

    return NextResponse.json({ ok: true, conversations: convos.size, evaluated, synthesised: synthResult.synthesized })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
