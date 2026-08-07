/**
 * Microsoft Graph / OneDrive — delegated OAuth (refresh token stored on employee_profiles, see
 * api/auth/onedrive/connect|callback) for the historical debit-note bulk import. Raw fetch calls
 * throughout, no SDK — matches how every other external API (Anthropic, Gemini, Google) is called
 * in this codebase.
 */
import { SB_URL, sbH } from '@/lib/debit-note-storage'

/** refresh_token -> access_token, mirroring the Gmail send route's token-refresh call exactly. */
export async function getOnedriveAccessToken(userId: string): Promise<string> {
  const res = await fetch(`${SB_URL}/rest/v1/employee_profiles?user_id=eq.${userId}&select=onedrive_refresh_token&limit=1`, { headers: sbH(), cache: 'no-store' })
  const profile = res.ok ? (await res.json())[0] ?? null : null
  const refreshToken = profile?.onedrive_refresh_token as string | undefined
  if (!refreshToken) throw new Error('OneDrive not connected — connect it first (Historical Debit Note page).')

  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common'
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken, grant_type: 'refresh_token', scope: 'offline_access Files.Read.All User.Read',
    }),
  })
  const tokenData = await tokenRes.json() as { access_token?: string }
  if (!tokenData.access_token) throw new Error('OneDrive connection expired — reconnect it (Historical Debit Note page).')
  return tokenData.access_token
}

type GraphItem = {
  name: string
  folder?: { childCount: number }
  '@microsoft.graph.downloadUrl'?: string
}

/** Each URL path segment must be individually encoded (not the whole path via encodeURI, which
 *  leaves `?`/`#`/`&` unescaped — meaningful delimiters that would break Graph's colon-path
 *  syntax if a folder name happened to contain one). */
const encodePath = (path: string) => path.split('/').filter(Boolean).map(encodeURIComponent).join('/')

async function listChildren(accessToken: string, path: string): Promise<GraphItem[]> {
  const items: GraphItem[] = []
  let url = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodePath(path)}:/children?$top=200`
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`OneDrive list failed for "${path}": ${(await res.text()).slice(0, 300)}`)
    const data = await res.json() as { value: GraphItem[]; '@odata.nextLink'?: string }
    items.push(...data.value)
    url = data['@odata.nextLink'] ?? ''
  }
  return items
}

export type OnedriveFile = { folder: string; name: string; downloadUrl: string }

/** Every FILE under a OneDrive folder, recursively, tagged with the path of its immediate parent
 *  folder — used to group files into one bundle per subfolder, the natural equivalent of "one
 *  .zip per event" in the existing manual-upload flow (see imports/onedrive/route.ts). */
export async function listOnedriveFolderRecursive(accessToken: string, rootPath: string): Promise<OnedriveFile[]> {
  const out: OnedriveFile[] = []
  async function walk(path: string) {
    for (const item of await listChildren(accessToken, path)) {
      if (item.folder) await walk(`${path}/${item.name}`)
      else if (item['@microsoft.graph.downloadUrl']) out.push({ folder: path, name: item.name, downloadUrl: item['@microsoft.graph.downloadUrl'] })
    }
  }
  await walk(rootPath.replace(/^\/+|\/+$/g, ''))
  return out
}

export async function downloadOnedriveFile(downloadUrl: string): Promise<Buffer> {
  const res = await fetch(downloadUrl)
  if (!res.ok) throw new Error(`OneDrive download failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
