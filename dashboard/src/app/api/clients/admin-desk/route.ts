/**
 * GET /api/clients/admin-desk → the top 20% by commission, each with its open requests, the
 * requests that recur and its next renewal (src/lib/clients/admin-desk.ts). Kept 5 minutes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { loadAdminDesk } from '@/lib/clients/admin-desk-load'

export const maxDuration = 60
let cache: { at: number; d: Awaited<ReturnType<typeof loadAdminDesk>> } | null = null

export async function GET(req: NextRequest) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  if (!cache || Date.now() - cache.at > 5 * 60_000 || new URL(req.url).searchParams.get('fresh')) cache = { at: Date.now(), d: await loadAdminDesk() }
  return NextResponse.json(cache.d)
}
