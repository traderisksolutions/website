/**
 * POST /api/companies/:id/ask { question } → { answer, sources, refused }
 *
 * Ask about this client (src/lib/admin/k/ask.ts): one business's repository is loaded (the
 * company's group: facts, policies, debit notes, claims, requests, quotations, recent record
 * entries), the model answers from it and cites it, and code refuses an answer with no source or
 * with a figure that is not on file. Nothing from another business is loaded, and nothing from a
 * thread in a colleague's own mailbox.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enc, inChunks, sbTry } from '@/lib/crm/db'
import { directory } from '@/lib/admin/k/deposit'
import { callGemini } from '@/lib/ai-call'
import { GEMINI_DEEP } from '@/lib/gemini-models'
import { ASK_SYSTEM, buildAskContext, checkAnswer } from '@/lib/admin/k/ask'
import { logActivity } from '@/lib/log-activity'
import { visibleThreadIds } from '@/lib/mail/visibility-server'

export const maxDuration = 90
type Row = Record<string, any>

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { question?: unknown }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : ''
  if (question.length < 3) return NextResponse.json({ error: 'Ask a question.' }, { status: 400 })

  const dir = await directory()
  if (!dir.byId.has(id)) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  const group = dir.group(id)
  const members = [...dir.byId.keys()].filter(c => dir.group(c) === group)
  const inMembers = `in.(${members.join(',')})`
  const [facts, policies, debitNotes, claims, ledger, quotations, threads] = await Promise.all([
    sbTry<Row[]>(`company_facts?group_id=eq.${enc(group)}&superseded_by=is.null&select=key,value,quote,source_kind,source_id,source_date&order=source_date.desc.nullslast&limit=400`, []),
    sbTry<Row[]>(`policies?company_id=${inMembers}&select=id,policy_number,insurer,class_of_insurance,product_line,start_date,end_date,lifecycle&order=end_date.desc.nullslast&limit=100`, []),
    sbTry<Row[]>(`debit_notes?company_id=${inMembers}&select=id,debit_note_no,issue_date,insurer,event_type,gross_amount,commission&order=issue_date.desc.nullslast&limit=150`, []),
    sbTry<Row[]>(`claims?company_id=${inMembers}&select=id,class,insurer_name,claimant,loss_date,notified_at,created_at,stage,amount_claimed,amount_settled&order=created_at.desc&limit=200`, []),
    sbTry<Row[]>(`company_ledger?group_id=eq.${enc(group)}&kind=in.(email_in,email_out,document,case,claim)&select=occurred_at,kind,party,title,summary,thread_id,links&order=occurred_at.desc&limit=120`, []),
    sbTry<Row[]>(`company_ledger?group_id=eq.${enc(group)}&kind=in.(quotation,placement)&select=occurred_at,title,summary,links&order=occurred_at.desc&limit=40`, []),
    sbTry<Row[]>(`company_ledger?group_id=eq.${enc(group)}&thread_id=not.is.null&select=thread_id&limit=3000`, []),
  ])
  // A thread in a colleague's own mailbox stays theirs (src/lib/mail/visibility.ts): its entries,
  // requests and the facts read from its emails are left out of the context.
  const factMsgs = facts.filter(f => f.source_kind === 'email' && f.source_id).map(f => f.source_id as string)
  const msgThread = new Map((await inChunks([...new Set(factMsgs)], 80, c => sbTry<Row[]>(`email_messages?id=in.(${c.join(',')})&select=id,thread_id`, []))).map(m => [m.id as string, m.thread_id as string]))
  const threadIds = [...new Set([...threads.map(t => t.thread_id as string), ...msgThread.values()])]
  const visible = await visibleThreadIds(threadIds, user.email ?? null)
  const seen = (t: string | null | undefined) => !t || visible.has(t)
  const requests = (await inChunks(threadIds.filter(t => visible.has(t)), 80, c => sbTry<Row[]>(`follow_ups?thread_id=in.(${c.join(',')})&select=status,owner_party,what,since_at,due_at,thread_id&order=since_at.desc&limit=200`, []))).sort((a, b) => String(b.since_at).localeCompare(String(a.since_at)))

  const ctx = buildAskContext({ business: String(dir.byId.get(group)?.company_name ?? dir.byId.get(id)?.company_name ?? 'the client'), facts: facts.filter(f => f.source_kind !== 'email' || seen(msgThread.get(f.source_id))), policies, debitNotes, claims, requests, quotations, ledger: ledger.filter(e => seen(e.thread_id)), today: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10) })
  const r = await callGemini({ agent: 'admin', feature: 'client_ask', model: GEMINI_DEEP, system: ASK_SYSTEM, json: true, temperature: 0, maxOutputTokens: 2000, thinkingShare: 0.3,
    metadata: { company_id: id, group_id: group }, parts: [{ text: `CONTEXT:\n${ctx.text}\n\nQUESTION: ${question}` }] })
  if (!r.text) return NextResponse.json({ error: r.error ?? 'No answer came back. Ask again.' }, { status: 502 })
  let parsed: unknown = null
  try { parsed = JSON.parse(r.text) } catch { return NextResponse.json({ error: 'The answer did not come back in the expected shape. Ask again.' }, { status: 502 }) }
  const out = checkAnswer(parsed, ctx)
  void logActivity({ action: 'client.asked', resource_type: 'company', resource_id: id, new_value: { question, refused: out.refused, sources: out.sources.map(s => s.id) }, metadata: { by: user.email ?? null } })
  return NextResponse.json(out)
}
