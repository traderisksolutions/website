/**
 * Shared Google Drive → Gemini knowledge doc fetcher.
 * Used by both the GDrive draft route and auto-summarize.
 * Downloads topic-relevant PDFs from the knowledge folder and uploads
 * them to Gemini's file API so they can be passed as file_data parts.
 */

import { createSign } from 'crypto'

const GEMINI_UPLOAD = 'https://generativelanguage.googleapis.com/upload/v1beta/files'
const DRIVE_API     = 'https://www.googleapis.com/drive/v3'

const TOPIC_KEYWORDS = [
  'construction', 'marine', 'cargo', 'benefits', 'employee',
  'fire', 'property', 'liability', 'motor', 'travel',
  'engineering', 'hull', 'general', 'professional', 'cyber',
  'directors', 'officers', 'trade', 'credit', 'product',
]

function b64url(input: string | Buffer): string {
  const b64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64')
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getServiceAccountToken(): Promise<string> {
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

async function listDriveFiles(token: string, folderId: string): Promise<DriveFile[]> {
  const q   = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name,mimeType)&pageSize=50`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return Array.isArray(data.files) ? data.files : []
}

async function downloadDriveFile(token: string, fileId: string): Promise<Buffer> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return Buffer.from(await res.arrayBuffer())
}

async function uploadToGemini(pdf: Buffer, filename: string, apiKey: string): Promise<string | null> {
  const boundary = `trs_${Date.now()}`
  const meta     = JSON.stringify({ display_name: filename })
  const body     = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`),
    Buffer.from(meta),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    pdf,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const res  = await fetch(`${GEMINI_UPLOAD}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'X-Goog-Upload-Protocol': 'multipart',
    },
    body,
  })
  const data = await res.json()
  return data?.file?.uri ?? null
}

function scoreFile(filename: string, threadText: string): number {
  const name = filename.toLowerCase()
  const text = threadText.toLowerCase()
  return TOPIC_KEYWORDS.filter(k => name.includes(k) && text.includes(k)).length
}

/**
 * Fetch up to 4 topic-relevant PDFs from the Drive knowledge folder,
 * upload them to Gemini's file API, and return their URIs.
 * Falls back to the top 2 files by name if no keyword match found.
 * Returns [] silently on any error so callers can proceed without docs.
 */
export async function fetchKnowledgeDocs(
  threadText: string,
  apiKey:     string,
  label =     'gdrive-knowledge',
): Promise<{ name: string; uri: string }[]> {
  const folderId = process.env.GOOGLE_DRIVE_KNOWLEDGE_FOLDER_ID ?? ''
  if (!folderId || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return []
  try {
    const token  = await getServiceAccountToken()
    const files  = await listDriveFiles(token, folderId)
    const pdfs   = files.filter(f => f.mimeType === 'application/pdf' || f.name.endsWith('.pdf'))
    if (pdfs.length === 0) return []

    const scored   = pdfs.map(f => ({ ...f, score: scoreFile(f.name, threadText) }))
                         .sort((a, b) => b.score - a.score)
    const matching = scored.filter(f => f.score > 0).slice(0, 4)
    const selected = matching.length > 0 ? matching : scored.slice(0, 2)

    const results: { name: string; uri: string }[] = []
    for (const file of selected) {
      const pdf = await downloadDriveFile(token, file.id)
      const uri = await uploadToGemini(pdf, file.name, apiKey)
      if (uri) {
        results.push({ name: file.name, uri })
        console.log(`[${label}] attached doc: ${file.name} (score: ${file.score})`)
      }
    }
    return results
  } catch (e) {
    console.error(`[${label}] Drive fetch failed (non-fatal):`, e)
    return []
  }
}
