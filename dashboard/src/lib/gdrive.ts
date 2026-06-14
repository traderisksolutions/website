// Google Drive service account auth + file read helpers.
// Requires GOOGLE_SERVICE_ACC_OUTBOUND_JSON (JSON string of the service account key file)
// and that the Drive folder is shared with the service account email.

export async function getGDriveToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACC_OUTBOUND_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACC_OUTBOUND_JSON not set')

  const sa = JSON.parse(raw) as {
    client_email: string
    private_key:  string
  }

  const header   = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const now      = Math.floor(Date.now() / 1000)
  const claimSet = b64url(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  }))

  const sigInput = `${header}.${claimSet}`
  const privKey  = await importRsaKey(sa.private_key)
  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', privKey,
    new TextEncoder().encode(sigInput)
  )
  const jwt = `${sigInput}.${b64urlBytes(new Uint8Array(sigBytes))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })
  if (!res.ok) throw new Error(`GDrive token error: ${await res.text()}`)
  const { access_token } = await res.json()
  return access_token as string
}

export type DriveFile = { id: string; name: string; modifiedTime: string; mimeType: string }

export async function listDocsInFolder(
  folderId: string, token: string
): Promise<DriveFile[]> {
  const mimes = [
    "application/vnd.google-apps.document",
    "text/plain",
    "application/pdf",
  ].map(m => `mimeType='${m}'`).join(' or ')
  const q = encodeURIComponent(`'${folderId}' in parents and (${mimes}) and trashed=false`)
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,mimeType)&pageSize=200`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Drive list error: ${await res.text()}`)
  const data = await res.json()
  return (data.files ?? []) as DriveFile[]
}

// Exports/downloads file content as plain text.
// Google Docs → export API; TXT → direct download; PDF → export as text (works for text-based PDFs).
export async function exportDocText(fileId: string, token: string, mimeType?: string): Promise<string> {
  const h = { Authorization: `Bearer ${token}` }

  if (mimeType === 'text/plain') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: h }
    )
    if (!res.ok) throw new Error(`Drive download error: ${await res.text()}`)
    return res.text()
  }

  if (mimeType === 'application/pdf') {
    // Export PDF as plain text — works reliably for text-based PDFs
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
      { headers: h }
    )
    if (res.ok) return res.text()
    // Fallback: direct download (for scanned/image PDFs this will be garbled)
    const res2 = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: h }
    )
    if (!res2.ok) throw new Error(`Drive PDF error: ${await res2.text()}`)
    return res2.text()
  }

  // Google Docs (and everything else)
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
    { headers: h }
  )
  if (!res.ok) throw new Error(`Drive export error: ${await res.text()}`)
  return res.text()
}

// Parse "[Product Type] Title" from a Google Doc filename.
// Falls back to product_type = 'General'.
const PRODUCT_TYPES = ['Business Assets', 'Business Liabilities', 'Workforce', 'API', 'General']

export function parseDocName(name: string): { productType: string; title: string } {
  const match = name.match(/^\[([^\]]+)\]\s*(.+)$/)
  if (match) {
    const candidate = match[1].trim()
    const title     = match[2].trim()
    if (PRODUCT_TYPES.includes(candidate)) return { productType: candidate, title }
  }
  return { productType: 'General', title: name.trim() }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function b64url(str: string) {
  return Buffer.from(str).toString('base64url')
}

function b64urlBytes(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64url')
}

async function importRsaKey(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const der = Buffer.from(b64, 'base64')
  return crypto.subtle.importKey(
    'pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )
}
