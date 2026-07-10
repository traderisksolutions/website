/**
 * POST /api/chat   Body: { thread_id, case_id?, message, attachments? }
 *
 * The floating "consultant" chat. Streams Opus's reply as newline-delimited JSON.
 * When case-aware it gives Opus live READ-TOOLS (fetch the full analysis, quotes,
 * thread list, or a thread's messages) so answers reflect current data, and runs
 * an agentic tool loop before the final answer. Opus may append a ```action block
 * (confirm-to-act) and a ```citations block. A nightly job distils past chats into
 * a CHAT_CONSULTANT prompt override that is appended here.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logAnthropicUsage }         from '@/lib/gemini-usage'

export const maxDuration = 300

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
    next_steps: (sa.recommended_next_steps ?? []).map((s: { step: number; action: string; owner: string }) => ({ step: s.step, action: s.action, owner: s.owner })),
    scenarios:  (sa.scenario_analysis ?? []).map((s: { name: string; probability: string }) => ({ name: s.name, probability: s.probability })),
    stakeholders: (sa.stakeholder_map ?? []).map((s: { name: string; party_type: string; stance?: string }) => ({ name: s.name, party_type: s.party_type, stance: s.stance })),
    missing:    sa.missing_items,
    citations:  sa.citations,
  } : null
  return `━━ CURRENT CASE ━━
Name: ${c.name}
Status: ${c.status}${c.description ? `\nDescription: ${c.description}` : ''}
Linked threads (use thread_id for draft_email routing and get_thread_messages): ${JSON.stringify(threads)}
Latest analysis (summary — use get_case_analysis for the full JSON):
${compact ? JSON.stringify(compact, null, 2) : '(no analysis yet — the broker may want you to run one)'}\n`
}

// ── Live read-tools (case-scoped) ─────────────────────────────────────────────
const TOOLS = [
  { name: 'get_case_analysis',  description: 'Get the full latest structured analysis JSON for this case (fuller than the summary in context).', input_schema: { type: 'object', properties: {} } },
  { name: 'get_case_quotes',    description: 'Get captured insurer quotes for this case (premium, excess, limit, validity, terms).',              input_schema: { type: 'object', properties: {} } },
  { name: 'list_case_threads',  description: 'List this case\'s linked email threads with party labels and thread_id.',                          input_schema: { type: 'object', properties: {} } },
  { name: 'list_attachments',   description: 'List EVERY attachment on this case: filename, which party sent it, size, and whether it has been read/analysed (parsed:true) or is still pending (parsed:false). Use this to find documents that were never analysed.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_thread_messages', description: 'Get recent messages (direction, from, date, body) for one thread on this case.',                  input_schema: { type: 'object', properties: { thread_id: { type: 'string' } }, required: ['thread_id'] } },
  { name: 'rescan_attachment',  description: 'Re-run text extraction on a case attachment by (partial) filename — use when an attachment looks mis-read or was never read. After it succeeds, PROPOSE a reanalyze action so the refreshed text is used (the human confirms).', input_schema: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } },
] as const

async function execTool(name: string, input: Record<string, unknown>, caseId: string, origin: string): Promise<string> {
  const cap = (s: string) => s.slice(0, 12_000)
  try {
    if (name === 'get_case_analysis') {
      const r = await fetch(`${SB_URL}/rest/v1/case_analyses?case_id=eq.${caseId}&order=created_at.desc&limit=1&select=structured_analysis`, { headers: sbH(), cache: 'no-store' })
      const sa = r.ok ? (await r.json())[0]?.structured_analysis : null
      return cap(sa ? JSON.stringify(sa) : 'No analysis yet.')
    }
    if (name === 'get_case_quotes') {
      const r = await fetch(`${SB_URL}/rest/v1/rfq_quotes?case_id=eq.${caseId}&select=insurer_name,product_line,premium,excess,limit_indemnity,validity,key_terms,exclusions,summary,status`, { headers: sbH(), cache: 'no-store' })
      return cap(JSON.stringify(r.ok ? await r.json() : []))
    }
    if (name === 'list_case_threads') {
      const r = await fetch(`${SB_URL}/rest/v1/case_threads?case_id=eq.${caseId}&select=thread_id,party_type,party_label`, { headers: sbH(), cache: 'no-store' })
      return cap(JSON.stringify(r.ok ? await r.json() : []))
    }
    if (name === 'list_attachments') {
      const ctRes = await fetch(`${SB_URL}/rest/v1/case_threads?case_id=eq.${caseId}&select=thread_id,party_label,party_type`, { headers: sbH(), cache: 'no-store' })
      const cts = (ctRes.ok ? await ctRes.json() : []) as { thread_id: string; party_label: string | null; party_type: string }[]
      const tids = cts.map(t => t.thread_id)
      if (tids.length === 0) return '[]'
      const partyBy = new Map(cts.map(t => [t.thread_id, t.party_label || t.party_type]))
      const aRes = await fetch(`${SB_URL}/rest/v1/email_attachments?thread_id=in.(${tids.join(',')})&select=filename,thread_id,size_bytes,parsed_at,created_at&order=created_at.desc`, { headers: sbH(), cache: 'no-store' })
      const rows = ((aRes.ok ? await aRes.json() : []) as { filename: string; thread_id: string; size_bytes: number | null; parsed_at: string | null }[])
        .map(a => ({ filename: a.filename, from: partyBy.get(a.thread_id) ?? 'unknown', parsed: !!a.parsed_at, size_bytes: a.size_bytes }))
      return cap(JSON.stringify(rows))
    }
    if (name === 'get_thread_messages') {
      const tid = String(input.thread_id ?? '')
      const own = await fetch(`${SB_URL}/rest/v1/case_threads?case_id=eq.${caseId}&thread_id=eq.${tid}&select=thread_id&limit=1`, { headers: sbH(), cache: 'no-store' })
      if (!own.ok || (await own.json()).length === 0) return 'That thread is not linked to this case.'
      const r = await fetch(`${SB_URL}/rest/v1/email_messages?thread_id=eq.${tid}&order=sent_at.desc&limit=15&select=direction,from_address,sent_at,body_text`, { headers: sbH(), cache: 'no-store' })
      const rows = (r.ok ? await r.json() : []) as { direction: string; from_address: string; sent_at: string; body_text: string }[]
      return cap(JSON.stringify(rows.reverse().map(m => ({ direction: m.direction, from: m.from_address, date: m.sent_at, body: (m.body_text ?? '').slice(0, 1500) }))))
    }
    if (name === 'rescan_attachment') {
      const fname = String(input.filename ?? '').trim()
      if (!fname) return 'Provide a filename to re-scan.'
      const ctRes = await fetch(`${SB_URL}/rest/v1/case_threads?case_id=eq.${caseId}&select=thread_id`, { headers: sbH(), cache: 'no-store' })
      const tids = ((ctRes.ok ? await ctRes.json() : []) as { thread_id: string }[]).map(t => t.thread_id)
      if (tids.length === 0) return 'No linked threads on this case.'
      const aRes = await fetch(`${SB_URL}/rest/v1/email_attachments?thread_id=in.(${tids.join(',')})&filename=ilike.*${encodeURIComponent(fname)}*&select=message_id,thread_id,filename&limit=1`, { headers: sbH(), cache: 'no-store' })
      const att = aRes.ok ? (await aRes.json())[0] : null
      if (!att) return `No attachment matching “${fname}” on this case.`
      const mRes = await fetch(`${SB_URL}/rest/v1/email_messages?id=eq.${att.message_id}&select=gmail_message_id&limit=1`, { headers: sbH(), cache: 'no-store' })
      const gmid = mRes.ok ? (await mRes.json())[0]?.gmail_message_id : null
      if (!gmid) return `Could not resolve the source message for “${att.filename}”.`
      const xRes = await fetch(`${origin}/api/nexus/attachments/extract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET ?? '' },
        body: JSON.stringify({ message_id: att.message_id, thread_id: att.thread_id, gmail_message_id: gmid, force: true }),
      })
      const xd = await xRes.json().catch(() => ({}))
      return `Re-scanned “${att.filename}” (processed ${xd.processed ?? '?'} attachment(s)). Now propose a reanalyze action so the refreshed text is used.`
    }
  } catch (e) { return `Tool error: ${String(e)}` }
  return 'Unknown tool.'
}

const SYSTEM = `You are a sharp, candid insurance strategy consultant embedded in TRS (Trade Risk Solutions, a Singapore brokerage). A broker is chatting with you about a case's AI analysis. They may be unhappy with it, want clarifications, corrections, or changes.

Be concise and practical. Ground factual claims in the context or in what your read-tools return — when case-aware you can call get_case_analysis, get_case_quotes, list_case_threads, get_thread_messages and list_attachments to check the live data before answering. To find documents that were never analysed, call list_attachments and look for parsed:false. Prefer looking things up over guessing.

CONFIRM-TO-ACT: if — and only if — the broker's request implies a concrete change, END your reply with a single fenced block:
\`\`\`action
{ "type": "reanalyze", "instructions": "<what to change/focus>" }
\`\`\`
Valid action shapes:
- { "type": "edit_analysis", "summary": "<one line>", "ops": [ ... ] } — SURGICAL edits applied directly to the analysis (no full re-run). Op shapes:
    { "target": "brief", "set": { "summary"?, "current_stage"?, "claim_amount"?, "policy_reference"?, "coverage_type"?, "incident_date"? } }
    { "target": "blocking_issues", "op": "add"|"remove", "value"?, "at"?, "match"? }
    { "target": "next_steps", "op": "add", "value": { "action", "owner"?, "priority"?, "rationale"?, "deadline"? } }
    { "target": "next_steps", "op": "update"|"remove", "at"?, "match"?, "value"? }
    { "target": "scenarios", "op": "add"|"update"|"remove", "at"?, "match"?, "value"? }
    { "target": "stakeholders", "op": "add"|"update"|"remove", "at"?, "match"?, "value"? }
    { "target": "missing_items", "op": "add"|"remove", "at"?, "match"?, "value"? }
    { "target": "timeline", "op": "add"|"update"|"remove", "at"?, "match"?, "value": { "date"?, "party"?, "event", "significance"? } }
    { "target": "open_questions", "op": "add"|"update"|"remove", "at"?, "match"?, "value": { "question", "priority"?, "directed_at"? } }
    { "target": "quote_decision", "op": "update", "line"?, "at"?, "value": { "recommended_insurer"?, "rationale"?, "caveats"? } }
- { "type": "reanalyze", "instructions": "..." } — ONLY when the change needs re-reasoning over the underlying evidence.
- { "type": "rescan_reanalyze", "filename"?, "all_pending"?: true, "instructions"?: "..." } — re-extract an attachment (by filename) OR ALL pending attachments, THEN re-run the analysis, in ONE step. Use when a document wasn't read and Mission Control should be repopulated from it.
- { "type": "draft_email", "to_email"?, "subject"?, "body", "thread_id"? } — draft an email.
- { "type": "edit_case", "patch": { "name"?, "description"?, "status"? } } — edit case fields.
Never include more than one action. Never fabricate figures or coverage.

CITATIONS: when you reference specific evidence, append AFTER any action block:
\`\`\`citations
[ { "label": "<short label>", "ref": "<thread_id if an email/thread, else omit>", "kind": "email"|"attachment"|"analysis" } ]
\`\`\`
Only cite sources you actually used. Omit the block if none.`

type Block = { type: string; text?: string; id?: string; name?: string; _json?: string; input?: unknown }

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { thread_id, case_id, message, attachments } = await req.json() as { thread_id?: string; case_id?: string; message?: string; attachments?: { filename: string; text: string }[] }
    if (!thread_id || !message?.trim()) return NextResponse.json({ error: 'thread_id and message required' }, { status: 400 })

    const attachBlock = (attachments ?? []).filter(a => a.text?.trim()).map(a => `=== ATTACHED FILE: ${a.filename} ===\n${a.text.slice(0, 20_000)}`).join('\n\n')
    const messageWithAtt = attachBlock ? `${message}\n\n${attachBlock}` : message

    const tRes = await fetch(`${SB_URL}/rest/v1/chat_threads?id=eq.${thread_id}&select=user_id,case_id&limit=1`, { headers: sbH(), cache: 'no-store' })
    const thread = tRes.ok ? (await tRes.json())[0] : null
    if (!thread || thread.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const hRes = await fetch(`${SB_URL}/rest/v1/chat_messages?thread_id=eq.${thread_id}&order=created_at.asc&select=role,content&limit=20`, { headers: sbH(), cache: 'no-store' })
    const history: { role: string; content: string }[] = hRes.ok ? await hRes.json() : []
    type Msg = { role: 'user' | 'assistant'; content: string | Block[] }
    const msgs: Msg[] = history
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content?.trim())
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content as string | Block[] }))
    if (msgs.length && msgs[msgs.length - 1].role === 'user' && msgs[msgs.length - 1].content === message) {
      msgs[msgs.length - 1].content = messageWithAtt
    } else {
      msgs.push({ role: 'user', content: messageWithAtt })
    }

    const effCaseId = (case_id ?? thread.case_id) as string | null
    const origin = new URL(req.url).origin
    const ctx = effCaseId ? await caseContext(effCaseId) : ''

    // Learned improvements distilled nightly from past chats.
    let learned = ''
    try {
      const oRes = await fetch(`${SB_URL}/rest/v1/prompt_overrides?email_type=eq.CHAT_CONSULTANT&order=synthesized_at.desc&limit=1&select=override_text`, { headers: sbH(), cache: 'no-store' })
      const oTxt = oRes.ok ? (await oRes.json())[0]?.override_text : null
      if (oTxt) learned = `LEARNED IMPROVEMENTS (from reviewing past chats — apply these):\n${oTxt}`
    } catch { /* optional */ }

    const system = [SYSTEM, ctx, learned].filter(Boolean).join('\n\n')

    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return NextResponse.json({ error: 'Assistant is not configured (ANTHROPIC_API_KEY missing).' }, { status: 500 })

    const enc = new TextEncoder()
    const ac  = new AbortController()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'))

        // One streaming turn → text (streamed to client) + any tool_use blocks.
        let totalIn = 0, totalOut = 0   // accumulated Opus token usage across turns
        async function runTurn(): Promise<{ full: string; blocks: Block[]; stopReason: string }> {
          let uIn = 0, uOut = 0
          const body: Record<string, unknown> = { model: 'claude-opus-4-8', max_tokens: 2000, system, messages: msgs, stream: true }
          if (effCaseId) body.tools = TOOLS           // read-tools when case-aware
          else body.thinking = { type: 'adaptive' }   // deeper reasoning for general chat
          const aRes = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers: { 'x-api-key': key!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify(body), signal: ac.signal,
          })
          if (!aRes.ok || !aRes.body) throw new Error(`Assistant error: ${await aRes.text().catch(() => aRes.status)}`)
          const reader = aRes.body.getReader(); const dec = new TextDecoder()
          let buf = '', full = '', stopReason = 'end_turn'
          const blocks: Record<number, Block> = {}
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })
            let nl: number
            while ((nl = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
              if (!line.startsWith('data:')) continue
              const payload = line.slice(5).trim()
              if (!payload || payload === '[DONE]') continue
              let ev: { type?: string; index?: number; content_block?: { type: string; id?: string; name?: string }; delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string }; usage?: { input_tokens?: number; output_tokens?: number }; message?: { usage?: { input_tokens?: number; output_tokens?: number } } }
              try { ev = JSON.parse(payload) } catch { continue }
              if (ev.type === 'message_start' && ev.message?.usage) {
                uIn  += ev.message.usage.input_tokens  ?? 0
                uOut += ev.message.usage.output_tokens ?? 0
              } else if (ev.type === 'content_block_start' && typeof ev.index === 'number' && ev.content_block) {
                blocks[ev.index] = { type: ev.content_block.type, id: ev.content_block.id, name: ev.content_block.name, text: '', _json: '' }
              } else if (ev.type === 'content_block_delta' && typeof ev.index === 'number') {
                const b = blocks[ev.index]; if (!b) continue
                if (ev.delta?.type === 'text_delta' && ev.delta.text) { b.text += ev.delta.text; full += ev.delta.text; emit({ type: 'delta', text: ev.delta.text }) }
                else if (ev.delta?.type === 'input_json_delta' && ev.delta.partial_json) { b._json += ev.delta.partial_json }
              } else if (ev.type === 'message_delta') {
                if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason
                if (ev.usage?.output_tokens) uOut += ev.usage.output_tokens
              }
            }
          }
          // Finalise blocks (parse tool inputs).
          const out: Block[] = Object.keys(blocks).map(Number).sort((a, b) => a - b).map(i => {
            const b = blocks[i]
            if (b.type === 'text') return { type: 'text', text: b.text ?? '' }
            if (b.type === 'tool_use') { let input: unknown = {}; try { input = JSON.parse(b._json || '{}') } catch { /* keep {} */ } return { type: 'tool_use', id: b.id, name: b.name, input } }
            return { type: b.type }
          })
          totalIn += uIn; totalOut += uOut
          return { full, blocks: out, stopReason }
        }

        try {
          let full = ''
          for (let iter = 0; iter < 5; iter++) {
            const turn = await runTurn()
            full += turn.full
            if (ac.signal.aborted) { controller.close(); return }
            const toolUses = turn.blocks.filter(b => b.type === 'tool_use')
            if (turn.stopReason === 'tool_use' && toolUses.length && effCaseId) {
              // Record the assistant turn, run the tools, feed results back, loop.
              msgs.push({ role: 'assistant', content: turn.blocks })
              const results = await Promise.all(toolUses.map(async t => ({
                type: 'tool_result', tool_use_id: t.id, content: await execTool(t.name!, (t.input ?? {}) as Record<string, unknown>, effCaseId, origin),
              })))
              msgs.push({ role: 'user', content: results as unknown as Block[] })
              continue
            }
            break
          }

          if (ac.signal.aborted) { controller.close(); return }

          let text = full; let action: unknown = null; let citations: unknown[] = []
          const m = text.match(/```action\s*([\s\S]*?)```/i)
          if (m) { try { action = JSON.parse(m[1].trim()) } catch { /* ignore */ } text = text.replace(m[0], '').trim() }
          const c = text.match(/```citations\s*([\s\S]*?)```/i)
          if (c) { try { const parsed = JSON.parse(c[1].trim()); if (Array.isArray(parsed)) citations = parsed } catch { /* ignore */ } text = text.replace(c[0], '').trim() }
          if (!text) text = 'Done.'

          const iRes = await fetch(`${SB_URL}/rest/v1/chat_messages`, {
            method: 'POST', headers: sbH('return=representation'),
            body: JSON.stringify({ thread_id, role: 'assistant', content: text, message_status: 'complete', citations_json: citations, metadata_json: { model: 'claude-opus-4-8', ...(action ? { action } : {}) } }),
          })
          const saved = iRes.ok ? (await iRes.json())[0] : null
          fetch(`${SB_URL}/rest/v1/chat_threads?id=eq.${thread_id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ last_message_at: new Date().toISOString() }) }).catch(() => {})
          void logAnthropicUsage('chat_consultant', { input_tokens: totalIn, output_tokens: totalOut }, effCaseId ?? null)
          emit({ type: 'done', message: saved })
        } catch (e) {
          if (!ac.signal.aborted) emit({ type: 'error', error: String(e) })
        } finally {
          try { controller.close() } catch { /* already closed */ }
        }
      },
      cancel() { ac.abort() },
    })

    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
