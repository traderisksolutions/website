/**
 * RAG indexing: Drive PDFs → text extraction → chunking → embedding → Supabase pgvector
 * Called by /api/knowledge/index (POST = manual, GET cron).
 */

import { createSign }       from 'crypto'
import { logEmbeddingUsage } from '@/lib/gemini-usage'

const SB_URL    = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent'

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

function b64url(input: string | Buffer): string {
  const b64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64')
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getDriveToken(serviceAccountJson?: string): Promise<string> {
  const raw = serviceAccountJson ?? process.env.GOOGLE_SERVICE_ACCOUNT_JSON
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
// driveToken is carried per-file so each file is downloaded with the correct service account
type DriveFileWithFolder = DriveFileMeta & { source_folder: string; driveToken: string }

async function listDriveFiles(token: string, folderId: string): Promise<DriveFileMeta[]> {
  const q   = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const res = await fetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)&pageSize=100&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json() as { files?: DriveFileMeta[]; error?: { message?: string } }
  if (!res.ok) {
    throw new Error(`Drive API ${res.status} (folder: ${folderId}): ${data.error?.message ?? JSON.stringify(data).slice(0, 200)}`)
  }
  return Array.isArray(data.files) ? data.files : []
}

// Recurse one level into subfolders. Files in root get source_folder='root'.
// Files in a subfolder get source_folder=<subfolder name> (e.g. 'ai-outbound', 'engagement_ai_agent').
async function listDriveFilesWithFolders(token: string, rootFolderId: string): Promise<DriveFileWithFolder[]> {
  const rootItems = await listDriveFiles(token, rootFolderId)
  const subfolders = rootItems.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
  const rootFiles  = rootItems.filter(f => f.mimeType !== 'application/vnd.google-apps.folder')

  const result: DriveFileWithFolder[] = rootFiles.map(f => ({ ...f, source_folder: 'root', driveToken: token }))

  for (const sub of subfolders) {
    const subFiles = await listDriveFiles(token, sub.id)
    result.push(...subFiles.map(f => ({ ...f, source_folder: sub.name, driveToken: token })))
  }

  return result
}

async function downloadFile(token: string, fileId: string): Promise<Buffer> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return Buffer.from(await res.arrayBuffer())
}

// Export Google Doc / Sheet / Slide as plain text
async function exportGoogleDoc(token: string, fileId: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.text()
}

function isSupportedFile(f: DriveFileMeta): boolean {
  const name = f.name.toLowerCase()
  return (
    f.mimeType === 'application/pdf' ||
    f.mimeType === 'text/plain' ||
    f.mimeType === 'application/vnd.google-apps.document' ||
    name.endsWith('.pdf') ||
    name.endsWith('.txt') ||
    name.endsWith('.md')
  )
}

async function extractText(token: string, file: DriveFileMeta): Promise<string> {
  if (file.mimeType === 'application/vnd.google-apps.document') {
    return exportGoogleDoc(token, file.id)
  }
  if (file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const { PDFParse } = await import('pdf-parse')
    const buf    = await downloadFile(token, file.id)
    const parser = new PDFParse({ data: buf })
    const parsed = await parser.getText()
    await parser.destroy()
    return parsed.text?.trim() ?? ''
  }
  // Plain text / markdown
  const buf = await downloadFile(token, file.id)
  return buf.toString('utf-8').trim()
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
      model:                'models/gemini-embedding-001',
      content:              { parts: [{ text: text.slice(0, 8000) }] },
      outputDimensionality: 768,
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.embedding?.values) {
    const reason = data.error?.message ?? data.error?.status ?? JSON.stringify(data).slice(0, 300)
    throw new Error(`Gemini embedding failed (${res.status}): ${reason}`)
  }
  return data.embedding.values
}


async function deleteChunksForFile(fileId: string) {
  await fetch(`${SB_URL}/rest/v1/knowledge_chunks?file_id=eq.${encodeURIComponent(fileId)}`, {
    method:  'DELETE',
    headers: sbHeaders(),
  })
}

async function storeChunks(
  fileId: string, fileName: string, sourceFolder: string,
  chunks: string[], embeddings: number[][]
) {
  const rows = chunks.map((content, i) => ({
    file_id:       fileId,
    file_name:     fileName,
    source_folder: sourceFolder,
    chunk_index:   i,
    content,
    embedding:     `[${embeddings[i].join(',')}]`,
    char_count:    content.length,
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

export async function runRagIndex(force = false, folderFilter?: string): Promise<IndexResult> {
  const apiKey   = process.env.GEMINI_API_KEY_DRAFT_EMAIL
  const embedKey = process.env.GEMINI_VECTOR_UPLOAD ?? apiKey
  if (!apiKey)   throw new Error('GEMINI_API_KEY_DRAFT_EMAIL not set')
  if (!embedKey) throw new Error('GEMINI_VECTOR_UPLOAD not set')

  const result: IndexResult = { indexed: [], skipped: [], deleted: [], errors: [], totalChunks: 0 }
  let totalCharsEmbedded = 0

  // Three separate service accounts:
  //   GOOGLE_SERVICE_ACCOUNT_JSON      → engagement_ai_agent/ folder
  //   GOOGLE_SERVICE_ACC_OUTBOUND_JSON → ai-outbound/ folder
  //   GOOGLE_SERVICE_ACC_INBOUND_JSON  → inbound_ai_agent/ folder
  const engagementToken = await getDriveToken(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const outboundToken   = process.env.GOOGLE_SERVICE_ACC_OUTBOUND_JSON
    ? await getDriveToken(process.env.GOOGLE_SERVICE_ACC_OUTBOUND_JSON)
    : engagementToken
  const inboundToken    = process.env.GOOGLE_SERVICE_ACC_INBOUND_JSON
    ? await getDriveToken(process.env.GOOGLE_SERVICE_ACC_INBOUND_JSON)
    : engagementToken

  // When specific folder IDs are configured, skip the legacy root scan entirely.
  // The root scan causes a dedup collision when GOOGLE_DRIVE_KNOWLEDGE_FOLDER_ID
  // happens to be the same as one of the specific folders.
  const allDriveFiles: DriveFileWithFolder[] = []
  const rootFolderId = process.env.GOOGLE_DRIVE_KNOWLEDGE_FOLDER_ID
  const hasSpecificFolders = !!(
    process.env.GOOGLE_DRIVE_OUTBOUND_FOLDER_ID ||
    process.env.GOOGLE_DRIVE_ENGAGEMENT_FOLDER_ID ||
    process.env.GDRIVE_FAQ_FOLDER_ID
  )
  if (rootFolderId && !hasSpecificFolders) {
    const rootFiles = await listDriveFilesWithFolders(engagementToken, rootFolderId)
    allDriveFiles.push(...rootFiles)
  }

  // Scan each configured folder with its own service account — explicit tag always wins
  const extraFolders: [string | undefined, string, string][] = [
    [process.env.GOOGLE_DRIVE_OUTBOUND_FOLDER_ID,   'ai-outbound',         outboundToken],
    [process.env.GOOGLE_DRIVE_ENGAGEMENT_FOLDER_ID, 'engagement_ai_agent', engagementToken],
    [process.env.GDRIVE_FAQ_FOLDER_ID,    'inbound_ai_agent',    inboundToken],
  ]
  const failedFolderTags = new Set<string>()
  for (const [extraId, tag, token] of extraFolders) {
    if (!extraId) continue
    try {
      const extraFiles = await listDriveFiles(token, extraId)
      for (const f of extraFiles) {
        // Always apply the explicit tag — overrides any 'root' entry from root scan
        const existing = allDriveFiles.findIndex(x => x.id === f.id)
        if (existing >= 0) {
          allDriveFiles[existing] = { ...allDriveFiles[existing], source_folder: tag, driveToken: token }
        } else {
          allDriveFiles.push({ ...f, source_folder: tag, driveToken: token })
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result.errors.push(`[${tag}] Drive scan failed: ${msg}`)
      failedFolderTags.add(tag)
    }
  }

  const driveFiles = folderFilter
    ? allDriveFiles.filter(f => f.source_folder === folderFilter)
    : allDriveFiles
  const driveIds = new Set(driveFiles.map(f => f.id))

  // Scope deletion check to the same folder so we don't touch the other folder's chunks
  const folderParam = folderFilter ? `&source_folder=eq.${encodeURIComponent(folderFilter)}` : ''
  const existingRes = await fetch(
    `${SB_URL}/rest/v1/knowledge_chunks?select=file_id,file_name&order=file_id.asc${folderParam}`,
    { headers: sbHeaders() }
  )
  const existingRows: { file_id: string; file_name: string }[] = existingRes.ok ? await existingRes.json() : []
  const existingFileIds = new Set((existingRows as { file_id: string }[]).map(r => r.file_id))

  // Safety guard: if Drive scan returned 0 files but DB has indexed entries, the scan likely
  // failed silently. Abort rather than delete valid data.
  if (driveFiles.length === 0 && existingFileIds.size > 0) {
    if (result.errors.length === 0) {
      result.errors.push(
        `Drive scan returned 0 files but DB has ${existingFileIds.size} indexed. ` +
        `Aborting to prevent data loss — verify Drive folder access and sharing permissions.`
      )
    }
    return result
  }

  for (const id of Array.from(existingFileIds)) {
    if (!driveIds.has(id)) {
      const name = (existingRows as { file_id: string; file_name: string }[]).find(r => r.file_id === id)?.file_name ?? id
      await deleteChunksForFile(id)
      result.deleted.push(name)
    }
  }

  // Index each supported Drive file (PDF, TXT, MD, Google Docs) — preserving source_folder
  const supported = driveFiles.filter(isSupportedFile)
  for (const file of supported) {
    try {
      if (!force && existingFileIds.has(file.id)) {
        result.skipped.push(file.name)
        continue
      }

      const text = await extractText(file.driveToken, file)
      if (text.length < 50) {
        result.errors.push(`${file.name}: extracted text too short`)
        continue
      }

      // Chunk
      const chunks = chunkText(text)
      if (chunks.length === 0) { result.errors.push(`${file.name}: no chunks after splitting`); continue }

      // Embed each chunk (sequential to avoid rate limits)
      const embeddings: number[][] = []
      for (const chunk of chunks) {
        const emb = await embedText(chunk, embedKey)
        if (emb.length === 0) throw new Error('Empty embedding returned')
        embeddings.push(emb)
        totalCharsEmbedded += chunk.length
      }

      // Delete old chunks for this file then store new ones
      if (existingFileIds.has(file.id)) await deleteChunksForFile(file.id)
      await storeChunks(file.id, file.name, file.source_folder, chunks, embeddings)

      result.indexed.push(file.source_folder !== 'root' ? `${file.source_folder}/${file.name}` : file.name)
      result.totalChunks += chunks.length
      console.log(`[rag-index] indexed ${file.source_folder}/${file.name}: ${chunks.length} chunks`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result.errors.push(`${file.name}: ${msg}`)
      console.error(`[rag-index] error on ${file.name}:`, msg)
    }
  }

  if (totalCharsEmbedded > 0) {
    void logEmbeddingUsage(totalCharsEmbedded, result.indexed.length)
  }

  return result
}

// Returns current index status (for the analytics page)
function driveUrl(folderId: string | undefined): string | null {
  return folderId ? `https://drive.google.com/drive/folders/${folderId}` : null
}

export async function getRagIndexStatus(): Promise<{
  files:      { file_id: string; file_name: string; source_folder: string; chunk_count: number; last_indexed: string }[]
  totalChunks: number
  folderUrls:  Record<string, string>
}> {
  const res = await fetch(
    `${SB_URL}/rest/v1/knowledge_chunks?select=file_id,file_name,source_folder,created_at&order=file_id.asc`,
    { headers: sbHeaders() }
  )
  const rows: { file_id: string; file_name: string; source_folder: string | null; created_at: string }[] = res.ok ? await res.json() : []

  const map = new Map<string, { file_name: string; source_folder: string; count: number; last: string }>()
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const existing = map.get(r.file_id)
    if (!existing) {
      map.set(r.file_id, { file_name: r.file_name, source_folder: r.source_folder ?? 'root', count: 1, last: r.created_at })
    } else {
      existing.count++
      if (r.created_at > existing.last) existing.last = r.created_at
    }
  }

  const files = Array.from(map.entries()).map(([file_id, v]) => ({
    file_id,
    file_name:     v.file_name,
    source_folder: v.source_folder,
    chunk_count:   v.count,
    last_indexed:  v.last,
  }))

  // Build Drive URLs from server-side env vars — keyed by source_folder name
  const folderUrls: Record<string, string> = {}
  const pairs: [string | undefined, string][] = [
    [process.env.GOOGLE_DRIVE_OUTBOUND_FOLDER_ID,   'ai-outbound'],
    [process.env.GOOGLE_DRIVE_ENGAGEMENT_FOLDER_ID, 'engagement_ai_agent'],
    [process.env.GDRIVE_FAQ_FOLDER_ID,    'inbound_ai_agent'],
    [process.env.GOOGLE_DRIVE_KNOWLEDGE_FOLDER_ID,  'root'],
  ]
  for (const [id, key] of pairs) {
    const url = driveUrl(id)
    if (url) folderUrls[key] = url
  }

  return { files, totalChunks: rows.length, folderUrls }
}
