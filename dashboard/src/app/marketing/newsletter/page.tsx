'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Btn, textareaCls } from '@/components/crm/primitives'
import { MarketingPage, MUTED } from '@/components/marketing/page-shell'
import { Input } from '@/components/ui/input'
import { useSiteKey, useSites } from '@/components/marketing/site-switch'
import { useConfirm } from '@/components/ui/confirm'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { unwrap, type ActionResult } from '@/lib/action-result'
import { deleteNewsletterIssue, newsletter, newsletterAction, newsletterIssue, newsletterIssueAction, updateNewsletterIssue } from '../actions'

// The iframe's own HTML document while the preview loads (an email body, not the app's styles).
const PREVIEW_LOADING = '<p style="font-family:sans-serif;color:#4a5550">Loading…</p>' // drift-ok: email preview HTML

type Sub = { id: string; email: string; status: 'pending' | 'confirmed' | 'unsubscribed'; source_url: string | null; confirm_sent_at: string | null; confirmed_at: string | null; created_at: string }
type Issue = { id: string; subject: string; intro: string; article_ids: string[]; status: 'draft' | 'sending' | 'sent'; test_sent_at: string | null; approved_by: string | null; approved_at: string | null; sent_at: string | null; recipients: number; failures: number; created_at: string }
type Article = { id: string; title: string; slug: string; excerpt: string | null; published_at: string | null }
type Payload = {
  site: { key: string; name: string; newsletter_sender_email: string | null; newsletter_sender_name: string | null }
  counts: { pending: number; confirmed: number; unsubscribed: number }
  subscribers: Sub[]; issues: Issue[]; articles: Article[]; sender: { ready: boolean; reason: string | null }
}

const STATUS: Record<string, string> = { draft: 'Draft', sending: 'Sending', sent: 'Sent', pending: 'Awaiting confirmation', confirmed: 'Confirmed', unsubscribed: 'Unsubscribed' }
const day = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' }).format(new Date(iso)) : '–'

export default function NewsletterPage() {
  return <Suspense fallback={null}><Newsletter /></Suspense>
}

/** Newsletter: who subscribed on the site, and the weekly issue built from published articles,
 *  previewed, tested and approved here before it sends. */
function Newsletter() {
  const { sites } = useSites()
  const [siteKey, setSiteKey] = useSiteKey(sites)
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const req = useRef(0)

  const load = useCallback(async () => {
    if (!siteKey) return
    const id = ++req.current
    try {
      const r = await newsletter(siteKey)
      if (id !== req.current) return
      if (!r.ok) throw new Error(r.error)
      const j = r.data
      setData(j); setError(null)
    } catch (e) { if (id === req.current) setError(e instanceof Error ? e.message : String(e)) }
  }, [siteKey])
  useEffect(() => { setData(null); setOpenId(null); void load() }, [load])

  const post = async (body: Record<string, unknown>) => {
    return unwrap(await newsletterAction({ site: siteKey, ...body })) as Record<string, unknown> & { issue: { id: string } }
  }
  const newIssue = async () => {
    setBusy(true)
    try { const j = await post({ action: 'create' }); await load(); setOpenId(j.issue.id) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const c = data?.counts
  const open = data?.issues.find(i => i.id === openId) ?? null

  return (
    <MarketingPage title="Newsletter" sites={sites} siteKey={siteKey} onSite={setSiteKey}
      line={c ? `${c.confirmed} confirmed · ${c.pending} awaiting confirmation · ${c.unsubscribed} unsubscribed` : 'Loading…'}
      line2={data ? (data.sender.ready ? `Sends as ${data.site.newsletter_sender_name || data.site.name} <${data.site.newsletter_sender_email}> · weekly, approved before sending` : `Not sending: ${data.sender.reason}`) : undefined}
      actions={<Btn level="primary" onClick={newIssue} loading={busy} disabled={!data}>New issue</Btn>}>
      {error && <p className="m-0 mb-4 text-body" role="alert">{error}</p>}
      {data && (
        <div className="grid gap-12">
          {open && <IssueEditor key={open.id} issue={open} articles={data.articles} senderReady={data.sender.ready} onClose={() => setOpenId(null)} onChanged={load} />}

          <section className="grid gap-3">
            <h2 className="m-0 text-heading font-medium">Issues</h2>
            <Register label="Issues" minWidth={720}>
              <RegisterHead>
                <RegisterTh first>Subject</RegisterTh>
                <RegisterTh align="right">Articles</RegisterTh>
                <RegisterTh>Status</RegisterTh>
                <RegisterTh align="right">Sent to</RegisterTh>
                <RegisterTh last align="right">Date</RegisterTh>
              </RegisterHead>
              <tbody>
                {data.issues.length === 0 ? <RegisterEmpty colSpan={5}>No issues yet. New issue builds one from the latest published articles.</RegisterEmpty> :
                  data.issues.map(i => (
                    <RegisterRow key={i.id} selected={i.id === openId} onClick={() => setOpenId(i.id === openId ? null : i.id)}>
                      <RegisterCell first selected={i.id === openId} identityWidth={360} primary={i.subject} secondary={i.approved_by ? `Approved by ${i.approved_by}` : i.test_sent_at ? `Test sent ${day(i.test_sent_at)}` : undefined} />
                      <RegisterCell align="right"><span className="tabular-nums">{i.article_ids.length}</span></RegisterCell>
                      <RegisterCell primary={STATUS[i.status]} />
                      <RegisterCell align="right"><span className="tabular-nums">{i.status === 'draft' ? '–' : `${i.recipients}${i.failures ? ` · ${i.failures} failed` : ''}`}</span></RegisterCell>
                      <RegisterCell last align="right"><span className="tabular-nums text-trs-muted">{day(i.sent_at ?? i.created_at)}</span></RegisterCell>
                    </RegisterRow>
                  ))}
              </tbody>
            </Register>
          </section>

          <Sender site={data.site} ready={data.sender.ready} pendingUnsent={data.subscribers.filter(s => s.status === 'pending' && !s.confirm_sent_at).length} post={post} onChanged={load} />

          <section className="grid gap-3">
            <h2 className="m-0 text-heading font-medium">Subscribers</h2>
            <Register label="Subscribers" minWidth={720} maxHeight="560px">
              <RegisterHead>
                <RegisterTh first>Email</RegisterTh>
                <RegisterTh>Status</RegisterTh>
                <RegisterTh>Signed up on</RegisterTh>
                <RegisterTh last align="right">Date</RegisterTh>
              </RegisterHead>
              <tbody>
                {data.subscribers.length === 0 ? <RegisterEmpty colSpan={4}>No subscribers yet.</RegisterEmpty> :
                  data.subscribers.map(s => (
                    <RegisterRow key={s.id}>
                      <RegisterCell first identityWidth={300} primary={s.email} />
                      <RegisterCell primary={STATUS[s.status]} secondary={s.status === 'pending' ? (s.confirm_sent_at ? `Confirmation sent ${day(s.confirm_sent_at)}` : 'Confirmation not sent yet') : undefined} />
                      <RegisterCell align="left" primary={<span className="block max-w-[320px] truncate text-trs-muted">{s.source_url ? s.source_url.replace(/^https?:\/\//, '').split('?')[0] : '–'}</span>} />
                      <RegisterCell last align="right"><span className="tabular-nums text-trs-muted">{day(s.confirmed_at ?? s.created_at)}</span></RegisterCell>
                    </RegisterRow>
                  ))}
              </tbody>
            </Register>
          </section>
        </div>
      )}
    </MarketingPage>
  )
}

function Sender({ site, ready, pendingUnsent, post, onChanged }: { site: Payload['site']; ready: boolean; pendingUnsent: number; post: (b: Record<string, unknown>) => Promise<unknown>; onChanged: () => void }) {
  const [email, setEmail] = useState(site.newsletter_sender_email ?? '')
  const [name, setName] = useState(site.newsletter_sender_name ?? site.name)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'confirm' | null>(null)
  const run = async (kind: 'save' | 'confirm') => {
    setBusy(kind); setMsg(null)
    try {
      const r = await post(kind === 'save' ? { action: 'sender', sender_email: email, sender_name: name } : { action: 'confirmations' }) as { sent?: number }
      setMsg(kind === 'save' ? 'Saved.' : `${r.sent ?? 0} confirmation emails sent.`)
      onChanged()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }
  return (
    <section className="grid gap-3">
      <h2 className="m-0 text-heading font-medium">Sender</h2>
      <div className="grid gap-3 max-w-[640px]">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-small text-trs-muted">Sender email
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="news@corpcover.com" autoComplete="off" />
          </label>
          <label className="grid gap-1 text-small text-trs-muted">Sender name
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={site.name} />
          </label>
        </div>
        <p className="m-0 text-body text-trs-muted">Must be a verified &quot;Send mail as&quot; address of the Gmail mailbox the dashboard is connected to, on a domain with SPF and DKIM.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <Btn onClick={() => run('save')} loading={busy === 'save'}>Save sender</Btn>
          {ready && pendingUnsent > 0 && <Btn onClick={() => run('confirm')} loading={busy === 'confirm'}>Send {pendingUnsent} pending confirmation{pendingUnsent === 1 ? '' : 's'}</Btn>}
          {msg && <span className="text-body" role="status">{msg}</span>}
        </div>
      </div>
    </section>
  )
}

function IssueEditor({ issue, articles, senderReady, onClose, onChanged }: { issue: Issue; articles: Article[]; senderReady: boolean; onClose: () => void; onChanged: () => void }) {
  const draft = issue.status === 'draft'
  const [subject, setSubject] = useState(issue.subject)
  const [intro, setIntro] = useState(issue.intro)
  const [ids, setIds] = useState<string[]>(issue.article_ids)
  const [preview, setPreview] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const confirmBox = useConfirm()
  const [progress, setProgress] = useState<string | null>(null)
  const dirty = subject !== issue.subject || intro !== issue.intro || ids.join() !== issue.article_ids.join()

  const loadPreview = useCallback(async () => {
    const r = await newsletterIssue(issue.id)
    if (r.ok) setPreview(r.data.preview.html)
  }, [issue.id])
  useEffect(() => { void loadPreview() }, [loadPreview])

  const call = async (method: string, body?: Record<string, unknown>) => {
    const r = method === 'PATCH' ? await updateNewsletterIssue(issue.id, body ?? {})
      : method === 'DELETE' ? await deleteNewsletterIssue(issue.id)
      : await newsletterIssueAction(issue.id, String(body?.action ?? ''))
    return unwrap(r as ActionResult<Record<string, unknown>>) as Record<string, unknown> & { to?: string }
  }
  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name); setMsg(null)
    try { await fn() } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }
  const save = () => act('save', async () => { await call('PATCH', { subject, intro, article_ids: ids }); await loadPreview(); onChanged(); setMsg('Saved.') })
  const test = () => act('test', async () => { if (dirty) await call('PATCH', { subject, intro, article_ids: ids }); const j = await call('POST', { action: 'test' }); setMsg(`Test sent to ${j.to}.`); onChanged() })
  const sendAll = () => act('send', async () => {
    if (issue.status === 'draft') {
      if (!(await confirmBox({ title: 'Send to every confirmed subscriber?', body: 'This cannot be undone.', action: 'Send now' }))) return
      if (dirty) await call('PATCH', { subject, intro, article_ids: ids })
      await call('POST', { action: 'approve' })
    }
    let total = 0
    for (let i = 0; i < 200; i++) {
      const r = await call('POST', { action: 'batch' }) as { sent: number; failed: number; remaining: number }
      total += r.sent
      setProgress(`${total} sent${r.failed ? ` · ${r.failed} failed in the last batch` : ''} · ${r.remaining} remaining`)
      if (r.remaining === 0) break
    }
    onChanged()
  })
  const remove = () => act('delete', async () => { if (!(await confirmBox({ title: 'Delete this draft?', action: 'Delete', danger: true }))) return; await call('DELETE'); onClose(); onChanged() })
  const toggle = (id: string) => setIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : cur.length >= 6 ? cur : [...cur, id])

  return (
    <section className="grid gap-5 rounded p-6 border border-trs-line" aria-label="Issue">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="m-0 text-heading font-medium">{draft ? 'Draft issue' : STATUS[issue.status]}</h2>
        <Btn level="tertiary" onClick={onClose}>Close</Btn>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-4 content-start">
          <label className="grid gap-1 text-small text-trs-muted">Subject
            <Input value={subject} onChange={e => setSubject(e.target.value)} disabled={!draft} maxLength={150} />
          </label>
          <label className="grid gap-1 text-small text-trs-muted">Opening note (optional)
            <textarea value={intro} onChange={e => setIntro(e.target.value)} disabled={!draft} rows={4} className={textareaCls} maxLength={2000} placeholder="Two or three lines above the articles" />
          </label>
          <fieldset className="grid gap-1.5 m-0 p-0 border-0" disabled={!draft}>
            <legend className="text-small mb-1.5 text-trs-muted">Articles, in order; the first leads ({ids.length} of up to 6)</legend>
            {articles.length === 0 && <p className="m-0 text-body text-trs-muted">No published articles on this site.</p>}
            <div className="grid gap-1 max-h-72 overflow-auto pr-1">
              {articles.map(a => {
                const pos = ids.indexOf(a.id)
                return (
                  <label key={a.id} className={cn('flex items-start gap-2.5 rounded px-3 py-2 text-body cursor-pointer', pos >= 0 ? 'bg-trs-soft' : 'hover:bg-trs-tint')}>
                    <input type="checkbox" checked={pos >= 0} onChange={() => toggle(a.id)} className="mt-1 accent-trs-green" />
                    <span className="min-w-0 flex-1"><span className="block">{pos >= 0 ? `${pos + 1}. ` : ''}{a.title}</span><span className="block text-small text-trs-muted">Published {day(a.published_at)}</span></span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          <div className="flex items-center gap-2 flex-wrap">
            {draft && <Btn onClick={save} disabled={!dirty} loading={busy === 'save'}>Save</Btn>}
            {draft && <Btn onClick={test} disabled={!senderReady} loading={busy === 'test'} title={senderReady ? 'Sends to your own address' : 'Set up the sender first'}>Send test to me</Btn>}
            {issue.status !== 'sent' && <Btn level="primary" onClick={sendAll} disabled={!senderReady || ids.length === 0} loading={busy === 'send'}>{issue.status === 'sending' ? 'Resume sending' : 'Approve and send'}</Btn>}
            {draft && <Btn level="tertiary" onClick={remove} loading={busy === 'delete'}>Delete</Btn>}
          </div>
          {(msg || progress) && <p className="m-0 text-body" role="status">{[progress, msg].filter(Boolean).join(' · ')}</p>}
          {issue.status === 'sent' && <p className="m-0 text-body text-trs-muted">Sent {day(issue.sent_at)} to {issue.recipients}{issue.failures ? `, ${issue.failures} failed` : ''}.</p>}
        </div>
        <div className="grid gap-1.5 content-start">
          <span className="text-small text-trs-muted">Preview{dirty ? ' (save to refresh)' : ''}</span>
          <iframe title="Email preview" sandbox="" srcDoc={preview ?? PREVIEW_LOADING} className="w-full h-[640px] rounded bg-white border border-trs-line" />
        </div>
      </div>
    </section>
  )
}
