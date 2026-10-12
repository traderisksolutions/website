import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { previewAudience } from '@/lib/sales/campaigns'
import { cleanAudience } from '../_shared'

export const dynamic = 'force-dynamic'

/** How many people an audience filter matches, and how many are free to enrol. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const body = (await req.json().catch(() => ({}))) as { audience?: unknown }
  try { return json(await previewAudience(cleanAudience(body.audience))) }
  catch (e) { console.error('audience preview failed', e instanceof Error ? e.message : e); return json({ error: 'Could not count the audience' }, 500) }
}
