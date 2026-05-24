/**
 * RAG indexing: Drive PDFs → text extraction → chunking → embedding → Supabase pgvector
 * Called by /api/knowledge/index (POST = manual, GET cron).
 */

import { createSign } from 'crypto'
// pdf-parse: import from lib path to avoid test-file side-effect on import
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (data: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js')

const SB_URL    = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent'

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

function b64url(input: string | Buffer): string {
  const b64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64')
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getDriveToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const creds = JSON.parse(raw)
  const now   = Math.floor(Date.now() / 1000)
  const hdr   = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const pay   = b64url(JSON.stringify({
    iss: creds.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const unsigned = `${hdr}.${pay}`
  const signer   = createSign('RSA-SHA256')
  signer.update(unsigned)
  const jwt = `${unsigned}.${b64url(signer.sign(creds.private_key))}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Drive auth failed: ${JSON.stringify(data)}`)
  return data.access_token
}

type DriveFileMeta = { id: string; name: string; mimeType: string; modifiedTime: string }

async function listDriveFiles(token: string, folderId: string): Promise<DriveFileMeta[]> {
  const q   = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const res = await fetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)&pageSize=100&orderBy=name`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  return Array.isArray(data.files) ? data.files : []
}

async function downloadPdf(token: string, fileId: string): Promise<Buffer> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return Buffer.from(await res.arrayBuffer())
}

// Split text into overlapping chunks of ~chunkSize chars
function chunkText(text: string, chunkSize = 1500, overlap = 150): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const chunks: string[] = []
  let start = 0
  while (start < cleaned.length) {
    const end   = Math.min(start + chunkSize, cleaned.length)
    const chunk = cleaned.slice(start, end).trim()
    if (chunk.length > 80) chunks.push(chunk)
    if (end === cleaned.length) break
    start += chunkSize - overlap
  }
  return chunks
}

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(`${EMBED_URL}?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:   'models/text-embedding-004',
      content: { parts: [{ text: text.slice(0, 8000) }] }, // embedding model input cap
    }),
  })
  const data = await res.json()
  return data.embedding?.values ?? []
}


async function deleteChunksForFile(fileId: string) {
  await fetch(`${SB_URL}/rest/v1/knowledge_chunks?file_id=eq.${encodeURIComponent(fileId)}`, {
    method:  'DELETE',
    headers: sbHeaders(),
  })
}

async function storeChunks(
  fileId: string, fileName: string,
  chunks: string[], embeddings: number[][]
) {
  const rows = chunks.map((content, i) => ({
    file_id:     fileId,
    file_name:   fileName,
    chunk_index: i,
    content,
    embedding:   `[${embeddings[i].join(',')}]`,
    char_count:  content.length,
  }))
  const res = await fetch(
    `${SB_URL}/rest/v1/knowledge_chunks?on_conflict=file_id,chunk_index`,
    {
      method:  'POST',
      headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
      body:    JSON.stringify(rows),
    }
  )
  if (!res.ok) throw new Error(`Chunk insert failed: ${await res.text()}`)
}

export type IndexResult = {
  indexed: string[]
  skipped: string[]
  deleted: string[]
  errors:  string[]
  totalChunks: number
}

export async function runRagIndex(force = false): Promise<IndexResult> {
  const apiKey   = process.env.GEMINI_API_KEY_DRAFT_EMAIL
  const folderId = process.env.GOOGLE_DRIVE_KNOWLEDGE_FOLDER_ID
  if (!apiKey)   throw new Error('GEMINI_API_KEY_DRAFT_EMAIL not set')
  if (!folderId) throw new Error('GOOGLE_DRIVE_KNOWLEDGE_FOLDER_ID not set')

  const result: IndexResult = { indexed: [], skipped: [], deleted: [], errors: [], totalChunks: 0 }
  const driveToken = await getDriveToken()
  const driveFiles = await listDriveFiles(driveToken, folderId)

  const driveIds = new Set(driveFiles.map(f => f.id))

  // Delete chunks for files that no longer exist in Drive
  const existingRes = await fetch(
    `${SB_URL}/rest/v1/knowledge_chunks?select=file_id,file_name&order=file_id.asc`,
    { headers: sbHeaders() }
  )
  const existingRows: { file_id: string; file_name: string }[] = existingRes.ok ? await existingRes.json() : []
  const existingFileIds = new Set((existingRows as { file_id: string }[]).map(r => r.file_id))
  for (const id of Array.from(existingFileIds)) {
    if (!driveIds.has(id)) {
      const name = (existingRows as { file_id: string; file_name: string }[]).find(r => r.file_id === id)?.file_name ?? id
      await deleteChunksForFile(id)
      result.deleted.push(name)
    }
  }

  // Index each Drive file
  const pdfs = driveFiles.filter(f => f.mimeType === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
  for (const file of pdfs) {
    try {
      if (!force && existingFileIds.has(file.id)) {
        // Already indexed — skip (modifiedTime comparison could be added for smarter updates)
        result.skipped.push(file.name)
        continue
      }

      // Download + extract text
      const pdf    = await downloadPdf(driveToken, file.id)
      const parsed = await pdfParse(pdf)
      const text   = parsed.text?.trim() ?? ''
      if (text.length < 50) {
        result.errors.push(`${file.name}: extracted text too short (may be scanned image PDF)`)
        continue
      }

      // Chunk
      const chunks = chunkText(text)
      if (chunks.length === 0) { result.errors.push(`${file.name}: no chunks after splitting`); continue }

      // Embed each chunk (sequential to avoid rate limits)
      const embeddings: number[][] = []
      for (const chunk of chunks) {
        const emb = await embedText(chunk, apiKey)
        if (emb.length === 0) throw new Error('Empty embedding returned')
        embeddings.push(emb)
      }

      // Delete old chunks for this file then store new ones
      if (existingFileIds.has(file.id)) await deleteChunksForFile(file.id)
      await storeChunks(file.id, file.name, chunks, embeddings)

      result.indexed.push(file.name)
      result.totalChunks += chunks.length
      console.log(`[rag-index] indexed ${file.name}: ${chunks.length} chunks`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result.errors.push(`${file.name}: ${msg}`)
      console.error(`[rag-index] error on ${file.name}:`, msg)
    }
  }

  return result
}

// Returns current index status (for the analytics page)
export async function getRagIndexStatus(): Promise<{
  files: { file_id: string; file_name: string; chunk_count: number; last_indexed: string }[]
  totalChunks: number
}> {
  const res = await fetch(
    `${SB_URL}/rest/v1/knowledge_chunks?select=file_id,file_name,created_at&order=file_id.asc`,
    { headers: sbHeaders() }
  )
  const rows: { file_id: string; file_name: string; created_at: string }[] = res.ok ? await res.json() : []

  const map = new Map<string, { file_name: string; count: number; last: string }>()
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const existing = map.get(r.file_id)
    if (!existing) {
      map.set(r.file_id, { file_name: r.file_name, count: 1, last: r.created_at })
    } else {
      existing.count++
      if (r.created_at > existing.last) existing.last = r.created_at
    }
  }

  const files = Array.from(map.entries()).map(([file_id, v]) => ({
    file_id,
    file_name:   v.file_name,
    chunk_count: v.count,
    last_indexed: v.last,
  }))

  return { files, totalChunks: rows.length }
}
