/**
 * POST /api/nexus/attachments/extract
 *
 * Siloed attachment extraction — called fire-and-forget from email ingest.
 * NEVER throws to its caller. NEVER affects the engagement flow.
 * Always returns 200.
 *
 * Body: { message_id: string, thread_id: string, gmail_message_id: string }
 *
 * For each attachment found:
 *   - PDFs / images  → download from Gmail → store binary in Supabase Storage
 *   - Images         → also run Gemini Vision for description → stored in parsed_text
 *   - DOCX           → extract text via mammoth → parsed_text
 *   - XLSX           → extract as CSV table → parsed_text
 *
 * At Nexus analysis time, run-nexus-analysis.ts reads from email_attachments
 * instead of re-fetching from Gmail API.
 */

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

const SB_URL          = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const STORAGE_BUCKET  = 'email-attachments'
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API       = 'https://gmail.googleapis.com/gmail/v1/users/me'
const GEMINI_FLASH    = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const MAX_BYTES = 20_000_000 // 20 MB hard cap per attachment

// ── Supabase helpers ──────────────────────────────────────────────────────────

function sbKey() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return k
}

function sbHeaders(prefer = 'return=minimal') {
  const k = sbKey()
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

function storageAuthHeaders() {
  const k = sbKey()
  return { apikey: k, Authorization: `Bearer ${k}` }
}

// ── Supabase Storage ──────────────────────────────────────────────────────────

async function ensureBucket(): Promise<void> {
  // Best-effort — 400 means it already exists, which is fine
  await fetch(`${SB_URL}/storage/v1/bucket`, {
    method:  'POST',
    headers: { ...storageAuthHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id: STORAGE_BUCKET, name: STORAGE_BUCKET, public: false }),
  }).catch(() => {})
}

async function uploadToStorage(path: string, data: Buffer, mimeType: string): Promise<string | null> {
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method:  'POST',
      headers: { ...storageAuthHeaders(), 'Content-Type': mimeType, 'x-upsert': 'true' },
      body:    new Uint8Array(data),
    })
    return res.ok ? path : null
  } catch { return null }
}

// ── Gmail helpers ─────────────────────────────────────────────────────────────

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
    const d = await res.json()
    return d.access_token ?? null
  } catch { return null }
}

async function downloadFromGmail(token: string, gmailMsgId: string, attachmentId: string): Promise<Buffer | null> {
  try {
    const res = await fetch(
      `${GMAIL_API}/messages/${gmailMsgId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const d = await res.json()
    if (!d?.data) return null
    const b64 = (d.data as string).replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(b64, 'base64')
  } catch { return null }
}

// ── MIME part walker ──────────────────────────────────────────────────────────

type AttachmentPart = {
  filename:     string
  mimeType:     string
  attachmentId: string
  size:         number
}

function collectAttachmentParts(payload: unknown, results: AttachmentPart[] = []): AttachmentPart[] {
  if (!payload || typeof payload !== 'object') return results
  const p = payload as Record<string, unknown>

  if (
    p.filename && typeof p.filename === 'string' && p.filename.length > 0 &&
    p.mimeType && p.mimeType !== 'message/rfc822' &&
    p.body && typeof p.body === 'object' &&
    (p.body as Record<string, unknown>).attachmentId
  ) {
    const body = p.body as Record<string, unknown>
    results.push({
      filename:     p.filename,
      mimeType:     p.mimeType as string,
      attachmentId: body.attachmentId as string,
      size:         (body.size as number) ?? 0,
    })
  }

  if (Array.isArray(p.parts)) {
    for (const child of p.parts) collectAttachmentParts(child, results)
  }

  return results
}

// ── Gemini Vision description for images ─────────────────────────────────────

async function describeImage(data: Buffer, mimeType: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(`${GEMINI_FLASH}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data:      data.toString('base64'),
              },
            },
            {
              text: `You are reviewing an image for an insurance brokerage in Singapore (Trade Risk Solutions).

Describe this image thoroughly for an AI insurance analyst who cannot view it directly. Focus on:
1. Type of document or photograph
2. Any visible damage, conditions, or items relevant to an insurance claim
3. Any visible text, dates, reference numbers, amounts, policy numbers, or party names
4. Location, scale, severity if this is a damage or incident photo
5. Overall assessment for claim relevance

Be specific. Use factual, professional language. Return plain text only.`,
            },
          ],
        }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
      }),
    })
    const d = await res.json()
    return d?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  } catch { return '' }
}

// ── Filename sanitiser ────────────────────────────────────────────────────────

function sanitise(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 200)
}

// ── Per-attachment processor ──────────────────────────────────────────────────

async function processAttachment(
  part:       AttachmentPart,
  messageId:  string,
  threadId:   string,
  gmailMsgId: string,
  token:      string,
  apiKey:     string,
): Promise<void> {
  const { filename, mimeType, attachmentId, size } = part

  if (size > MAX_BYTES) {
    console.log(`[nexus/extract] skip ${filename} — too large (${Math.round(size / 1024 / 1024)}MB)`)
    await upsertAttachmentRow({
      message_id:          messageId,
      thread_id:           threadId,
      gmail_attachment_id: attachmentId,
      filename,
      mime_type:           mimeType,
      size_bytes:          size,
      parsed_text:         `[File too large to process: ${Math.round(size / 1024 / 1024)}MB — manual review needed]`,
    })
    return
  }

  const data = await downloadFromGmail(token, gmailMsgId, attachmentId)
  if (!data) {
    console.warn(`[nexus/extract] failed to download ${filename}`)
    return
  }

  const mime         = mimeType.toLowerCase()
  const storagePath  = `${threadId}/${messageId}/${sanitise(filename)}`
  let storageUrl:   string | null = null
  let parsedText:   string | null = null

  // ── PDF: store binary + let Nexus re-upload to Gemini at analysis time ───
  if (mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
    storageUrl = await uploadToStorage(storagePath, data, 'application/pdf')
    console.log(`[nexus/extract] PDF stored: ${filename} → ${storageUrl ?? 'FAILED'}`)
  }

  // ── Images: store binary + AI description ────────────────────────────────
  else if (mime.startsWith('image/')) {
    storageUrl = await uploadToStorage(storagePath, data, mimeType)
    parsedText = await describeImage(data, mimeType, apiKey)
    console.log(`[nexus/extract] image stored + described: ${filename}`)
  }

  // ── DOCX: extract text ───────────────────────────────────────────────────
  else if (mime.includes('wordprocessingml') || mime.includes('msword') || filename.endsWith('.docx')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth') as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> } | null
      if (mammoth) {
        const r = await mammoth.extractRawText({ buffer: data })
        parsedText = r.value?.slice(0, 30000) ?? null
      }
    } catch {
      parsedText = '[DOCX — install mammoth package to extract text]'
    }
    console.log(`[nexus/extract] DOCX extracted: ${filename} (${parsedText?.length ?? 0} chars)`)
  }

  // ── XLSX: extract as CSV table ───────────────────────────────────────────
  else if (mime.includes('spreadsheetml') || mime.includes('excel') || filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const xlsx = require('xlsx') as {
        read: (d: Buffer, o: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> }
        utils: { sheet_to_csv: (s: unknown) => string }
      } | null
      if (xlsx) {
        const wb     = xlsx.read(data, { type: 'buffer' })
        const sheets = wb.SheetNames.map((name: string) =>
          `Sheet: ${name}\n${xlsx.utils.sheet_to_csv(wb.Sheets[name]).slice(0, 10000)}`
        )
        parsedText = sheets.join('\n\n').slice(0, 30000)
      }
    } catch {
      parsedText = '[XLSX — install xlsx package to extract table data]'
    }
    console.log(`[nexus/extract] XLSX extracted: ${filename}`)
  }

  // ── Other types: store binary if small enough, skip otherwise ────────────
  else {
    console.log(`[nexus/extract] skipping unsupported type: ${mimeType} (${filename})`)
    return
  }

  await upsertAttachmentRow({
    message_id:          messageId,
    thread_id:           threadId,
    gmail_attachment_id: attachmentId,
    filename,
    mime_type:           mimeType,
    size_bytes:          size,
    parsed_text:         parsedText,
    storage_url:         storageUrl,
    parsed_at:           new Date().toISOString(),
  })
}

async function upsertAttachmentRow(row: Record<string, unknown>): Promise<void> {
  const res = await fetch(
    `${SB_URL}/rest/v1/email_attachments?on_conflict=message_id,filename`,
    {
      method:  'POST',
      headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
      body:    JSON.stringify(row),
    }
  )
  if (!res.ok) console.error('[nexus/extract] DB upsert failed:', await res.text().catch(() => ''))
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Always return 200 — this is fire-and-forget, caller must not be affected by failures
  try {
    // Guard: internal calls only
    const secret = req.headers.get('x-internal-secret')
    if (secret !== (process.env.CRON_SECRET ?? '')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { message_id, thread_id, gmail_message_id } = body as {
      message_id?: string; thread_id?: string; gmail_message_id?: string
    }

    if (!message_id || !thread_id || !gmail_message_id) {
      return NextResponse.json({ ok: true, skipped: 'missing fields' })
    }

    const apiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!apiKey) {
      console.warn('[nexus/extract] GEMINI_API_KEY_DRAFT_EMAIL not set — skipping image descriptions')
    }

    // Idempotency: skip if already extracted for this message
    const existing = await fetch(
      `${SB_URL}/rest/v1/email_attachments?message_id=eq.${message_id}&select=id&limit=1`,
      { headers: sbHeaders() }
    ).then(r => r.ok ? r.json() : []).catch(() => [])

    if (Array.isArray(existing) && existing.length > 0) {
      console.log(`[nexus/extract] already extracted for message ${message_id} — skipping`)
      return NextResponse.json({ ok: true, skipped: 'already_extracted' })
    }

    // Ensure storage bucket exists
    await ensureBucket()

    // Get Gmail token
    const token = await getGmailToken()
    if (!token) {
      console.warn('[nexus/extract] Gmail token unavailable — cannot extract attachments')
      return NextResponse.json({ ok: true, skipped: 'no_gmail_token' })
    }

    // Fetch full Gmail message to walk MIME parts
    const msgRes = await fetch(
      `${GMAIL_API}/messages/${gmail_message_id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!msgRes.ok) {
      console.warn('[nexus/extract] Gmail message fetch failed:', msgRes.status)
      return NextResponse.json({ ok: true, skipped: 'gmail_fetch_failed' })
    }
    const gmailMsg = await msgRes.json()

    const parts = collectAttachmentParts(gmailMsg.payload)
    console.log(`[nexus/extract] message ${gmail_message_id} has ${parts.length} attachment(s)`)

    // Process each attachment independently — one failure must not stop others
    await Promise.allSettled(
      parts.map(part =>
        processAttachment(part, message_id, thread_id, gmail_message_id, token, apiKey ?? '')
          .catch(e => console.warn(`[nexus/extract] ${part.filename} failed (non-fatal):`, e instanceof Error ? e.message : e))
      )
    )

    return NextResponse.json({ ok: true, processed: parts.length })
  } catch (e) {
    // Catch-all: log and return 200 so ingest's waitUntil does not surface errors
    console.error('[nexus/extract] top-level error (non-fatal):', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: true, error: String(e) })
  }
}
