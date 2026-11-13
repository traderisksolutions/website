/**
 * GET /api/public/gb-report/:token → the client report as it was sent on WhatsApp, for a client
 * with no login. The token (src/lib/gb/report-link.ts) names the kept Drive copy, is signed and
 * expires after 30 days; anything else is 404. Only files in Drive's group-benefits/client-reports
 * folder are ever named by a token, because only the send route signs them. A file trashed in
 * Drive is withdrawn: Drive still serves its bytes, so the route checks first.
 */
import { NextRequest, NextResponse } from 'next/server'
import { readReportToken } from '@/lib/gb/report-link'
import { getDriveWriteToken } from '@/lib/gdrive-write'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const id = readReportToken(token)
  if (!id) return NextResponse.json({ error: 'This link has expired or is not valid. Ask Trade Risk Solutions for a new one.' }, { status: 404 })
  const gone = NextResponse.json({ error: 'The report is no longer available.' }, { status: 404 })
  const auth = { Authorization: `Bearer ${await getDriveWriteToken()}` }
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`
  const meta = await fetch(`${url}?fields=trashed,mimeType&supportsAllDrives=true`, { headers: auth }).then(r => r.ok ? r.json() as Promise<{ trashed?: boolean; mimeType?: string }> : null).catch(() => null)
  if (!meta || meta.trashed || meta.mimeType !== 'application/pdf') return gone
  const res = await fetch(`${url}?alt=media&supportsAllDrives=true`, { headers: auth }).catch(() => null)
  if (!res?.ok) return gone
  const bytes = Buffer.from(await res.arrayBuffer())
  return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="group-benefits-comparison.pdf"', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
}
