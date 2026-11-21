/**
 * Microsoft Graph, organisation-level (docs/eb-v2.md P7, decision D4: built now, switched off until
 * the connection is approved). One app registration with application permission
 * Files.Read.All and one admin consent; no per-person tokens. Server only. No model.
 *
 * Env: MS_GRAPH=on, MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_WATCH_DRIVE_ID (the OneDrive or
 * SharePoint document library), MS_WATCH_FOLDER (the folder in it; empty = the whole drive).
 */
type Env = Record<string, string | undefined>

export const microsoftWatchOn = (env: Env = process.env): boolean =>
  env.MS_GRAPH === 'on' && !!env.MS_TENANT_ID && !!env.MS_CLIENT_ID && !!env.MS_CLIENT_SECRET && !!env.MS_WATCH_DRIVE_ID

let token: { value: string; until: number } | null = null

async function graphToken(): Promise<string> {
  if (token && Date.now() < token.until) return token.value
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(process.env.MS_TENANT_ID!)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.MS_CLIENT_ID!, client_secret: process.env.MS_CLIENT_SECRET!, scope: 'https://graph.microsoft.com/.default' }),
  })
  if (!res.ok) throw new Error(`Microsoft sign-in ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json() as { access_token: string; expires_in: number }
  token = { value: j.access_token, until: Date.now() + (j.expires_in - 120) * 1000 }
  return token.value
}

export async function graph<T>(url: string): Promise<T> {
  const res = await fetch(url.startsWith('http') ? url : `https://graph.microsoft.com/v1.0${url}`, { headers: { Authorization: `Bearer ${await graphToken()}` } })
  if (!res.ok) throw new Error(`Microsoft Graph ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json() as Promise<T>
}

export async function graphBytes(driveId: string, itemId: string): Promise<Buffer> {
  const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`, { headers: { Authorization: `Bearer ${await graphToken()}` } })
  if (!res.ok) throw new Error(`Microsoft file ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
