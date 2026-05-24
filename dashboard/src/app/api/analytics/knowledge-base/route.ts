import { NextResponse }  from 'next/server'
import { createSign }    from 'crypto'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

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
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Drive auth failed: ${JSON.stringify(data)}`)
  return data.access_token
}

// Rough token estimate from raw file size.
// PDFs: ~2.5% of bytes are usable text → 1 token ≈ 4 bytes → 0.025 tokens/byte
// Google Docs / text: ~25% efficiency → 0.25 tokens/byte
function estimateTokens(mimeType: string, bytes: number): number {
  if (mimeType === 'application/pdf') return Math.round(bytes * 0.025)
  if (mimeType === 'application/vnd.google-apps.document') return Math.round(bytes * 0.25)
  if (mimeType.startsWith('text/')) return Math.round(bytes * 0.25)
  return Math.round(bytes * 0.05)
}

export type KnowledgeFile = {
  id:             string
  name:           string
  mimeType:       string
  sizeBytes:      number
  estimatedTokens: number
  modifiedTime:   string
}

export type KnowledgeBaseStats = {
  files:              KnowledgeFile[]
  totalFiles:         number
  totalSizeBytes:     number
  totalTokens:        number
  lastModified:       string | null
  contextWindowLimit: number
  folderId:           string
}

// GET /api/analytics/knowledge-base
export async function GET() {
  try {
    const folderId = process.env.GOOGLE_DRIVE_KNOWLEDGE_FOLDER_ID
    if (!folderId) return NextResponse.json({ error: 'GOOGLE_DRIVE_KNOWLEDGE_FOLDER_ID not set' }, { status: 500 })

    const token = await getServiceAccountToken()

    // Fetch up to 100 files with metadata (size, modifiedTime)
    const q   = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
    const res = await fetch(
      `${DRIVE_API}/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=100&orderBy=modifiedTime%20desc`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }

    const data = await res.json()
    const raw: { id: string; name: string; mimeType: string; size?: string; modifiedTime: string }[] =
      Array.isArray(data.files) ? data.files : []

    const files: KnowledgeFile[] = raw.map(f => {
      const sizeBytes = f.size ? parseInt(f.size, 10) : 0
      return {
        id:              f.id,
        name:            f.name,
        mimeType:        f.mimeType,
        sizeBytes,
        estimatedTokens: estimateTokens(f.mimeType, sizeBytes),
        modifiedTime:    f.modifiedTime,
      }
    })

    const totalSizeBytes = files.reduce((s, f) => s + f.sizeBytes, 0)
    const totalTokens    = files.reduce((s, f) => s + f.estimatedTokens, 0)
    const lastModified   = files[0]?.modifiedTime ?? null

    const stats: KnowledgeBaseStats = {
      files,
      totalFiles:         files.length,
      totalSizeBytes,
      totalTokens,
      lastModified,
      contextWindowLimit: 1_048_576, // Gemini 2.5 Flash input limit
      folderId,
    }

    return NextResponse.json(stats)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
