/**
 * GET /api/cron/nexus-chat-learnings   (nightly)
 *
 * Reviews the last 24h of case-linked Ask-Opus chat conversations (chat_threads.case_id)
 * and extracts substantive Q&A into nexus_chat_learnings — case-scoped memory for that
 * case's next Grand Analysis, and (via email_type tagging) pooled signal for Engagement's
 * general drafting instructions via SkillSynthesizer. Purely extraction — never triggers
 * a re-analysis or resynthesis itself; those read this table lazily whenever they next run.
 */
import { NextRequest, NextResponse } from 'next/server'
import { recordChatLearnings } from '@/lib/nexus-chat-learnings'
import { logError } from '@/lib/error-log'

export const maxDuration = 300

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent'
const VALID_EMAIL_TYPES = ['PRICING', 'COVERAGE', 'RENEWAL', 'DOCUMENT', 'CLAIMS', 'CONVERSATION'] as const

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function gemini(prompt: string, key: string): Promise<string> {
  const r = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 1200, responseMimeType: 'application/json' } }),
  })
  if (!r.ok) {
    void logError({ source: 'gemini', feature: 'nexus_chat_learnings', statusCode: r.status, message: await r.text() })
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

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Case-linked chat threads with activity in the window.
    const threadsRes = await fetch(
      `${SB_URL}/rest/v1/chat_threads?case_id=not.is.null&last_message_at=gte.${since}&select=id,case_id`,
      { headers: sbH('return=representation'), cache: 'no-store' }
    )
    const threads: { id: string; case_id: string | null }[] = threadsRes.ok ? await threadsRes.json() : []

    const threadIdsByCase = new Map<string, string[]>()
    for (const t of threads) {
      if (!t.case_id) continue
      const list = threadIdsByCase.get(t.case_id) ?? []
      list.push(t.id)
      threadIdsByCase.set(t.case_id, list)
    }

    let casesProcessed = 0
    let learningsInserted = 0

    for (const [caseId, threadIds] of Array.from(threadIdsByCase.entries()).slice(0, 30)) {
      const msgsRes = await fetch(
        `${SB_URL}/rest/v1/chat_messages?thread_id=in.(${threadIds.join(',')})&created_at=gte.${since}&order=created_at.asc&select=role,content`,
        { headers: sbH('return=representation'), cache: 'no-store' }
      )
      const msgs: { role: string; content: string }[] = msgsRes.ok ? await msgsRes.json() : []
      if (!msgs.some(m => m.role === 'user')) continue // nothing a broker actually asked

      const transcript = msgs
        .map(m => `${m.role === 'user' ? 'Broker' : 'Consultant'}: ${m.content.slice(0, 1200)}`)
        .join('\n\n')
        .slice(0, 12_000)

      const prompt = `You review a chat conversation between a broker at Trade Risk Solutions (TRS, a Singapore insurance brokerage) and an AI consultant, about one specific case.

Extract only SUBSTANTIVE questions the broker asked and the answers given — skip small talk, acknowledgements, or anything that isn't a real question with a real answer.

For each one, classify which type of future email it's most relevant to, from this fixed list: PRICING, COVERAGE, RENEWAL, DOCUMENT, CLAIMS, CONVERSATION. Use null if none clearly fit — it's still worth remembering for this case even if it doesn't map to an email type.

Return ONLY JSON: { "items": [ { "question": "<what was asked>", "answer": "<what the consultant said, or what was resolved>", "email_type": "PRICING"|"COVERAGE"|"RENEWAL"|"DOCUMENT"|"CLAIMS"|"CONVERSATION"|null } ] }
Return { "items": [] } if there's nothing substantive.

CONVERSATION:
${transcript}`

      const raw = await gemini(prompt, key)
      let parsed: { items?: { question?: string; answer?: string; email_type?: string | null }[] }
      try { parsed = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()) } catch { continue }

      const items = (parsed.items ?? [])
        .filter((i): i is { question: string; answer: string; email_type?: string | null } => Boolean(i.question && i.answer))
        .map(i => ({
          question:   i.question,
          answer:     i.answer,
          email_type: VALID_EMAIL_TYPES.includes(i.email_type as (typeof VALID_EMAIL_TYPES)[number]) ? (i.email_type as string) : null,
        }))
      if (items.length === 0) continue

      const inserted = await recordChatLearnings(caseId, items)
      casesProcessed++
      learningsInserted += inserted
    }

    return NextResponse.json({ ok: true, cases_with_activity: threadIdsByCase.size, cases_processed: casesProcessed, learnings_inserted: learningsInserted })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
