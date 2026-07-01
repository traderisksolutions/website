/**
 * Nexus Grand Analysis Engine — v2.0
 *
 * Two-brain architecture:
 *   Brain 1 — Gemini 2.5 Pro: Reads all emails + attachments across ALL linked threads,
 *              synthesises unified timeline, current status, and per-step draft emails.
 *
 *   Brain 2 — Claude Opus (or Gemini fallback): Takes Gemini's synthesis and builds
 *              the strategic playbook, legal research, and outreach strategy.
 *
 * Set ANTHROPIC_API_KEY in env to enable Claude. Falls back to Gemini-only if not set.
 */

import { logGeminiUsage }   from '@/lib/gemini-usage'
import { fetchKnowledgeDocs } from '@/lib/gdrive-knowledge'

const SB_URL          = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const STORAGE_BUCKET  = 'email-attachments'
const GEMINI_URL      = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'
const GEMINI_FLASH    = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
const GEMINI_UPLOAD   = 'https://generativelanguage.googleapis.com/upload/v1beta/files'
const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages'

const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API       = 'https://gmail.googleapis.com/gmail/v1/users/me'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type TimelineEvent = {
  date:         string
  party:        string
  event:        string
  significance: string
}

export type PlaybookStep = {
  step:        number
  action:      string      // "Email Client", "Email Insurer — QBE Marine"
  party_type:  string      // "client" | "insurer" | "lawyer" | "regulator" | "other"
  party_name:  string      // "John Tan (FlyORO)"
  to_emails:   string[]
  cc_emails:   string[]
  subject:     string
  priority:    'URGENT' | 'HIGH' | 'THIS_WEEK' | 'LATER'
  intent:      string      // What this email should achieve
  reasoning:   string      // Why this step now
  draft:       string      // Full email body
}

export type NexusAnalysis = {
  historical_timeline: TimelineEvent[]
  current_status: {
    summary:         string
    blocking_issues: string[]
    pending_from:    Record<string, string>
  }
  playbook:           PlaybookStep[]
  outreach_strategy:  Record<string, { tone: string; key_message: string; timing: string }>
  legal_research: {
    singapore_relevance:        string
    applicable_regulations:     string[]
    precedents_or_guidance:     string[]
    sources:                    string[]
  } | null
}

// ── Gmail attachment fetcher ──────────────────────────────────────────────────

async function getGmailToken(): Promise<string | null> {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) return null
  try {
    const res = await fetch(GMAIL_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET,
        refresh_token: GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token',
      }),
    })
    const data = await res.json()
    return data.access_token ?? null
  } catch { return null }
}

async function fetchGmailAttachment(
  token: string, gmailMsgId: string, attachmentId: string
): Promise<Buffer | null> {
  try {
    const res = await fetch(
      `${GMAIL_API}/messages/${gmailMsgId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (!data?.data) return null
    const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(base64, 'base64')
  } catch { return null }
}

async function uploadToGemini(data: Buffer, filename: string, mimeType: string, apiKey: string): Promise<string | null> {
  const boundary = `nexus_${Date.now()}`
  const meta     = JSON.stringify({ display_name: filename })
  const body     = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`),
    Buffer.from(meta),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  try {
    const res  = await fetch(`${GEMINI_UPLOAD}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'X-Goog-Upload-Protocol': 'multipart',
      },
      body,
    })
    const json = await res.json()
    return json?.file?.uri ?? null
  } catch { return null }
}

// Download a binary from Supabase Storage and re-upload to Gemini Files API (fresh URI)
async function downloadFromStorageAndUploadToGemini(
  storagePath: string,
  filename:    string,
  mimeType:    string,
  apiKey:      string,
): Promise<string | null> {
  try {
    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return null
    const res = await fetch(
      `${SB_URL}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`,
      { headers: { apikey: k, Authorization: `Bearer ${k}` } }
    )
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return await uploadToGemini(buf, filename, mimeType, apiKey)
  } catch { return null }
}

type StoredAttachmentRow = {
  filename:    string
  mime_type:   string | null
  parsed_text: string | null
  storage_url: string | null
}

// Load pre-extracted attachments from email_attachments table.
// PDFs/images: re-upload from Supabase Storage to Gemini Files API (fresh URI each analysis).
// DOCX/XLSX/image descriptions: inject as text directly.
async function loadStoredAttachments(
  threadIds: string[],
  apiKey:    string,
): Promise<{
  textChunks: string[]
  fileParts:  { file_data: { mime_type: string; file_uri: string } }[]
  summary:    string[]
}> {
  const textChunks: string[] = []
  const fileParts:  { file_data: { mime_type: string; file_uri: string } }[] = []
  const summary:    string[] = []

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/email_attachments?thread_id=in.(${threadIds.join(',')})&select=filename,mime_type,parsed_text,storage_url&order=created_at.asc`,
      { headers: sbHeaders() }
    )
    const rows: StoredAttachmentRow[] = res.ok ? await res.json() : []
    if (!Array.isArray(rows) || rows.length === 0) return { textChunks, fileParts, summary }

    for (const row of rows) {
      const { filename, mime_type, parsed_text, storage_url } = row

      if (parsed_text) {
        textChunks.push(`\n[Attachment: ${filename}]\n${parsed_text}`)
        summary.push(`${filename} (pre-extracted, ${parsed_text.length} chars)`)
      }

      if (storage_url && mime_type) {
        const uri = await downloadFromStorageAndUploadToGemini(storage_url, filename, mime_type, apiKey)
        if (uri) {
          fileParts.push({ file_data: { mime_type, file_uri: uri } })
          summary.push(`${filename} (PDF/image re-uploaded to Gemini)`)
        }
      }
    }
  } catch (e) {
    console.warn('[nexus] loadStoredAttachments non-fatal:', e instanceof Error ? e.message : e)
  }

  return { textChunks, fileParts, summary }
}

// Fetch attachments for messages that have them, upload to Gemini, return file parts
async function fetchAndUploadAttachments(
  threadMessages: { gmail_message_id: string | null; has_attachments: boolean }[],
  apiKey: string,
): Promise<{ text: string; fileParts: { file_data: { mime_type: string; file_uri: string } }[]; attachmentSummary: string[] }> {
  const fileParts: { file_data: { mime_type: string; file_uri: string } }[] = []
  const attachmentSummary: string[] = []
  const textChunks: string[] = []

  const gmailToken = await getGmailToken()
  if (!gmailToken) return { text: '', fileParts: [], attachmentSummary: ['(Gmail credentials not configured for attachment fetching)'] }

  const msgsWithAttachments = threadMessages.filter(m => m.has_attachments && m.gmail_message_id)

  for (const msg of msgsWithAttachments.slice(0, 10)) { // cap at 10 messages with attachments
    try {
      const msgRes = await fetch(
        `${GMAIL_API}/messages/${msg.gmail_message_id}?format=full`,
        { headers: { Authorization: `Bearer ${gmailToken}` } }
      )
      if (!msgRes.ok) continue
      const gmailMsg = await msgRes.json()

      const parts: { filename?: string; mimeType: string; body?: { attachmentId?: string; size?: number } }[] =
        gmailMsg.payload?.parts ?? []

      for (const part of parts) {
        if (!part.filename || !part.body?.attachmentId || !part.body.size) continue
        if (part.body.size > 20_000_000) { // skip >20MB
          attachmentSummary.push(`${part.filename} (too large to process, ${Math.round(part.body.size / 1024 / 1024)}MB)`)
          continue
        }

        const attData = await fetchGmailAttachment(gmailToken, msg.gmail_message_id!, part.body.attachmentId)
        if (!attData) continue

        const mime = part.mimeType.toLowerCase()

        // PDF and images → upload to Gemini File API for multimodal reading
        if (mime === 'application/pdf' || mime.startsWith('image/')) {
          const uri = await uploadToGemini(attData, part.filename, part.mimeType, apiKey)
          if (uri) {
            fileParts.push({ file_data: { mime_type: part.mimeType, file_uri: uri } })
            attachmentSummary.push(`${part.filename} (${mime === 'application/pdf' ? 'PDF' : 'image'}, uploaded to Gemini)`)
          }
        }

        // DOCX → extract text via mammoth if available (best-effort)
        else if (mime.includes('wordprocessingml') || mime.includes('msword') || part.filename.endsWith('.docx')) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const mammoth = require('mammoth') as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> } | null
            if (mammoth) {
              const result = await mammoth.extractRawText({ buffer: attData })
              if (result.value) {
                textChunks.push(`\n[Attachment: ${part.filename}]\n${result.value.slice(0, 5000)}`)
                attachmentSummary.push(`${part.filename} (DOCX, text extracted)`)
              }
            } else {
              attachmentSummary.push(`${part.filename} (DOCX — install mammoth to extract text)`)
            }
          } catch { attachmentSummary.push(`${part.filename} (DOCX, extraction failed)`) }
        }

        // XLSX → extract as text table (best-effort)
        else if (mime.includes('spreadsheetml') || mime.includes('excel') || part.filename.endsWith('.xlsx')) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const xlsx = require('xlsx') as {
              read: (data: Buffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> }
              utils: { sheet_to_csv: (sheet: unknown) => string }
            } | null
            if (xlsx) {
              const wb    = xlsx.read(attData, { type: 'buffer' })
              const sheets = wb.SheetNames.map((name: string) => {
                const csv = xlsx.utils.sheet_to_csv(wb.Sheets[name])
                return `Sheet: ${name}\n${csv.slice(0, 3000)}`
              })
              textChunks.push(`\n[Attachment: ${part.filename}]\n${sheets.join('\n\n')}`)
              attachmentSummary.push(`${part.filename} (XLSX, extracted as table)`)
            } else {
              attachmentSummary.push(`${part.filename} (XLSX — install xlsx to extract)`)
            }
          } catch { attachmentSummary.push(`${part.filename} (XLSX, extraction failed)`) }
        }

        else {
          attachmentSummary.push(`${part.filename} (${part.mimeType}, not supported yet)`)
        }
      }
    } catch { /* non-fatal */ }
  }

  return { text: textChunks.join('\n'), fileParts, attachmentSummary }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runNexusAnalysis(caseId: string): Promise<NexusAnalysis> {
  const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!geminiKey) throw new Error('GEMINI_API_KEY_DRAFT_EMAIL not set')

  // 1. Fetch all case_threads with messages
  const ctRes = await fetch(
    `${SB_URL}/rest/v1/case_threads?case_id=eq.${caseId}&select=*&order=created_at.asc`,
    { headers: sbHeaders() }
  )
  const caseThreads: { thread_id: string; party_type: string; party_label: string | null }[] =
    ctRes.ok ? await ctRes.json() : []

  if (!Array.isArray(caseThreads) || caseThreads.length === 0) {
    throw new Error('No threads linked to this case. Link at least one thread before running analysis.')
  }

  const threadIds = caseThreads.map(ct => ct.thread_id)

  // 2. Fetch thread details + all messages + contact info in parallel
  const [threadRows, allMessages] = await Promise.all([
    fetch(
      `${SB_URL}/rest/v1/email_threads?id=in.(${threadIds.join(',')})&deleted_at=is.null&select=id,subject,contact_id,last_message_at`,
      { headers: sbHeaders() }
    ).then(r => r.ok ? r.json() : []).catch(() => []),

    fetch(
      `${SB_URL}/rest/v1/email_messages?thread_id=in.(${threadIds.join(',')})&deleted_at=is.null&order=sent_at.asc&select=id,thread_id,direction,from_address,body_text,sent_at,has_attachments,gmail_message_id`,
      { headers: sbHeaders() }
    ).then(r => r.ok ? r.json() : []).catch(() => []),
  ])

  // 3. Fetch contacts
  const contactIds = (Array.isArray(threadRows) ? threadRows : [])
    .map((t: { contact_id: string | null }) => t.contact_id)
    .filter((id): id is string => Boolean(id))

  const contacts = contactIds.length > 0
    ? await fetch(
        `${SB_URL}/rest/v1/contacts?id=in.(${contactIds.join(',')})&select=id,email,first_name,last_name,company`,
        { headers: sbHeaders() }
      ).then(r => r.ok ? r.json() : []).catch(() => [])
    : []

  const contactMap = Object.fromEntries(
    (Array.isArray(contacts) ? contacts : []).map((c: { id: string; email: string | null; first_name: string | null; last_name: string | null; company: string | null }) => [c.id, c])
  )
  const threadContactMap = Object.fromEntries(
    (Array.isArray(threadRows) ? threadRows : []).map((t: { id: string; contact_id: string | null }) => [
      t.id,
      t.contact_id ? contactMap[t.contact_id] ?? null : null,
    ])
  )

  // 4. Build party info map
  const partyMap = Object.fromEntries(
    caseThreads.map(ct => {
      const contact = threadContactMap[ct.thread_id]
      const displayLabel = ct.party_label
        || (contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') + (contact.company ? ` (${contact.company})` : '') : null)
        || ct.party_type.charAt(0).toUpperCase() + ct.party_type.slice(1)
      return [ct.thread_id, { party_type: ct.party_type, display_label: displayLabel, contact }]
    })
  )

  // 5. Load attachments (stored-first) + GDrive knowledge docs
  // Primary: read from email_attachments table (pre-extracted by ingest pipeline).
  // Fallback: fetch live from Gmail API only if nothing has been extracted yet.
  const allMsgsRaw = Array.isArray(allMessages) ? allMessages : []

  const { textChunks: storedTexts, fileParts: storedParts, summary: storedSummary } =
    await loadStoredAttachments(threadIds, geminiKey)

  let attachmentText    = storedTexts.join('\n')
  let fileParts         = [...storedParts]
  let attachmentSummary = [...storedSummary]

  if (storedSummary.length === 0) {
    // Nothing pre-extracted — fall back to live Gmail API fetch
    const msgsWithAtts = allMsgsRaw as { gmail_message_id: string | null; has_attachments: boolean }[]
    const gmail        = await fetchAndUploadAttachments(msgsWithAtts, geminiKey)
    attachmentText    += gmail.text
    fileParts          = [...fileParts, ...gmail.fileParts]
    attachmentSummary  = [...attachmentSummary, ...gmail.attachmentSummary]
  }

  // GDrive knowledge: match policy docs to this case's content
  const topicHint = allMsgsRaw
    .map((m: { body_text: string | null }) => m.body_text ?? '')
    .join(' ')
    .slice(0, 3000)
  const gdriveDocs = await fetchKnowledgeDocs(topicHint, geminiKey, 'nexus-gdrive').catch(() => [])
  const gdriveFileParts = gdriveDocs.map(d => ({
    file_data: { mime_type: 'application/pdf' as const, file_uri: d.uri },
  }))
  if (gdriveDocs.length > 0) {
    console.log(`[nexus] GDrive: attached ${gdriveDocs.length} knowledge doc(s): ${gdriveDocs.map(d => d.name).join(', ')}`)
  }

  // 6. Build the unified thread corpus
  type MsgRow = {
    thread_id: string
    direction: string
    from_address: string | null
    body_text: string | null
    sent_at: string
    has_attachments: boolean
  }

  const msgs: MsgRow[] = Array.isArray(allMessages) ? allMessages : []

  // Group by thread then format
  const threadSections = caseThreads.map(ct => {
    const party    = partyMap[ct.thread_id]
    const thread   = (Array.isArray(threadRows) ? threadRows : []).find((t: { id: string }) => t.id === ct.thread_id)
    const subject  = thread?.subject ?? '(no subject)'
    const contact  = party.contact
    const contactEmail = contact?.email ?? 'unknown'

    const threadMsgs = msgs
      .filter(m => m.thread_id === ct.thread_id)
      .map(m => {
        const who  = m.direction === 'inbound' ? `${party.display_label} <${m.from_address ?? contactEmail}>` : 'TRS'
        const date = new Date(m.sent_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        const body = (m.body_text ?? '').slice(0, 15000) // generous limit with Gemini 2.5 Pro
        const att  = m.has_attachments ? ' [HAS ATTACHMENTS — see uploaded files]' : ''
        return `  [${date}] ${who}:${att}\n${body}`
      })
      .join('\n\n  ───\n\n')

    return `
━━ THREAD: ${subject}
━━ PARTY: ${party.display_label} [${party.party_type.toUpperCase()}]
━━ CONTACT EMAIL: ${contactEmail}

${threadMsgs || '(no messages yet)'}`
  }).join('\n\n' + '═'.repeat(60) + '\n\n')

  // 7. Build to/cc data for each party (for playbook step drafts)
  const partyContacts = caseThreads.map(ct => {
    const party   = partyMap[ct.thread_id]
    const contact = party.contact
    const email   = contact?.email ?? null
    const name    = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : party.display_label
    return {
      party_type:  ct.party_type,
      party_label: party.display_label,
      email:       email ?? '',
      name,
      thread_id:   ct.thread_id,
    }
  })

  const partyContactsJson = JSON.stringify(partyContacts, null, 2)

  // 8. Attachments + knowledge base summary for prompt context
  const gdriveNote = gdriveDocs.length > 0
    ? `\nKNOWLEDGE BASE DOCS ATTACHED (GDrive — policy wordings, product guides):\n${gdriveDocs.map(d => `  • ${d.name}`).join('\n')}\nReference these for coverage interpretation and policy wording analysis.\n`
    : ''
  const attachmentNote = attachmentSummary.length > 0
    ? `\nATTACHMENTS FOUND:\n${attachmentSummary.map(a => `  • ${a}`).join('\n')}\n${gdriveNote}`
    : `\nNo email attachments found.\n${gdriveNote}`

  // ── PASS 1: Gemini 2.5 Pro — Read everything, synthesise ─────────────────

  const synthesisPrompt = `You are a senior insurance analyst at Trade Risk Solutions (TRS), a Singapore insurance brokerage.

You are reading ALL email threads linked to a single case simultaneously. Each thread is a conversation between TRS and a different party (client, insurer, lawyers, etc.).

Your job is to synthesise everything and return a structured JSON analysis.
${attachmentNote}

━━ ALL EMAIL THREADS ━━
${threadSections}

${attachmentText ? `━━ EXTRACTED ATTACHMENT TEXT ━━\n${attachmentText}\n` : ''}

━━ PARTY CONTACTS (use for To/CC in draft emails) ━━
${partyContactsJson}

━━ YOUR TASK ━━

Return ONLY valid JSON with this exact structure:

{
  "historical_timeline": [
    {
      "date": "YYYY-MM-DD",
      "party": "client|insurer|lawyer|trs|other",
      "event": "One sentence describing what happened",
      "significance": "Why this matters to the case"
    }
  ],
  "current_status": {
    "summary": "2-3 sentence summary of where the case stands right now",
    "blocking_issues": ["Issue 1", "Issue 2"],
    "pending_from": {
      "insurer": "What TRS is waiting for from the insurer",
      "client": "What TRS is waiting for from the client"
    }
  },
  "key_facts": {
    "claim_amount": "SGD X or null",
    "policy_reference": "Policy # or null",
    "incident_date": "YYYY-MM-DD or null",
    "coverage_type": "Marine Cargo | Property | etc or null",
    "parties_involved": ["Party 1", "Party 2"]
  },
  "suggested_playbook_steps": [
    {
      "step": 1,
      "action": "Email Client",
      "party_type": "client",
      "party_label": "John Tan (FlyORO)",
      "to_emails": ["john@flyoro.com"],
      "cc_emails": [],
      "subject": "Re: [original subject]",
      "priority": "URGENT",
      "intent": "What this email must achieve — specific and concrete",
      "reasoning": "Why this is the next step and why now",
      "draft": "Full professional email body starting with Dear [Name], — no subject line, no signature"
    }
  ],
  "outreach_strategy": {
    "client": {
      "tone": "reassuring|assertive|collaborative|informational",
      "key_message": "The one thing TRS must communicate to the client",
      "timing": "When to send — e.g. immediately, within 24h, this week"
    },
    "insurer": {
      "tone": "...",
      "key_message": "...",
      "timing": "..."
    }
  }
}

Rules for draft emails:
- Singapore business English, professional but warm
- BANNED: "Thank you for reaching out", "We hope this email finds you well", "Please do not hesitate", "Kindly note"
- Lead with the most important point immediately
- End body text only — no "Best regards" or signature (appended separately)
- Draft must reflect the actual case facts from the threads above
- Be specific — name amounts, dates, policy references where known

Produce as many playbook steps as necessary. Cover ALL parties that need to be contacted. Order by urgency.`

  const allFileParts = [...fileParts, ...gdriveFileParts]
  const synthParts: unknown[] = allFileParts.length > 0
    ? [...allFileParts, { text: synthesisPrompt }]
    : [{ text: synthesisPrompt }]

  const synthRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents:         [{ parts: synthParts }],
      tools:            [{ googleSearch: {} }],
      generationConfig: {
        temperature:     0.2,
        maxOutputTokens: 16384,
      },
    }),
  })

  if (!synthRes.ok) {
    const err = await synthRes.text()
    throw new Error(`Gemini synthesis failed ${synthRes.status}: ${err}`)
  }
  const synthData = await synthRes.json()
  void logGeminiUsage('nexus_synthesis', synthData.usageMetadata ?? {}, caseId)

  const synthParts2 = (synthData?.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]
  const synthText   = synthParts2.find(p => p.text?.trim().startsWith('{'))?.text
                   ?? synthParts2.find(p => p.text)?.text
  if (!synthText) throw new Error('Gemini returned empty synthesis')

  let synthesis: {
    historical_timeline:     TimelineEvent[]
    current_status:          NexusAnalysis['current_status']
    key_facts:               Record<string, unknown>
    suggested_playbook_steps: PlaybookStep[]
    outreach_strategy:       NexusAnalysis['outreach_strategy']
  }
  try {
    synthesis = JSON.parse(synthText)
  } catch {
    throw new Error(`Synthesis JSON parse failed: ${synthText.slice(0, 300)}`)
  }

  // ── PASS 2: Strategic layer (Claude Opus or Gemini fallback) ──────────────

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  let playbook:         PlaybookStep[]    = synthesis.suggested_playbook_steps ?? []
  let legalResearch:    NexusAnalysis['legal_research'] = null
  let outreach:         NexusAnalysis['outreach_strategy'] = synthesis.outreach_strategy ?? {}
  let strategyTokens = 0

  const strategyInput = `You are a senior insurance strategy consultant advising Trade Risk Solutions (TRS), a Singapore insurance brokerage.

Gemini has synthesised the following from ALL case email threads:

CURRENT STATUS:
${JSON.stringify(synthesis.current_status, null, 2)}

KEY FACTS:
${JSON.stringify(synthesis.key_facts ?? {}, null, 2)}

SUGGESTED PLAYBOOK (from Gemini synthesis):
${JSON.stringify(synthesis.suggested_playbook_steps, null, 2)}

PARTY CONTACTS:
${partyContactsJson}

Your task is to:
1. Critically evaluate and improve the playbook steps — ensure they are in the right order, correctly prioritised, and complete
2. Add any missing steps Gemini may have missed (escalation paths, regulatory notifications, documentation requests)
3. Provide Singapore-specific legal/regulatory guidance relevant to this case
4. Return the enhanced analysis as JSON

Return ONLY valid JSON:
{
  "playbook": [
    {
      "step": 1,
      "action": "Email Client",
      "party_type": "client",
      "party_name": "John Tan (FlyORO)",
      "to_emails": ["john@flyoro.com"],
      "cc_emails": [],
      "subject": "Re: ...",
      "priority": "URGENT",
      "intent": "...",
      "reasoning": "...",
      "draft": "Full email body starting with Dear [Name],"
    }
  ],
  "outreach_strategy": {
    "client": { "tone": "...", "key_message": "...", "timing": "..." }
  },
  "legal_research": {
    "singapore_relevance": "Overview of Singapore law/regulation relevant to this case type",
    "applicable_regulations": ["MAS Notice X", "Insurance Act s.XX", "..."],
    "precedents_or_guidance": ["FIDReC precedent: ...", "Court of Appeal: ..."],
    "sources": ["MAS.gov.sg", "FIDReC.com.sg", "..."]
  }
}`

  if (anthropicKey) {
    // Claude Opus — the strategic brain
    try {
      const claudeRes = await fetch(ANTHROPIC_URL, {
        method:  'POST',
        headers: {
          'x-api-key':         anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      'claude-opus-4-8',
          max_tokens: 8192,
          messages:   [{ role: 'user', content: strategyInput }],
        }),
      })
      if (claudeRes.ok) {
        const claudeData = await claudeRes.json()
        strategyTokens = (claudeData.usage?.input_tokens ?? 0) + (claudeData.usage?.output_tokens ?? 0)
        const claudeText = claudeData?.content?.[0]?.text ?? ''
        const jsonMatch = claudeText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const strategy = JSON.parse(jsonMatch[0])
          if (strategy.playbook)          playbook       = strategy.playbook
          if (strategy.legal_research)    legalResearch  = strategy.legal_research
          if (strategy.outreach_strategy) outreach       = strategy.outreach_strategy
        }
        console.log('[nexus] Claude Opus strategy pass complete, tokens:', strategyTokens)
      } else {
        console.warn('[nexus] Claude strategy pass failed:', claudeRes.status, '— using Gemini synthesis playbook')
      }
    } catch (e) {
      console.warn('[nexus] Claude strategy pass error (non-fatal):', e instanceof Error ? e.message : e)
    }
  } else {
    // No Claude key — enhance with a second Gemini pass for legal research only
    console.log('[nexus] No ANTHROPIC_API_KEY — skipping Claude strategy pass, using Gemini synthesis directly')

    // Still attempt legal research via Gemini with search grounding
    try {
      const legalPrompt = `You are a Singapore insurance law expert. Based on these case facts:
${JSON.stringify(synthesis.key_facts ?? {}, null, 2)}
${synthesis.current_status.summary}

Provide Singapore-specific legal and regulatory guidance. Use Google Search to find current MAS regulations, FIDReC guidance, and relevant precedents.

Return ONLY JSON:
{
  "singapore_relevance": "...",
  "applicable_regulations": ["..."],
  "precedents_or_guidance": ["..."],
  "sources": ["..."]
}`
      const legalRes = await fetch(`${GEMINI_FLASH}?key=${geminiKey}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents:         [{ parts: [{ text: legalPrompt }] }],
          tools:            [{ googleSearch: {} }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
      })
      if (legalRes.ok) {
        const legalData = await legalRes.json()
        const legalParts = (legalData?.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]
        const legalText  = legalParts.find(p => p.text?.trim().startsWith('{'))?.text
                        ?? legalParts.find(p => p.text)?.text
        if (legalText) {
          try { legalResearch = JSON.parse(legalText) }
          catch { /* non-fatal */ }
        }
      }
    } catch { /* non-fatal */ }
  }

  // ── Save to case_analyses ────────────────────────────────────────────────────

  const analysis: NexusAnalysis = {
    historical_timeline: synthesis.historical_timeline ?? [],
    current_status:      synthesis.current_status,
    playbook,
    outreach_strategy:   outreach,
    legal_research:      legalResearch,
  }

  await fetch(`${SB_URL}/rest/v1/case_analyses`, {
    method:  'POST',
    headers: sbHeaders('return=minimal'),
    body: JSON.stringify({
      case_id:             caseId,
      historical_timeline: analysis.historical_timeline,
      current_status:      analysis.current_status,
      playbook:            analysis.playbook,
      outreach_strategy:   analysis.outreach_strategy,
      legal_research:      analysis.legal_research,
      synthesis_model:     'gemini-2.5-pro',
      strategy_model:      anthropicKey ? 'claude-opus-4-8' : 'gemini-2.5-pro',
      gemini_tokens:       synthData.usageMetadata?.totalTokenCount ?? null,
      claude_tokens:       strategyTokens || null,
    }),
  }).catch(e => console.error('[nexus] analysis save failed (non-fatal):', e))

  // Bump case updated_at
  await fetch(`${SB_URL}/rest/v1/cases?id=eq.${caseId}`, {
    method:  'PATCH',
    headers: sbHeaders('return=minimal'),
    body:    JSON.stringify({ updated_at: new Date().toISOString() }),
  }).catch(() => {})

  return analysis
}
