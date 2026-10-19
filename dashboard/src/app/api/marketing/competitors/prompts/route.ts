import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body, isResponse, siteFromReq } from '@/lib/marketing/request'
import { addPrompt, archivePrompt, isMigrationPending, setPromptSelected } from '@/lib/marketing/competitors'

export const dynamic = 'force-dynamic'

const fail = (e: unknown, fallback: string) =>
  isMigrationPending(e) ? json({ error: 'Migration 20261019_marketing_v2 is not applied yet.' }, 503) : json({ error: e instanceof Error ? e.message : fallback }, 500)

/** Add a prompt by hand: the question as asked to an AI assistant, and the Google form of it. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const b = await body(req)
  try {
    const r = await addPrompt(site.id, { prompt: b.prompt, search_query: b.search_query }, who.email)
    if ('error' in r) return json({ error: r.error }, 400)
    return json({ prompt: r.prompt }, 201)
  } catch (e) { return fail(e, 'Could not add the prompt') }
}

/** Tick or untick a prompt for the nightly batch. */
export async function PATCH(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const b = await body(req)
  const id = String(b.id ?? '')
  if (!id || typeof b.selected !== 'boolean') return json({ error: 'id and selected (true or false) are required' }, 400)
  try {
    const prompt = await setPromptSelected(site.id, id, b.selected)
    return prompt ? json({ prompt }) : json({ error: 'Prompt not found' }, 404)
  } catch (e) { return fail(e, 'Could not update the prompt') }
}

export async function DELETE(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const b = await body(req)
  const id = String(b.id ?? '')
  if (!id) return json({ error: 'id is required' }, 400)
  try {
    const ok = await archivePrompt(site.id, id)
    return ok ? json({ ok: true }) : json({ error: 'Prompt not found' }, 404)
  } catch (e) { return fail(e, 'Could not remove the prompt') }
}
