/**
 * Shared Google Drive → Gemini knowledge doc fetcher.
 * Used by both the GDrive draft route and auto-summarize.
 * Downloads topic-relevant PDFs from the knowledge folder and uploads
 * them to Gemini's file API so they can be passed as file_data parts.
 */

import { logError } from './error-log'
import { serviceAccountToken } from './google/auth'

const GEMINI_UPLOAD = 'https://generativelanguage.googleapis.com/upload/v1beta/files'
const DRIVE_API     = 'https://www.googleapis.com/drive/v3'

const TOPIC_KEYWORDS = [
  'construction', 'marine', 'cargo', 'benefits', 'employee',
  'fire', 'property', 'liability', 'motor', 'travel',
  'engineering', 'hull', 'general', 'professional', 'cyber',
  'directors', 'officers', 'trade', 'credit', 'product',
]

const getServiceAccountToken = () => serviceAccountToken('https://www.googleapis.com/auth/drive.readonly', 'legacy')

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
  const meta     = JSON.stringify({ file: { display_name: filename } }) // Files API: metadata nests under "file"
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
  if (!res.ok) {
    void logError({ source: 'gemini', feature: 'gdrive_knowledge_upload', statusCode: res.status, message: await res.text(), resourceType: 'file', resourceId: filename })
    return null
  }
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
