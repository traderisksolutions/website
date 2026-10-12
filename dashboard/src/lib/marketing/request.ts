// Every Marketing API call is scoped to one site: `?site=<key|id|domain>`, else the first.
import { NextRequest, NextResponse } from 'next/server'
import { json } from './auth'
import { getSite } from './sites'
import type { Site } from './types'

export async function siteFromReq(req: NextRequest): Promise<Site | NextResponse> {
  const site = await getSite(req.nextUrl.searchParams.get('site'))
  return site ?? json({ error: 'Site not found' }, 404)
}

export const isResponse = (x: unknown): x is NextResponse => x instanceof NextResponse

export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  return (await req.json().catch(() => ({}))) as T
}
