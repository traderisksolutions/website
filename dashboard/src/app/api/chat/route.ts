/**
 * POST /api/chat   Body: { thread_id, case_id?, message }
 *
 * The floating "consultant" chat. Loads the thread's history (+ the Nexus case
 * context when case-aware), asks Opus, and persists the assistant reply. Opus may
 * append a single ```action JSON block that becomes a confirm-to-act button — it
 * never executes here; the client runs it only when the employee confirms.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const SB_URL        = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function caseContext(caseId: string): Promise<string> {
  const [cRes, aRes, tRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/cases?id=eq.${caseId}&select=name,description,status&limit=1`, { headers: sbH(), cache: 'no-store' }),
    fetch(`${SB_URL}/rest/v1/case_analyses?case_id=eq.${caseId}&order=created_at.desc&limit=1&select=structured_analysis`, { headers: sbH(), cache: 'no-store' }),
    fetch(`${SB_URL}/rest/v1/case_threads?case_id=eq.${caseId}&select=thread_id,party_type,party_label`, { headers: sbH(), cache: 'no-store' }),
  ])
  const c  = cRes.ok ? (await cRes.json())[0] : null
  const sa = aRes.ok ? (await aRes.json())[0]?.structured_analysis : null
  const threads = tRes.ok ? await tRes.json() : []
  if (!c) return ''

  const compact = sa ? {
    brief:      sa.case_brief,
    blocking:   sa.case_brief?.blocking_issues,
    next_steps: (sa.recommended_next_steps ?? []).map((s: { step: number; action: string; owner: string }) => ({ step: s.step, action: s.action, owner: s.owner })),
    scenarios:  (sa.scenario_analysis ?? []).map((s: { name: string; probability: string }) => ({ name: s.name, probability: s.probability })),
    stakeholders: (sa.stakeholder_map ?? []).map((s: { name: string; party_type: string; stance?: string }) => ({ name: s.name, party_type: s.party_type, stance: s.stance })),
    missing:    sa.missing_items,
  } : null

  return `━━ CURRENT CASE ━━
Name: ${c.name}
Status: ${c.status}${c.description ? `\nDescription: ${c.description}` : ''}
Linked threads (use thread_id for draft_email routing): ${JSON.stringify(threads)}
Latest analysis (may be what the broker wants changed):
${compact ? JSON.stringify(compact, null, 2) : '(no analysis yet — the broker may want you to run one)'}\n`
}

const SYSTEM = `You are a sharp, candid insurance strategy consultant embedded in TRS (Trade Risk Solutions, a Singapore brokerage). A broker is chatting with you about a case's AI analysis. They may be unhappy with it, want clarifications, corrections, or changes.

Be concise and practical. When you state a factual claim about the case, ground it in what the context shows.

CONFIRM-TO-ACT: if — and only if — the broker's request implies a concrete change, END your reply with a single fenced block exactly like:
\`\`\`action
{ "type": "reanalyze", "instructions": "<what to change/focus, phrased for a re-run>" }
\`\`\`
Valid action shapes:
- { "type": "reanalyze", "instructions": "..." }  — correct facts / focus / add context, then re-run the analysis.
- { "type": "draft_email", "to_email": "...", "subject": "...", "body": "...", "thread_id": "<from linked threads, or omit>" } — draft an email.
- { "type": "edit_case", "patch": { "name"?: "...", "description"?: "...", "status"?: "open|closed" } } — edit case fields.
Never include more than one action. Never fabricate figures or coverage. If no action is needed, do not include the block.`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { thread_id, case_id, message } = await req.json() as { thread_id?: string; case_id?: string; message?: string }
    if (!thread_id || !message?.trim()) return NextResponse.json({ error: 'thread_id and message required' }, { status: 400 })

    // Ownership check.
    const tRes = await fetch(`${SB_URL}/rest/v1/chat_threads?id=eq.${thread_id}&select=user_id,case_id&limit=1`, { headers: sbH(), cache: 'no-store' })
    const thread = tRes.ok ? (await tRes.json())[0] : null
    if (!thread || thread.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // History (last 20) → Anthropic messages.
    const hRes = await fetch(`${SB_URL}/rest/v1/chat_messages?thread_id=eq.${thread_id}&order=created_at.asc&select=role,content&limit=20`, { headers: sbH(), cache: 'no-store' })
    const history: { role: string; content: string }[] = hRes.ok ? await hRes.json() : []
    const msgs = history
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content?.trim())
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    if (msgs.length === 0 || msgs[msgs.length - 1].content !== message) msgs.push({ role: 'user', content: message })

    const ctx    = (case_id ?? thread.case_id) ? await caseContext((case_id ?? thread.case_id) as string) : ''
    const system = ctx ? `${SYSTEM}\n\n${ctx}` : SYSTEM

    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return NextResponse.json({ error: 'Assistant is not configured (ANTHROPIC_API_KEY missing).' }, { status: 500 })

    const aRes = await fetch(ANTHROPIC_URL, {
      method:  'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 2000, thinking: { type: 'adaptive' }, system, messages: msgs }),
    })
    if (!aRes.ok) return NextResponse.json({ error: `Assistant error: ${await aRes.text()}` }, { status: 502 })
    const data = await aRes.json()
    let text = ((data?.content ?? []) as { type?: string; text?: string }[]).find(b => b.type === 'text')?.text ?? ''

    // Extract an optional ```action { ... } ``` block.
    let action: unknown = null
    const m = text.match(/```action\s*([\s\S]*?)```/i)
    if (m) {
      try { action = JSON.parse(m[1].trim()) } catch { /* ignore malformed */ }
      text = text.replace(m[0], '').trim()
    }
    if (!text) text = 'Done.'

    // Persist assistant message.
    const iRes = await fetch(`${SB_URL}/rest/v1/chat_messages`, {
      method:  'POST',
      headers: sbH('return=representation'),
      body: JSON.stringify({ thread_id, role: 'assistant', content: text, message_status: 'complete', metadata_json: { model: 'claude-opus-4-8', ...(action ? { action } : {}) } }),
    })
    const saved = iRes.ok ? (await iRes.json())[0] : null
    await fetch(`${SB_URL}/rest/v1/chat_threads?id=eq.${thread_id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ last_message_at: new Date().toISOString() }) }).catch(() => {})

    return NextResponse.json({ message: saved })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
