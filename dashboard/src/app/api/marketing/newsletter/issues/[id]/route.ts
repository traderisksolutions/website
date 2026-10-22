import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { approve, deleteIssue, getIssue, getNlSite, renderIssue, sendBatch, sendTest, updateIssue } from '@/lib/newsletter/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function load(id: string) {
  const issue = await getIssue(id)
  if (!issue) return null
  const site = await getNlSite(issue.site_id)
  return site ? { issue, site } : null
}

/** GET → the issue and its rendered email (for the preview). */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  const l = await load(params.id)
  if (!l) return json({ error: 'Not found' }, 404)
  const mail = await renderIssue(l.site, l.issue, null)
  return json({ issue: l.issue, preview: { subject: mail.subject, html: mail.html } })
}

/** PATCH { subject?, intro?, article_ids? } on a draft. */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  const l = await load(params.id)
  if (!l) return json({ error: 'Not found' }, 404)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Body must be JSON' }, 400) }
  const err = await updateIssue(l.issue, body)
  return err ? json({ error: err }, 422) : json({ ok: true })
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  const l = await load(params.id)
  if (!l) return json({ error: 'Not found' }, 404)
  const err = await deleteIssue(l.issue)
  return err ? json({ error: err }, 422) : json({ ok: true })
}

/** POST { action: 'test' | 'approve' | 'batch' } */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  const l = await load(params.id)
  if (!l) return json({ error: 'Not found' }, 404)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Body must be JSON' }, 400) }
  try {
    if (body.action === 'test') { const err = await sendTest(l.site, l.issue, who.email); return err ? json({ error: err }, 422) : json({ ok: true, to: who.email }) }
    if (body.action === 'approve') { const err = await approve(l.site, l.issue, who.email); return err ? json({ error: err }, 422) : json({ ok: true }) }
    if (body.action === 'batch') { const r = await sendBatch(l.site, l.issue); return 'error' in r ? json(r, 422) : json(r) }
    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('newsletter issue action failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not complete that' }, 500)
  }
}
