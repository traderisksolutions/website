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

// ── V1 Analysis contract (stored in structured_analysis jsonb column) ─────────

export type Citation = {
  id:       string
  label:    string
  type:     'email' | 'attachment' | 'knowledge_doc' | 'web'
  date?:    string
  excerpt?: string
}

export type StakeholderV1 = {
  id:           string
  name:         string
  party_type:   string
  email?:       string
  company?:     string
  role_summary: string
  stance?:      string
  thread_id?:   string
}

export type TimelineEventV1 = {
  date:          string
  party:         string
  event:         string
  significance:  string
  citation_ids?: string[]
}

export type EvidenceItem = {
  id:                string
  filename_or_label: string
  source_type:       'email' | 'attachment' | 'knowledge_doc'
  key_facts:         string[]
  coverage_relevant: boolean
  citation_id?:      string
}

export type OpenQuestion = {
  question:      string
  priority:      'critical' | 'high' | 'medium' | 'low'
  directed_at?:  string
  citation_ids?: string[]
}

export type MissingItem = {
  item:          string
  required_from: string
  urgency:       'urgent' | 'normal' | 'low'
  impact:        string
}

export type Scenario = {
  name:                  string
  probability:           'high' | 'medium' | 'low'
  outcome:               string
  trs_action:            string
  assumptions:           string[]
  trigger_conditions:    string[]
  strategic_implication: string
  citation_ids?:         string[]
}

export type NextStepV1 = {
  step:          number
  action:        string
  owner:         string
  deadline?:     string
  priority:      'urgent' | 'high' | 'normal'
  rationale:     string
  citation_ids?: string[]
  depends_on?:   number[]
}

export type DraftArtifact = {
  artifact_type: 'email' | 'letter' | 'memo'
  to_party:      string
  party_type:    string
  to_emails:     string[]
  cc_emails:     string[]
  subject:       string
  body:          string
  intent:        string
  priority:      'urgent' | 'high' | 'normal'
  citation_ids?: string[]
}

export type ReserveGuidance = {
  recommended_reserve?: string
  basis:                string
  confidence:           'high' | 'medium' | 'low'
  risk_factors:         string[]
  citation_ids?:        string[]
}

export type AnalysisMetadata = {
  analysis_ts:          string
  synthesis_model:      string
  strategy_model:       string
  synthesis_tokens:     number | null
  strategy_tokens:      number | null
  threads_included:     number
  messages_included:    number
  attachments_included: { filename: string; method: string }[]
  gdrive_docs:          string[]
  truncation_flags:     string[]
}

export type NexusAnalysisV1 = {
  schema_version:         '1.0'
  case_brief: {
    summary:           string
    incident_date?:    string
    claim_amount?:     string
    policy_reference?: string
    coverage_type?:    string
    current_stage:     string
    blocking_issues:   string[]
    pending_from:      Record<string, string>
  }
  stakeholder_map:        StakeholderV1[]
  timeline:               TimelineEventV1[]
  evidence_ledger:        EvidenceItem[]
  open_questions:         OpenQuestion[]
  missing_items:          MissingItem[]
  scenario_analysis:      Scenario[]
  recommended_next_steps: NextStepV1[]
  draft_artifacts:        DraftArtifact[]
  reserve_guidance:       ReserveGuidance | null
  citations:              Citation[]
  analysis_metadata:      AnalysisMetadata
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
  metaItems:  { filename: string; method: string }[]
}> {
  const textChunks: string[] = []
  const fileParts:  { file_data: { mime_type: string; file_uri: string } }[] = []
  const summary:    string[] = []
  const metaItems:  { filename: string; method: string }[] = []

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/email_attachments?thread_id=in.(${threadIds.join(',')})&select=filename,mime_type,parsed_text,storage_url&order=created_at.asc`,
      { headers: sbHeaders() }
    )
    const rows: StoredAttachmentRow[] = res.ok ? await res.json() : []
    if (!Array.isArray(rows) || rows.length === 0) return { textChunks, fileParts, summary, metaItems }

    for (const row of rows) {
      const { filename, mime_type, parsed_text, storage_url } = row

      if (parsed_text) {
        textChunks.push(`\n[Attachment: ${filename} — pre-extracted text]\n${parsed_text}`)
        summary.push(`${filename} (pre-extracted text, ${parsed_text.length} chars)`)
        metaItems.push({ filename, method: 'pre-extracted-text' })
      }

      if (storage_url && mime_type) {
        const uri = await downloadFromStorageAndUploadToGemini(storage_url, filename, mime_type, apiKey)
        if (uri) {
          fileParts.push({ file_data: { mime_type, file_uri: uri } })
          const isImage = mime_type.startsWith('image/')
          summary.push(`${filename} (${isImage ? 'image' : 'PDF'} uploaded to Gemini for multimodal reading)`)
          metaItems.push({ filename, method: isImage ? 'gemini-vision' : 'gemini-pdf' })
        }
      }
    }
  } catch (e) {
    console.warn('[nexus] loadStoredAttachments non-fatal:', e instanceof Error ? e.message : e)
  }

  return { textChunks, fileParts, summary, metaItems }
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

// ── Post-processing guards ────────────────────────────────────────────────────

// Strip citation_ids that don't exist in the citations array — prevents phantom refs.
function purgeDanglingCitations(
  items: ({ citation_ids?: string[] } | null | undefined)[],
  validIds: Set<string>,
): void {
  for (const item of items) {
    if (!item || !Array.isArray(item.citation_ids)) continue
    item.citation_ids = item.citation_ids.filter(id => validIds.has(id))
  }
}

// Renumber steps 1..N after any deduplication, preserving relative order.
function renumberSteps(steps: NextStepV1[]): NextStepV1[] {
  const oldToNew = new Map<number, number>()
  const renumbered = steps.map((s, i) => {
    oldToNew.set(s.step, i + 1)
    return { ...s, step: i + 1 }
  })
  // Remap depends_on to new step numbers; drop refs that pointed to removed steps.
  return renumbered.map(s => ({
    ...s,
    depends_on: (s.depends_on ?? []).map(n => oldToNew.get(n)).filter((n): n is number => n !== undefined),
  }))
}

// Light deduplication: remove steps whose action string is a near-duplicate of an earlier step.
function deduplicateSteps(steps: NextStepV1[]): NextStepV1[] {
  const seen: string[] = []
  return steps.filter(s => {
    const key = s.action.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (seen.some(k => stringSimilarity(k, key) > 0.72)) return false
    seen.push(key)
    return true
  })
}

// Simple Dice coefficient for near-duplicate detection (no external deps).
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const bigrams = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2)
      m.set(bg, (m.get(bg) ?? 0) + 1)
    }
    return m
  }
  const aMap = bigrams(a)
  const bMap = bigrams(b)
  let intersection = 0
  for (const bg of Array.from(aMap.keys())) intersection += Math.min(aMap.get(bg)!, bMap.get(bg) ?? 0)
  return (2 * intersection) / (a.length + b.length - 2)
}

// Cap scenarios at 3; ensure each has required arrays even if model skipped them.
function normalizeScenarios(scenarios: Scenario[]): Scenario[] {
  return scenarios.slice(0, 3).map(s => ({
    ...s,
    assumptions:           Array.isArray(s.assumptions)        ? s.assumptions        : [],
    trigger_conditions:    Array.isArray(s.trigger_conditions)  ? s.trigger_conditions : [],
    strategic_implication: s.strategic_implication ?? s.trs_action ?? '',
    citation_ids:          Array.isArray(s.citation_ids)        ? s.citation_ids       : [],
  }))
}

// ── JSON parser (strips fences, regex fallback) ───────────────────────────────

function parseJsonSafe(text: string): unknown {
  let s = text.trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  try { return JSON.parse(s) } catch { /* fall through */ }
  const m = s.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch { /* fall through */ } }
  throw new Error(`JSON parse failed: ${s.slice(0, 200)}`)
}

// ── Auto-prune: keep last N unpinned runs ─────────────────────────────────────

const KEEP_RUNS_LIMIT = 15

async function pruneOldRuns(caseId: string): Promise<void> {
  const listRes = await fetch(
    `${SB_URL}/rest/v1/case_analyses?case_id=eq.${caseId}&pinned=eq.false&order=created_at.desc&select=id`,
    { headers: sbHeaders() },
  )
  const rows: { id: string }[] = listRes.ok ? await listRes.json() : []
  if (!Array.isArray(rows) || rows.length <= KEEP_RUNS_LIMIT) return

  const toDelete = rows.slice(KEEP_RUNS_LIMIT).map(r => r.id)
  if (toDelete.length === 0) return

  await fetch(
    `${SB_URL}/rest/v1/case_analyses?id=in.(${toDelete.join(',')})&case_id=eq.${caseId}`,
    { method: 'DELETE', headers: sbHeaders('return=minimal') },
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runNexusAnalysis(caseId: string, triggeredBy?: string | null): Promise<NexusAnalysis> {
  const runStart  = Date.now()
  const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!geminiKey) throw new Error('GEMINI_API_KEY_DRAFT_EMAIL not set')

  try {

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

  const { textChunks: storedTexts, fileParts: storedParts, summary: storedSummary, metaItems: storedMeta } =
    await loadStoredAttachments(threadIds, geminiKey)

  let attachmentText    = storedTexts.join('\n')
  let fileParts         = [...storedParts]
  let attachmentSummary = [...storedSummary]
  let attachmentMeta:   { filename: string; method: string }[] = [...storedMeta]

  if (storedSummary.length === 0) {
    // Nothing pre-extracted — fall back to live Gmail API fetch
    const msgsWithAtts = allMsgsRaw as { gmail_message_id: string | null; has_attachments: boolean }[]
    const gmail        = await fetchAndUploadAttachments(msgsWithAtts, geminiKey)
    attachmentText    += gmail.text
    fileParts          = [...fileParts, ...gmail.fileParts]
    attachmentSummary  = [...attachmentSummary, ...gmail.attachmentSummary]
    attachmentMeta     = [...attachmentMeta, ...gmail.attachmentSummary.map(s => ({ filename: s.split(' (')[0], method: 'gmail-live' }))]
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

  // ── PASS 1: Gemini 2.5 Pro — Evidence synthesis (7 sections) ────────────────

  const synthesisPrompt = `You are a senior insurance analyst at Trade Risk Solutions (TRS), a Singapore insurance brokerage.

You are reading ALL email threads linked to a single case simultaneously. Each thread is a conversation between TRS and a different party (client, insurer, lawyers, etc.).

Your task: produce a structured evidence synthesis — extract only what is actually documented. No inference, no fabrication.

━━ EVIDENCE SOURCES IN THIS ANALYSIS ━━
${attachmentNote}
${attachmentText ? `(Extracted text from attachments is included below the email threads.)` : '(No pre-extracted attachment text available.)'}

━━ MULTIMODAL INSTRUCTION ━━
If PDF files or images are attached to this prompt, read them directly and thoroughly:
- Damage photos: describe visible damage, equipment, location, condition
- PDF documents: extract policy numbers, dates, amounts, endorsements, exclusions, signatures
- Scanned forms/letters: transcribe key fields and handwritten notes
- Spreadsheets/tables: identify amounts, dates, items, totals
For each file you read, create an evidence_ledger entry with specific key_facts you extracted directly.

━━ ALL EMAIL THREADS ━━
${threadSections}

${attachmentText ? `━━ EXTRACTED ATTACHMENT TEXT ━━\n${attachmentText}\n` : ''}

━━ PARTY CONTACTS ━━
${partyContactsJson}

━━ OUTPUT ━━

Return ONLY valid JSON (no markdown fences) with this exact structure:

{
  "case_brief": {
    "summary": "2-3 sentences: what happened, where the case stands, what is blocking resolution",
    "incident_date": "YYYY-MM-DD or null",
    "claim_amount": "SGD X,XXX or null if unknown",
    "policy_reference": "Policy number or null",
    "coverage_type": "e.g. Marine Cargo, Property, D&O, or null",
    "current_stage": "e.g. Claim submitted, Awaiting assessment, Negotiation, Disputed",
    "blocking_issues": ["Specific issue preventing progress — name the party responsible"],
    "pending_from": {
      "insurer": "Specific item TRS is waiting for from the insurer, or null",
      "client": "Specific item TRS is waiting for from the client, or null"
    }
  },
  "stakeholder_map": [
    {
      "id": "s1",
      "name": "Full name or company",
      "party_type": "client|insurer|lawyer|regulator|trs|other",
      "email": "email@example.com or null",
      "company": "Company name or null",
      "role_summary": "One sentence describing their role in this case",
      "stance": "cooperative|unresponsive|disputing liability|awaiting instruction|engaged — be specific",
      "thread_id": "thread_id from party contacts or null"
    }
  ],
  "timeline": [
    {
      "date": "YYYY-MM-DD",
      "party": "client|insurer|lawyer|trs|other",
      "event": "One sentence: what happened — specific, not generic",
      "significance": "Why this event matters to the case outcome or liability position",
      "citation_ids": ["c1"]
    }
  ],
  "evidence_ledger": [
    {
      "id": "e1",
      "filename_or_label": "Document name or 'Email: [subject line] ([date])'",
      "source_type": "email|attachment|knowledge_doc",
      "key_facts": ["Specific factual claim from this source — include amounts, dates, names"],
      "coverage_relevant": true,
      "citation_id": "c1"
    }
  ],
  "open_questions": [
    {
      "question": "Specific unanswered question that affects case outcome or liability",
      "priority": "critical|high|medium|low",
      "directed_at": "insurer|client|lawyer|trs or null",
      "citation_ids": ["c1"]
    }
  ],
  "missing_items": [
    {
      "item": "Specific document or information that is absent",
      "required_from": "insurer|client|lawyer|surveyor|other",
      "urgency": "urgent|normal|low",
      "impact": "What decision or action is blocked without this item"
    }
  ],
  "citations": [
    {
      "id": "c1",
      "label": "Short descriptive label for this source",
      "type": "email|attachment|knowledge_doc|web",
      "date": "YYYY-MM-DD or null",
      "excerpt": "Direct quote or key fact from the source (1-2 sentences)"
    }
  ]
}

━━ EVIDENCE QUALITY RULES ━━

CITATION DISCIPLINE:
- Every citation_id used in timeline, evidence_ledger, or open_questions MUST match an id defined in citations[]
- Every evidence_ledger item MUST have a citation_id
- Every timeline event MUST have at least one citation_id
- Only cite what you have actually read in the threads or attached files

CONTRADICTION DETECTION — examine all threads for conflicting claims:
- If two parties give different accounts of the same event (date, amount, cause, responsibility), add a missing_items entry:
  item = "Contradiction: [Party A] states [X]; [Party B] states [Y] — requires resolution"
  urgency = "urgent", required_from = the party whose version is unsubstantiated

UNANSWERED QUESTIONS — scan each thread:
- Find questions TRS asked that the other party did not answer
- Find requests for documents that were acknowledged but never fulfilled
- Add each as an open_questions entry with priority = "critical" if case-blocking

DOCUMENTS MENTIONED BUT NOT RECEIVED:
- If any email references a document (survey report, claim form, policy schedule, loss adjustor report) that was not subsequently received, add it to missing_items

SPECIFICITY RULES:
- key_facts in evidence_ledger must be specific facts, not summaries: "Claim amount SGD 45,000 per email dated 3 Jun" not "Claim submitted"
- timeline events must be specific: "Insurer QBE acknowledged claim by email" not "Insurer responded"
- stance in stakeholder_map must be specific: "Disputing quantum — arguing contributory negligence" not just "disputed"

Return [] for sections with no items; never omit a section`

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

  type SynthesisV1 = {
    case_brief:      NexusAnalysisV1['case_brief']
    stakeholder_map: NexusAnalysisV1['stakeholder_map']
    timeline:        NexusAnalysisV1['timeline']
    evidence_ledger: NexusAnalysisV1['evidence_ledger']
    open_questions:  NexusAnalysisV1['open_questions']
    missing_items:   NexusAnalysisV1['missing_items']
    citations:       NexusAnalysisV1['citations']
  }

  let synthesis: SynthesisV1
  try {
    synthesis = parseJsonSafe(synthText) as SynthesisV1
  } catch {
    throw new Error(`Synthesis JSON parse failed: ${synthText.slice(0, 300)}`)
  }

  // ── PASS 2: Strategic layer (Claude Opus or Gemini fallback) ──────────────

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  let scenarioAnalysis:     NexusAnalysisV1['scenario_analysis']      = []
  let recommendedNextSteps: NexusAnalysisV1['recommended_next_steps'] = []
  let draftArtifacts:       NexusAnalysisV1['draft_artifacts']        = []
  let reserveGuidance:      NexusAnalysisV1['reserve_guidance']       = null
  let strategyTokens = 0

  // Build a "recently completed actions" summary to feed into the hygiene rules
  const recentEvents = (synthesis.timeline ?? []).slice(-6).map(e => `${e.date}: ${e.event}`).join('\n')

  const strategyInput = `You are a senior insurance strategy consultant advising Trade Risk Solutions (TRS), a Singapore insurance brokerage.

An evidence synthesis pass has produced the following structured analysis from all case email threads and attachments:

━━ CASE BRIEF ━━
${JSON.stringify(synthesis.case_brief, null, 2)}

━━ STAKEHOLDERS ━━
${JSON.stringify(synthesis.stakeholder_map, null, 2)}

━━ FULL TIMELINE (all events, chronological) ━━
${JSON.stringify(synthesis.timeline ?? [], null, 2)}

━━ EVIDENCE LEDGER ━━
${JSON.stringify(synthesis.evidence_ledger, null, 2)}

━━ OPEN QUESTIONS ━━
${JSON.stringify(synthesis.open_questions, null, 2)}

━━ MISSING ITEMS ━━
${JSON.stringify(synthesis.missing_items, null, 2)}

━━ PARTY CONTACTS (use for To/CC fields) ━━
${partyContactsJson}

━━ CITATIONS (cite these ids in your output) ━━
${JSON.stringify(synthesis.citations, null, 2)}

━━ RECENTLY COMPLETED ACTIONS (last 6 timeline events) ━━
${recentEvents || '(none)'}

━━ YOUR TASK ━━

Produce four strategic sections grounded in the evidence above. Return ONLY valid JSON (no markdown fences):

{
  "scenario_analysis": [
    {
      "name": "Scenario name — specific to this case (e.g. 'Full indemnity settlement', 'Partial payout after survey dispute', 'Policy repudiation — exclusion applied')",
      "probability": "high|medium|low",
      "outcome": "What specifically happens in this scenario — name parties, amounts, deadlines",
      "trs_action": "Concrete action TRS must take NOW to advance the favourable scenario or mitigate the adverse one",
      "assumptions": ["Key assumption that must hold for this scenario to materialise — be specific"],
      "trigger_conditions": ["Observable event or decision that would lock in this scenario"],
      "strategic_implication": "One sentence: what this scenario means for TRS's negotiating position and reserve requirement",
      "citation_ids": ["c1"]
    }
  ],
  "recommended_next_steps": [
    {
      "step": 1,
      "action": "Specific action — who does what, to whom, by when",
      "owner": "trs|client|insurer|lawyer|other",
      "deadline": "e.g. Within 48h, 2026-07-05, or null",
      "priority": "urgent|high|normal",
      "rationale": "Why this step is required now — cite the evidence item or open question that makes it necessary",
      "citation_ids": ["c1"],
      "depends_on": []
    }
  ],
  "draft_artifacts": [
    {
      "artifact_type": "email|letter|memo",
      "to_party": "Display name of party",
      "party_type": "client|insurer|lawyer|regulator|other",
      "to_emails": ["email@example.com"],
      "cc_emails": [],
      "subject": "Email subject line",
      "body": "Full professional email body. Start with Dear [Name],. Singapore business English. Lead with the most important point. Concrete and specific — name amounts, dates, policy references. No generic filler phrases (Thank you for reaching out / Please do not hesitate / Kindly note / I hope this email finds you well). No sign-off line.",
      "intent": "Specific outcome this communication must achieve",
      "priority": "urgent|high|normal",
      "citation_ids": ["c1"]
    }
  ],
  "reserve_guidance": {
    "recommended_reserve": "SGD X,XXX or a range, or null if cannot estimate",
    "basis": "Evidence-based reasoning citing specific amounts, survey findings, or comparable precedents from the case",
    "confidence": "high|medium|low",
    "risk_factors": ["Specific factor that could change the reserve estimate"],
    "citation_ids": ["c1"]
  }
}

━━ STRATEGIC QUALITY RULES ━━

EVIDENCE GROUNDING:
- Every recommended_next_steps entry MUST include citation_ids referencing the evidence or open question driving that step
- Every scenario MUST include citation_ids showing what evidence supports its probability assessment
- Every draft_artifact MUST cite the evidence or question it is responding to
- If a recommendation cannot be grounded in a citation, remove it

STEP SEQUENCING AND DEPENDENCIES:
- Order recommended_next_steps by dependency first, then priority within the same dependency tier
- If step B requires output from step A (e.g. "Send demand letter" requires "Obtain survey report"), set B.depends_on = [A.step]
- Steps owned by external parties (client, insurer) come after TRS steps that prompt those actions
- Do NOT number steps until you have ordered them correctly

HYGIENE — AVOID REDUNDANT STEPS:
- Review RECENTLY COMPLETED ACTIONS above before writing recommended_next_steps
- Do NOT recommend an action that already appears in the timeline as completed, unless a follow-up is explicitly needed (e.g. "No response received after 14 days")
- Do NOT generate two draft_artifacts to the same party for the same purpose
- If TRS has already sent a chaser email visible in the threads, do not recommend sending the same chaser again

SCENARIO COMPLETENESS:
- Produce exactly 3 scenarios: best case, base case, and worst case — label them clearly in the name field
- assumptions[] must list the specific conditions that must hold (e.g. "Survey confirms full loss", "Insurer does not invoke exclusion clause 4.3")
- trigger_conditions[] must list observable signals (e.g. "Insurer issues reservation of rights letter", "Client provides signed proof of loss")
- strategic_implication must address TRS's reserve position and negotiating posture

DRAFT QUALITY:
- One draft per party that requires contact — ordered by priority
- Body must be substantive — reference actual amounts, dates, and positions from the case
- No generic templates — each draft must be specific to this case
- reserve_guidance must be null only if there is genuinely insufficient financial data in the threads`

  if (anthropicKey) {
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
        try {
          type StrategyV1 = Partial<{
            scenario_analysis:      NexusAnalysisV1['scenario_analysis']
            recommended_next_steps: NexusAnalysisV1['recommended_next_steps']
            draft_artifacts:        NexusAnalysisV1['draft_artifacts']
            reserve_guidance:       NexusAnalysisV1['reserve_guidance']
          }>
          const strategy = parseJsonSafe(claudeText) as StrategyV1
          if (strategy.scenario_analysis)      scenarioAnalysis     = strategy.scenario_analysis
          if (strategy.recommended_next_steps) recommendedNextSteps = strategy.recommended_next_steps
          if (strategy.draft_artifacts)        draftArtifacts       = strategy.draft_artifacts
          if ('reserve_guidance' in strategy)  reserveGuidance      = strategy.reserve_guidance ?? null
        } catch { /* non-fatal: keep empty defaults */ }
        console.log('[nexus] Claude Opus strategy pass complete, tokens:', strategyTokens)
      } else {
        console.warn('[nexus] Claude strategy pass failed:', claudeRes.status, '— skipping')
      }
    } catch (e) {
      console.warn('[nexus] Claude strategy pass error (non-fatal):', e instanceof Error ? e.message : e)
    }
  } else {
    // No Claude key — Gemini Flash fallback for strategy pass
    console.log('[nexus] No ANTHROPIC_API_KEY — using Gemini Flash for strategy pass')
    try {
      const geminiStratRes = await fetch(`${GEMINI_FLASH}?key=${geminiKey}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents:         [{ parts: [{ text: strategyInput }] }],
          tools:            [{ googleSearch: {} }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
        }),
      })
      if (geminiStratRes.ok) {
        const gsd = await geminiStratRes.json()
        const gsParts = (gsd?.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]
        const gsText  = gsParts.find(p => p.text?.trim().startsWith('{'))?.text
                     ?? gsParts.find(p => p.text)?.text
        if (gsText) {
          try {
            type StrategyV1 = Partial<{
              scenario_analysis:      NexusAnalysisV1['scenario_analysis']
              recommended_next_steps: NexusAnalysisV1['recommended_next_steps']
              draft_artifacts:        NexusAnalysisV1['draft_artifacts']
              reserve_guidance:       NexusAnalysisV1['reserve_guidance']
            }>
            const strategy = parseJsonSafe(gsText) as StrategyV1
            if (strategy.scenario_analysis)      scenarioAnalysis     = strategy.scenario_analysis
            if (strategy.recommended_next_steps) recommendedNextSteps = strategy.recommended_next_steps
            if (strategy.draft_artifacts)        draftArtifacts       = strategy.draft_artifacts
            if ('reserve_guidance' in strategy)  reserveGuidance      = strategy.reserve_guidance ?? null
          } catch { /* non-fatal */ }
        }
      }
    } catch { /* non-fatal */ }
  }

  // ── Post-processing ───────────────────────────────────────────────────────────

  const validCitationIds = new Set((synthesis.citations ?? []).map(c => c.id))

  // Purge dangling citation refs from all sections that the strategy model produced.
  purgeDanglingCitations(
    [
      ...(scenarioAnalysis ?? []),
      ...(recommendedNextSteps ?? []),
      ...(draftArtifacts ?? []),
      reserveGuidance,
    ],
    validCitationIds,
  )

  const cleanedSteps = renumberSteps(deduplicateSteps(recommendedNextSteps ?? []))
  const cleanedScenarios = normalizeScenarios(scenarioAnalysis ?? [])

  const truncationFlags: string[] = []
  const allMsgsTotal = Array.isArray(allMessages) ? allMessages.length : 0
  if (allMsgsTotal > 200) truncationFlags.push(`messages: ${allMsgsTotal} total — body truncated at 15k chars each`)
  if ((synthesis.citations ?? []).length === 0) truncationFlags.push('synthesis returned no citations — evidence grounding may be weak')
  if (cleanedSteps.length === 0) truncationFlags.push('strategy pass returned no recommended steps')

  // ── Assemble analysis metadata for operator debug ──────────────────────────

  const strategyModelName = process.env.ANTHROPIC_API_KEY ? 'claude-opus-4-8' : 'gemini-2.5-flash'
  const analysisMetadata: AnalysisMetadata = {
    analysis_ts:          new Date().toISOString(),
    synthesis_model:      'gemini-2.5-pro',
    strategy_model:       strategyModelName,
    synthesis_tokens:     synthData.usageMetadata?.totalTokenCount ?? null,
    strategy_tokens:      strategyTokens || null,
    threads_included:     caseThreads.length,
    messages_included:    allMsgsTotal,
    attachments_included: [
      ...attachmentMeta,
      ...gdriveDocs.map(d => ({ filename: d.name, method: 'gdrive' })),
    ],
    gdrive_docs:          gdriveDocs.map(d => d.name),
    truncation_flags:     truncationFlags,
  }

  // ── Build V1 structured analysis ─────────────────────────────────────────────

  const structuredAnalysis: NexusAnalysisV1 = {
    schema_version:         '1.0',
    case_brief:             synthesis.case_brief,
    stakeholder_map:        synthesis.stakeholder_map  ?? [],
    timeline:               synthesis.timeline         ?? [],
    evidence_ledger:        synthesis.evidence_ledger  ?? [],
    open_questions:         synthesis.open_questions   ?? [],
    missing_items:          synthesis.missing_items    ?? [],
    scenario_analysis:      cleanedScenarios,
    recommended_next_steps: cleanedSteps,
    draft_artifacts:        draftArtifacts             ?? [],
    reserve_guidance:       reserveGuidance,
    citations:              synthesis.citations        ?? [],
    analysis_metadata:      analysisMetadata,
  }

  // ── Derive legacy columns from V1 for backwards compat ───────────────────────

  const legacyTimeline: TimelineEvent[] = (structuredAnalysis.timeline ?? []).map(e => ({
    date:         e.date,
    party:        e.party,
    event:        e.event,
    significance: e.significance,
  }))

  const legacyStatus: NexusAnalysis['current_status'] = {
    summary:         synthesis.case_brief.summary,
    blocking_issues: synthesis.case_brief.blocking_issues ?? [],
    pending_from:    synthesis.case_brief.pending_from    ?? {},
  }

  const legacyPlaybook: PlaybookStep[] = (draftArtifacts ?? []).map((a, i) => ({
    step:       i + 1,
    action:     a.artifact_type === 'email' ? `Email ${a.to_party}` : `${a.artifact_type} to ${a.to_party}`,
    party_type: a.party_type,
    party_name: a.to_party,
    to_emails:  a.to_emails ?? [],
    cc_emails:  a.cc_emails ?? [],
    subject:    a.subject,
    priority:   a.priority === 'urgent' ? 'URGENT' : a.priority === 'high' ? 'HIGH' : 'THIS_WEEK',
    intent:     a.intent,
    reasoning:  (recommendedNextSteps ?? []).find(s => s.owner === a.party_type)?.rationale ?? '',
    draft:      a.body,
  }))

  const legacyOutreach: NexusAnalysis['outreach_strategy'] = {}
  for (const step of (recommendedNextSteps ?? [])) {
    if (step.owner !== 'trs' && !legacyOutreach[step.owner]) {
      legacyOutreach[step.owner] = {
        tone:        'collaborative',
        key_message: step.action,
        timing:      step.deadline ?? 'As soon as possible',
      }
    }
  }

  const analysis: NexusAnalysis = {
    historical_timeline: legacyTimeline,
    current_status:      legacyStatus,
    playbook:            legacyPlaybook,
    outreach_strategy:   legacyOutreach,
    legal_research:      null,
  }

  // ── Save to case_analyses ────────────────────────────────────────────────────

  const runDurationMs = Date.now() - runStart

  await fetch(`${SB_URL}/rest/v1/case_analyses`, {
    method:  'POST',
    headers: sbHeaders('return=minimal'),
    body: JSON.stringify({
      case_id:             caseId,
      structured_analysis: structuredAnalysis,
      schema_version:      'v1',
      historical_timeline: analysis.historical_timeline,
      current_status:      analysis.current_status,
      playbook:            analysis.playbook,
      outreach_strategy:   analysis.outreach_strategy,
      legal_research:      null,
      synthesis_model:     'gemini-2.5-pro',
      strategy_model:      strategyModelName,
      gemini_tokens:       synthData.usageMetadata?.totalTokenCount ?? null,
      claude_tokens:       strategyTokens || null,
      run_status:          'completed',
      run_duration_ms:     runDurationMs,
      triggered_by:        triggeredBy ?? null,
    }),
  }).catch(e => console.error('[nexus] analysis save failed (non-fatal):', e))

  // Prune old unpinned runs (best effort — silent on error)
  await pruneOldRuns(caseId).catch(() => {})

  // Bump case updated_at
  await fetch(`${SB_URL}/rest/v1/cases?id=eq.${caseId}`, {
    method:  'PATCH',
    headers: sbHeaders('return=minimal'),
    body:    JSON.stringify({ updated_at: new Date().toISOString() }),
  }).catch(() => {})

  return analysis

  } catch (e) {
    // Record the failure so operators can see it in the History tab
    const runDurationMs = Date.now() - runStart
    const errMsg = e instanceof Error ? e.message : String(e)
    await fetch(`${SB_URL}/rest/v1/case_analyses`, {
      method:  'POST',
      headers: sbHeaders('return=minimal'),
      body: JSON.stringify({
        case_id:        caseId,
        schema_version: 'v1',
        run_status:     'failed',
        run_duration_ms: runDurationMs,
        triggered_by:   triggeredBy ?? null,
        error_message:  errMsg.slice(0, 2000),
      }),
    }).catch(() => {})
    throw e
  }
}
