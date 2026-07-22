/**
 * POST /api/nexus/rfq/recommend
 * Body: { case_id, recommended_dispatch_id?, shortlist_dispatch_ids?: string[] }
 *
 * Drafts a CLIENT-FACING recommendation email from the captured insurer quotes:
 * a plain-language comparison of the options + the broker's recommendation and
 * rationale. Marks the chosen quote 'recommended' (and shortlist 'shortlisted').
 * Returns { subject, body, to_email, thread_id } for the client thread — Nexus
 * never sends; the UI hands this to Engagement to review + send.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { productLineLabel }          from '@/lib/product-lines'
import { logAnthropicUsage, logGeminiUsage } from '@/lib/gemini-usage'
import { logRfqEvent }         from '@/lib/rfq-log'

const SB_URL        = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const GEMINI_PRO    = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent'

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type QuoteRow = {
  dispatch_id: string; rfq_request_id: string | null; insurer_name: string | null; product_line: string | null
  premium: string | null; excess: string | null; limit_indemnity: string | null
  validity: string | null; key_terms: string[] | null; exclusions: string[] | null; summary: string | null
}

function parseJson(raw: string): { subject?: string; body?: string } | null {
  try { return JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()) } catch { return null }
}

async function draftWithOpus(prompt: string): Promise<{ subject?: string; body?: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method:  'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 4000, thinking: { type: 'adaptive' }, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) return null
    const data = await res.json()
    void logAnthropicUsage('rfq_recommend', data?.usage)
    const text = ((data?.content ?? []) as { type?: string; text?: string }[]).find(b => b.type === 'text')?.text ?? ''
    return parseJson(text)
  } catch { return null }
}

async function draftWithGemini(prompt: string): Promise<{ subject?: string; body?: string } | null> {
  const key = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS
  if (!key) return null
  try {
    const res = await fetch(`${GEMINI_PRO}?key=${key}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json' } }),
    })
    if (!res.ok) return null
    const data = await res.json()
    void logGeminiUsage('rfq_recommend', data?.usageMetadata ?? {}, null, 'gemini-3.1-pro-preview')
    return parseJson((data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim())
  } catch { return null }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { case_id, recommended_dispatch_id, shortlist_dispatch_ids } = await req.json() as {
      case_id?: string; recommended_dispatch_id?: string; shortlist_dispatch_ids?: string[]
    }
    if (!case_id) return NextResponse.json({ error: 'case_id required' }, { status: 400 })

    // Captured quotes for this case.
    const qRes = await fetch(`${SB_URL}/rest/v1/rfq_quotes?case_id=eq.${case_id}&select=dispatch_id,rfq_request_id,insurer_name,product_line,premium,excess,limit_indemnity,validity,key_terms,exclusions,summary`, { headers: sbH(), cache: 'no-store' })
    const quotes: QuoteRow[] = qRes.ok ? await qRes.json() : []
    if (quotes.length === 0) return NextResponse.json({ error: 'No captured quotes to recommend from yet — run Compare quotes first.' }, { status: 400 })

    // Client thread + contact + insured name.
    const reqRes = await fetch(`${SB_URL}/rest/v1/rfq_requests?case_id=eq.${case_id}&client_thread_id=not.is.null&select=insured_name,client_thread_id&limit=1`, { headers: sbH(), cache: 'no-store' })
    const reqRow = reqRes.ok ? (await reqRes.json())[0] : null
    const clientThreadId = reqRow?.client_thread_id ?? null
    let toEmail: string | null = null
    if (clientThreadId) {
      const tRes = await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${clientThreadId}&select=contact:contacts(email)&limit=1`, { headers: sbH(), cache: 'no-store' })
      toEmail = tRes.ok ? (await tRes.json())[0]?.contact?.email ?? null : null
    }

    // House skeleton for the client email — follow its structure and fill the
    // {placeholders} from the quotes ({options_summary}, {recommendation}, etc).
    let tone = ''
    const tRes = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.client_reco_template&limit=1`, { headers: sbH(), cache: 'no-store' })
    const tVal = tRes.ok ? (await tRes.json())[0]?.value : null
    if (tVal) {
      let skeleton = tVal
      try { const t = JSON.parse(tVal) as { subject?: string; body?: string }; skeleton = [t.subject ? `Subject: ${t.subject}` : '', t.body ?? ''].filter(Boolean).join('\n') } catch { /* legacy plain text */ }
      tone = `\nHOUSE TEMPLATE — follow this structure and fill the {placeholders} from the quotes ({options_summary} = the plain-language comparison, {recommendation} = your pick, {rationale} = why, {quote_count} = number of quotes). Keep the house wording where sensible:\n"""${skeleton}"""\n`
    }

    const rec = quotes.find(q => q.dispatch_id === recommended_dispatch_id) ?? null
    const optionsText = quotes.map((q, i) => [
      `Option ${i + 1}: ${q.insurer_name ?? 'Insurer'} — ${productLineLabel(q.product_line ?? '')}`,
      `  Premium: ${q.premium ?? 'not stated'}`,
      `  Excess: ${q.excess ?? 'not stated'}`,
      `  Limit: ${q.limit_indemnity ?? 'not stated'}`,
      `  Validity: ${q.validity ?? 'not stated'}`,
      q.key_terms?.length ? `  Key terms: ${q.key_terms.join('; ')}` : null,
      q.exclusions?.length ? `  Exclusions: ${q.exclusions.join('; ')}` : null,
      q.dispatch_id === recommended_dispatch_id ? '  >> BROKER PICK' : null,
    ].filter(Boolean).join('\n')).join('\n\n')

    const prompt = `You are a broker at Trade Risk Solutions (TRS), a corporate insurance broker in Singapore, writing to your client "${reqRow?.insured_name ?? 'the client'}" to present the quotations you obtained and recommend a way forward.
${tone}
Quotes obtained (figures are exact, as quoted by insurers — reproduce any monetary figure EXACTLY as written, do not alter):
${optionsText}

Write a clear, warm, professional client email that:
- Briefly frames that you went to market on their behalf and have quotes to share.
- Presents the options in plain client language (not jargon), comparing premium, excess, limit and any notable terms/exclusions.
${rec ? `- Recommends ${rec.insurer_name} as the broker's pick, with a short, honest rationale (value, cover, terms) — balanced, not salesy.` : '- Gives a balanced view; if no single option is clearly best, say what trade-offs the client should weigh.'}
- Ends with a clear next step (e.g. confirm which to proceed with, or a call).
- Do NOT invent figures or coverage not listed. Do NOT include a signature/sign-off block (it is appended automatically).

Return ONLY JSON: { "subject": "<subject>", "body": "<plain-text email body>" }`

    const draft = (await draftWithOpus(prompt)) ?? (await draftWithGemini(prompt))
    if (!draft?.body) return NextResponse.json({ error: 'Could not draft recommendation' }, { status: 502 })

    // Persist statuses (best-effort).
    if (recommended_dispatch_id) {
      await fetch(`${SB_URL}/rest/v1/rfq_quotes?case_id=eq.${case_id}&dispatch_id=eq.${recommended_dispatch_id}`, {
        method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ status: 'recommended', updated_at: new Date().toISOString() }),
      }).catch(() => {})
      const rec = quotes.find(q => q.dispatch_id === recommended_dispatch_id)
      void logRfqEvent({ event_type: 'recommended', case_id, dispatch_id: recommended_dispatch_id, rfq_request_id: rec?.rfq_request_id ?? null, insurer_name: rec?.insurer_name ?? null, actor: user.email ?? null, summary: `Recommended ${rec?.insurer_name ?? 'insurer'} to client` })
    }
    for (const sid of (shortlist_dispatch_ids ?? []).filter(s => s !== recommended_dispatch_id)) {
      await fetch(`${SB_URL}/rest/v1/rfq_quotes?case_id=eq.${case_id}&dispatch_id=eq.${sid}`, {
        method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ status: 'shortlisted', updated_at: new Date().toISOString() }),
      }).catch(() => {})
    }

    return NextResponse.json({ subject: draft.subject ?? 'Your insurance quotations', body: draft.body, to_email: toEmail, thread_id: clientThreadId })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
