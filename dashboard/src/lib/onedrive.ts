/**
 * Microsoft Graph (OneDrive) read access for the historical-backfill import path — a one-time/
 * occasional pull, not the ongoing storage system (Google Drive is, see gdrive-write.ts).
 *
 * App-only (client-credentials) auth: no interactive user login, matching how every other
 * service integration in this app authenticates (Google service account, Supabase service key).
 *
 * Setup required (one-time, not code): register an Azure AD app registration, grant it the
 * *application* permission `Files.Read.All` (admin consent required — application permissions,
 * not delegated, since there's no signed-in user here), create a client secret, and set
 * MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET / MS_GRAPH_DRIVE_USER
 * (the OneDrive owner's UPN/email, e.g. admin@trade-risksol.com, if the source is a personal
 * OneDrive-for-Business rather than a SharePoint site — confirm which before relying on this).
 */
const GRAPH_API = 'https://graph.microsoft.com/v1.0'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} not set`)
  return v
}

export async function getGraphToken(): Promise<string> {
  const tenantId = requireEnv('MS_GRAPH_TENANT_ID')
  const clientId = requireEnv('MS_GRAPH_CLIENT_ID')
  const clientSecret = requireEnv('MS_GRAPH_CLIENT_SECRET')

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Graph auth failed: ${JSON.stringify(data)}`)
  return data.access_token as string
}

export type OneDriveItem = {
  id: string; name: string; folder?: object; file?: { mimeType: string }; size?: number
}

function driveRoot(): string {
  const user = requireEnv('MS_GRAPH_DRIVE_USER')
  return `${GRAPH_API}/users/${encodeURIComponent(user)}/drive`
}

/** Lists the children of a path ('' = root, or 'Debit Notes/2026'). */
export async function listChildren(path: string, token: string): Promise<OneDriveItem[]> {
  const seg = path.trim().replace(/^\/+|\/+$/g, '')
  const url = seg
    ? `${driveRoot()}/root:/${encodeURIComponent(seg).replace(/%2F/g, '/')}:/children`
    : `${driveRoot()}/root/children`
  const res = await fetch(`${url}?$select=id,name,folder,file,size`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`OneDrive list failed: ${await res.text()}`)
  const data = await res.json()
  return (data.value ?? []) as OneDriveItem[]
}

export async function downloadItem(itemId: string, token: string): Promise<Buffer> {
  const res = await fetch(`${driveRoot()}/items/${itemId}/content`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`OneDrive download failed: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}
