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
  id: string
  name: string
  folder?: { childCount: number }
  '@microsoft.graph.downloadUrl'?: string
}

/** Graph's documented scheme for turning any sharing link (personal OneDrive, a folder someone
 *  shared with you, or a SharePoint team-drive/document-library link) into an encoded share-id:
 *  base64 the URL, make it URL-safe, strip padding, prefix "u!". This is what lets a broker just
 *  paste a link instead of us needing a site path or drive GUID up front.
 *  https://learn.microsoft.com/en-us/graph/api/shares-get */
function encodeShareUrl(url: string): string {
  const base64 = Buffer.from(url.trim(), 'utf-8').toString('base64')
  const urlSafe = base64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
  return `u!${urlSafe}`
}

type DriveItemRef = { driveId: string; id: string }

/** Resolves a pasted OneDrive/SharePoint sharing link to the drive + folder it points at — works
 *  for a personal OneDrive folder, a folder shared with the signed-in user, or a folder inside a
 *  shared/team (SharePoint-backed) drive, without needing to know which kind it is up front. */
export async function resolveShareUrl(accessToken: string, shareUrl: string): Promise<DriveItemRef> {
  const encoded = encodeShareUrl(shareUrl)
  const res = await fetch(`https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem?$select=id,parentReference,folder`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Could not resolve that shared link: ${(await res.text()).slice(0, 300)}`)
  const item = await res.json() as { id: string; parentReference?: { driveId?: string }; folder?: unknown }
  if (!item.folder) throw new Error('That link points to a file, not a folder — share the folder itself.')
  const driveId = item.parentReference?.driveId
  if (!driveId) throw new Error('Could not determine which drive that folder belongs to.')
  return { driveId, id: item.id }
}

async function listChildrenById(accessToken: string, driveId: string, itemId: string): Promise<GraphItem[]> {
  const items: GraphItem[] = []
  let url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/children?$top=200`
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`OneDrive list failed: ${(await res.text()).slice(0, 300)}`)
    const data = await res.json() as { value: GraphItem[]; '@odata.nextLink'?: string }
    items.push(...data.value)
    url = data['@odata.nextLink'] ?? ''
  }
  return items
}

export type OnedriveFile = { folder: string; name: string; downloadUrl: string }

/** Every FILE under a shared OneDrive/SharePoint folder link, recursively, tagged with the path of
 *  its immediate parent folder (relative to the shared root) — used to group files into one bundle
 *  per subfolder, the natural equivalent of "one .zip per event" in the existing manual-upload flow
 *  (see imports/onedrive/route.ts). Navigates by item id after the initial resolve, so it works
 *  identically whether the link is a personal OneDrive folder or a shared/team-drive folder. */
export async function listOnedriveFolderRecursive(accessToken: string, shareUrl: string): Promise<OnedriveFile[]> {
  const root = await resolveShareUrl(accessToken, shareUrl)
  const out: OnedriveFile[] = []
  async function walk(driveId: string, itemId: string, path: string) {
    for (const item of await listChildrenById(accessToken, driveId, itemId)) {
      if (item.folder) await walk(driveId, item.id, path ? `${path}/${item.name}` : item.name)
      else if (item['@microsoft.graph.downloadUrl']) out.push({ folder: path, name: item.name, downloadUrl: item['@microsoft.graph.downloadUrl'] })
    }
  }
  await walk(root.driveId, root.id, '')
  return out
}

export async function downloadOnedriveFile(downloadUrl: string): Promise<Buffer> {
  const res = await fetch(downloadUrl)
  if (!res.ok) throw new Error(`OneDrive download failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
