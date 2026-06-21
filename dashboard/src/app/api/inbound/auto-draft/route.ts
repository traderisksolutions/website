import { NextRequest, NextResponse } from 'next/server'
import { createSign }               from 'node:crypto'
import { logGeminiUsage }           from '@/lib/gemini-usage'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
const DRIVE_API  = 'https://www.googleapis.com/drive/v3'

const TOPIC_KEYWORDS = [
  'construction', 'marine', 'cargo', 'benefits', 'employee',
  'fire', 'property', 'liability', 'motor', 'travel',
  'engineering', 'hull', 'general', 'professional', 'cyber',
  'directors', 'officers', 'trade', 'credit', 'product',
]

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

function b64url(input: string | Buffer): string {
  const b = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64')
  return b.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getDriveToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const creds = JSON.parse(raw)
  const now   = Math.floor(Date.now() / 1000)
  const hdr   = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const pay   = b64url(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }))
  const unsigned = `${hdr}.${pay}`
  const signer   = createSign('RSA-SHA256')
  signer.update(unsigned)
  const jwt = `${unsigned}.${b64url(signer.sign(creds.private_key))}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Drive auth failed: ${JSON.stringify(data)}`)
  return data.access_token
}

type DriveFile = { id: string; name: string; mimeType: string }

async function listFaqFiles(token: string): Promise<DriveFile[]> {
  const folderId = process.env.GDRIVE_FAQ_FOLDER_ID ?? ''
  if (!folderId) return []
  const mimes = [
    'application/vnd.google-apps.document',
    'text/plain',
    'application/pdf',
  ].map(m => `mimeType='${m}'`).join(' or ')
  const q   = encodeURIComponent(`'${folderId}' in parents and (${mimes}) and trashed=false`)
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name,mimeType)&pageSize=50`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return Array.isArray(data.files) ? data.files : []
}

async function exportFileAsText(token: string, file: DriveFile): Promise<string> {
  const h = { Authorization: `Bearer ${token}` }
  if (file.mimeType === 'text/plain') {
    const r = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, { headers: h })
    return r.ok ? r.text() : ''
  }
  // Google Docs and PDFs: export as plain text via Drive export API
  const r = await fetch(`${DRIVE_API}/files/${file.id}/export?mimeType=text/plain`, { headers: h })
  return r.ok ? r.text() : ''
}

function scoreFile(filename: string, text: string): number {
  const n = filename.toLowerCase()
  const t = text.toLowerCase()
  return TOPIC_KEYWORDS.filter(k => n.includes(k) || t.includes(k)).length
}

async function fetchFaqContext(leadText: string): Promise<{ context: string; docNames: string[] }> {
  const folderId = process.env.GDRIVE_FAQ_FOLDER_ID ?? ''
  if (!folderId || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return { context: '', docNames: [] }
  try {
    const token = await getDriveToken()
    const files = await listFaqFiles(token)
    if (files.length === 0) return { context: '', docNames: [] }

    const scored   = files
      .map(f => ({ ...f, score: scoreFile(f.name, leadText) }))
      .sort((a, b) => b.score - a.score)
    const selected = scored.slice(0, 3)

    const parts:    string[] = []
    const docNames: string[] = []
    for (const file of selected) {
      const text = await exportFileAsText(token, file)
      if (text.trim()) {
        parts.push(`--- ${file.name} ---\n${text.trim().slice(0, 3000)}`)
        docNames.push(file.name)
      }
    }
    return { context: parts.join('\n\n'), docNames }
  } catch (e) {
    console.error('[inbound-auto-draft] FAQ fetch failed (non-fatal):', e)
    return { context: '', docNames: [] }
  }
}

// GET /api/inbound/auto-draft?leadId=X
// Returns existing draft body + id for UI pre-load.
export async function GET(req: NextRequest) {
  try {
    const leadId = new URL(req.url).searchParams.get('leadId')
    if (!leadId) return NextResponse.json({ content: null, draftId: null })

    const leadRes = await fetch(
      `${SB_URL}/rest/v1/inbound_leads?id=eq.${leadId}&select=ai_draft_id&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const leads = leadRes.ok ? await leadRes.json() : []
    const lead  = Array.isArray(leads) ? leads[0] : null
    if (!lead?.ai_draft_id) return NextResponse.json({ content: null, draftId: null })

    const draftRes = await fetch(
      `${SB_URL}/rest/v1/ai_drafts?id=eq.${lead.ai_draft_id}&select=id,body,status&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const drafts = draftRes.ok ? await draftRes.json() : []
    const draft  = Array.isArray(drafts) ? drafts[0] : null
    if (!draft?.body) return NextResponse.json({ content: null, draftId: null })

    return NextResponse.json({ content: draft.body as string, draftId: draft.id as string })
  } catch {
    return NextResponse.json({ content: null, draftId: null })
  }
}

// POST /api/inbound/auto-draft
// Body: { leadId, force? }
// Called by Supabase webhook on INSERT, or by the UI's Generate/Regenerate button.
export async function POST(req: NextRequest) {
  try {
    const { leadId, force } = await req.json() as { leadId: string; force?: boolean }
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })

    const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not set' }, { status: 500 })

    // Fetch lead
    const leadRes = await fetch(
      `${SB_URL}/rest/v1/inbound_leads?id=eq.${leadId}&select=id,first_name,last_name,email,topic,message,details,source,ai_draft_id&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const leads = leadRes.ok ? await leadRes.json() : []
    const lead  = Array.isArray(leads) ? leads[0] : null
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // Skip WhatsApp and leads without an email address
    if (lead.source === 'whatsapp_click' || !lead.email) {
      return NextResponse.json({ skipped: true, reason: 'no email or whatsapp source' })
    }

    // Return cached draft unless force-regenerating
    if (!force && lead.ai_draft_id) {
      const draftRes = await fetch(
        `${SB_URL}/rest/v1/ai_drafts?id=eq.${lead.ai_draft_id}&select=id,body&limit=1`,
        { headers: sbH(), cache: 'no-store' }
      )
      const drafts = draftRes.ok ? await draftRes.json() : []
      const draft  = Array.isArray(drafts) ? drafts[0] : null
      if (draft?.body) return NextResponse.json({ content: draft.body as string, draftId: draft.id as string, cached: true })
    }

    const firstName = (lead.first_name as string | null) || (lead.email as string).split('@')[0] || 'there'
    const fullName  = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || firstName
    const message   = (lead.message || lead.details || '') as string
    const topic     = (lead.topic || '') as string

    // Fetch FAQ docs and eval feedback concurrently
    const [{ context: faqContext, docNames }, examplesData, antiPatternData] = await Promise.all([
      fetchFaqContext([topic, message].join(' ')),
      // High-scoring human-approved examples — few-shot positives
      fetch(
        `${SB_URL}/rest/v1/prompt_examples?email_type=eq.CONVERSATION&order=score.desc,created_at.desc&limit=2&select=context_summary,ideal_reply`,
        { headers: sbH(), cache: 'no-store' }
      ).then(r => r.ok ? r.json() : []).catch(() => []),
      // Low-scoring evaluations — anti-patterns to avoid
      fetch(
        `${SB_URL}/rest/v1/draft_evaluations?email_type=eq.CONVERSATION&score=lte.3&order=created_at.desc&limit=6&select=eval_json`,
        { headers: sbH(), cache: 'no-store' }
      ).then(r => r.ok ? r.json() : []).catch(() => []),
    ])

    const knowledgeSection = faqContext
      ? `KNOWLEDGE BASE (approved FAQ documents — use to inform your reply, do not copy verbatim):\n${faqContext}`
      : 'No FAQ documents available — reply based on general TRS knowledge only.'

    // Few-shot examples from past high-scoring first-contact replies
    let fewShotSection = ''
    const examples: { context_summary?: string; ideal_reply: string }[] = Array.isArray(examplesData) ? examplesData : []
    if (examples.length > 0) {
      fewShotSection = `\n━━ EXAMPLES OF EXCELLENT FIRST-CONTACT REPLIES — learn the tone and pattern ━━\n` +
        examples.map((ex, i) =>
          `[Example ${i + 1}]${ex.context_summary ? `\nContext: ${ex.context_summary}` : ''}\nReply:\n${ex.ideal_reply.slice(0, 800)}`
        ).join('\n\n') + '\n'
    }

    // Anti-patterns from low-scoring drafts — avoid these
    let antiPatternSection = ''
    const apRows: { eval_json: { key_learning?: string } | null }[] = Array.isArray(antiPatternData) ? antiPatternData : []
    const learnings = apRows
      .map(r => r.eval_json?.key_learning)
      .filter((l): l is string => typeof l === 'string' && l.length > 15)
      .filter((l, i, arr) => arr.indexOf(l) === i)
      .slice(0, 3)
    if (learnings.length > 0) {
      antiPatternSection = `\n━━ AVOID THESE PATTERNS (learned from edited or rejected drafts) ━━\n` +
        learnings.map((l, i) => `${i + 1}. ${l}`).join('\n') + '\n'
    }

    const prompt = `You are an AI email assistant for Trade Risk Solutions (TRS), a Singapore-based commercial insurance brokerage.

A new website enquiry has just arrived. Write a warm, professional first-contact reply from TRS.

${knowledgeSection}
${fewShotSection}${antiPatternSection}
LEAD DETAILS:
Name: ${fullName}
Topic / Enquiry Type: ${topic || 'General insurance enquiry'}
Message:
${message || '(No message provided)'}

INSTRUCTIONS:
- Open with "Hi ${firstName},"
- Acknowledge their specific enquiry warmly and confirm TRS has received it
- If the knowledge base has relevant information for their topic, reference it naturally
- Do NOT quote prices, premiums, rates, or specific policy numbers — those require a formal quotation
- Let them know a TRS specialist will follow up within 1 business day
- Keep it 3–5 sentences — conversational and human, not corporate-sounding
- Do NOT include a subject line, closing line, sign-off, or signature
- Plain text only

Write only the email body.`

    const gemRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents:         [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
      }),
    })

    if (!gemRes.ok) {
      const err = await gemRes.text()
      return NextResponse.json({ error: `Gemini error: ${err}` }, { status: 502 })
    }

    const gemData = await gemRes.json()
    void logGeminiUsage('inbound_auto_draft', gemData.usageMetadata ?? {})
    const content = (gemData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    if (!content) return NextResponse.json({ error: 'Gemini returned no content' }, { status: 502 })

    // Upsert a minimal contact record — ai_drafts.contact_id is NOT NULL so we need one
    const encoded    = encodeURIComponent(lead.email as string)
    const existRes   = await fetch(
      `${SB_URL}/rest/v1/contacts?email=eq.${encoded}&select=id&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const existRows  = existRes.ok ? await existRes.json() : []
    let contactId: string | null = Array.isArray(existRows) && existRows[0]?.id ? existRows[0].id as string : null

    if (!contactId) {
      const newContact = await fetch(`${SB_URL}/rest/v1/contacts`, {
        method:  'POST',
        headers: sbH('return=representation'),
        body:    JSON.stringify({
          first_name:      lead.first_name ?? null,
          last_name:       lead.last_name  ?? null,
          email:           lead.email,
          source:          'website',
          inbound_lead_id: leadId,
        }),
      })
      const newRows = newContact.ok ? await newContact.json() : null
      const newRow  = Array.isArray(newRows) ? newRows[0] : newRows
      contactId     = (newRow?.id ?? null) as string | null
    }

    // Supersede any existing pending drafts for this lead
    await fetch(
      `${SB_URL}/rest/v1/ai_drafts?inbound_lead_id=eq.${leadId}&status=eq.pending`,
      { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ status: 'superseded' }) }
    )

    // Insert into ai_drafts — thread_id is null until reply is sent and thread is created
    const savedRes = await fetch(`${SB_URL}/rest/v1/ai_drafts`, {
      method:  'POST',
      headers: sbH('return=representation'),
      body: JSON.stringify({
        inbound_lead_id: leadId,
        contact_id:      contactId,
        channel:         'email',
        body:            content,
        status:          'pending',
        generated_by:    'faq',
        email_type:      'CONVERSATION',
        knowledge_docs:  docNames.length > 0 ? docNames : null,
      }),
    })
    const saved    = savedRes.ok ? await savedRes.json() : null
    const draftRow = Array.isArray(saved) ? saved[0] : saved
    const draftId  = (draftRow?.id ?? null) as string | null

    // Link draft back to the lead row
    if (draftId) {
      await fetch(`${SB_URL}/rest/v1/inbound_leads?id=eq.${leadId}`, {
        method:  'PATCH',
        headers: sbH('return=minimal'),
        body:    JSON.stringify({ ai_draft_id: draftId, ai_draft_at: new Date().toISOString() }),
      })
    }

    return NextResponse.json({ content, draftId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
