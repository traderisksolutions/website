import { NextResponse } from 'next/server'
import { releaseVersion } from '@/lib/version'

export const dynamic = 'force-dynamic'

/** GET /api/version → the release this server runs; an open tab compares it with its own (VersionWatch). */
export function GET() {
  return NextResponse.json({ version: releaseVersion() }, { headers: { 'Cache-Control': 'no-store' } })
}
