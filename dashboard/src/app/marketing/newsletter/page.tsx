'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Btn, inputCls, textareaCls } from '@/components/crm/primitives'
import { MarketingPage, MUTED, RULE } from '@/components/marketing/page-shell'
import { useSiteKey, useSites } from '@/components/marketing/site-switch'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'

const INK = '#0f1412'

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
      const res = await fetch(`/api/marketing/newsletter?site=${siteKey}`, { cache: 'no-store' })
      const j = await res.json()
      if (id !== req.current) return
      if (!res.ok) throw new Error(j.error ?? 'Could not load the newsletter')
      setData(j); setError(null)
    } catch (e) { if (id === req.current) setError(e instanceof Error ? e.message : String(e)) }
  }, [siteKey])
  useEffect(() => { setData(null); setOpenId(null); void load() }, [load])

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/marketing/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site: siteKey, ...body }) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error ?? 'Could not complete that')
    return j
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
      {error && <p className="m-0 mb-4 text-[14px]" role="alert">{error}</p>}
      {data && (
        <div className="grid gap-12">
          {open && <IssueEditor key={open.id} issue={open} articles={data.articles} senderReady={data.sender.ready} onClose={() => setOpenId(null)} onChanged={load} />}

          <section className="grid gap-3">
            <h2 className="m-0 text-[20px] font-medium tracking-[-0.01em]">Issues</h2>
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
                      <RegisterCell last align="right"><span className="tabular-nums" style={{ color: MUTED }}>{day(i.sent_at ?? i.created_at)}</span></RegisterCell>
                    </RegisterRow>
                  ))}
              </tbody>
            </Register>
          </section>

          <Sender site={data.site} ready={data.sender.ready} pendingUnsent={data.subscribers.filter(s => s.status === 'pending' && !s.confirm_sent_at).length} post={post} onChanged={load} />

          <section className="grid gap-3">
            <h2 className="m-0 text-[20px] font-medium tracking-[-0.01em]">Subscribers</h2>
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
                      <RegisterCell primary={<span className="block max-w-[320px] truncate" style={{ color: MUTED }}>{s.source_url ? s.source_url.replace(/^https?:\/\//, '').split('?')[0] : '–'}</span>} />
                      <RegisterCell last align="right"><span className="tabular-nums" style={{ color: MUTED }}>{day(s.confirmed_at ?? s.created_at)}</span></RegisterCell>
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
      <h2 className="m-0 text-[20px] font-medium tracking-[-0.01em]">Sender</h2>
      <div className="grid gap-3 max-w-[640px]">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[12.5px]" style={{ color: MUTED }}>Sender email
            <input value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="news@corpcover.com" autoComplete="off" />
          </label>
          <label className="grid gap-1 text-[12.5px]" style={{ color: MUTED }}>Sender name
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder={site.name} />
          </label>
        </div>
        <p className="m-0 text-[13px]" style={{ color: MUTED }}>Must be a verified "Send mail as" address of the Gmail mailbox the dashboard is connected to, on a domain with SPF and DKIM.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <Btn onClick={() => run('save')} loading={busy === 'save'}>Save sender</Btn>
          {ready && pendingUnsent > 0 && <Btn onClick={() => run('confirm')} loading={busy === 'confirm'}>Send {pendingUnsent} pending confirmation{pendingUnsent === 1 ? '' : 's'}</Btn>}
          {msg && <span className="text-[13.5px]" role="status">{msg}</span>}
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
  const [progress, setProgress] = useState<string | null>(null)
  const dirty = subject !== issue.subject || intro !== issue.intro || ids.join() !== issue.article_ids.join()

  const loadPreview = useCallback(async () => {
    const res = await fetch(`/api/marketing/newsletter/issues/${issue.id}`, { cache: 'no-store' })
    if (res.ok) setPreview((await res.json()).preview.html)
  }, [issue.id])
  useEffect(() => { void loadPreview() }, [loadPreview])

  const call = async (method: string, body?: Record<string, unknown>) => {
    const res = await fetch(`/api/marketing/newsletter/issues/${issue.id}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error ?? 'Could not complete that')
    return j
  }
  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name); setMsg(null)
    try { await fn() } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }
  const save = () => act('save', async () => { await call('PATCH', { subject, intro, article_ids: ids }); await loadPreview(); onChanged(); setMsg('Saved.') })
  const test = () => act('test', async () => { if (dirty) await call('PATCH', { subject, intro, article_ids: ids }); const j = await call('POST', { action: 'test' }); setMsg(`Test sent to ${j.to}.`); onChanged() })
  const sendAll = () => act('send', async () => {
    if (issue.status === 'draft') {
      if (!window.confirm('Send this issue to every confirmed subscriber now? This cannot be undone.')) return
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
  const remove = () => act('delete', async () => { if (!window.confirm('Delete this draft?')) return; await call('DELETE'); onClose(); onChanged() })
  const toggle = (id: string) => setIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : cur.length >= 6 ? cur : [...cur, id])

  return (
    <section className="grid gap-5 rounded-[16px] p-6" style={{ border: `1px solid ${RULE}` }} aria-label="Issue">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="m-0 text-[20px] font-medium tracking-[-0.01em]">{draft ? 'Draft issue' : STATUS[issue.status]}</h2>
        <Btn level="tertiary" onClick={onClose}>Close</Btn>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-4 content-start">
          <label className="grid gap-1 text-[12.5px]" style={{ color: MUTED }}>Subject
            <input value={subject} onChange={e => setSubject(e.target.value)} disabled={!draft} className={inputCls} maxLength={150} />
          </label>
          <label className="grid gap-1 text-[12.5px]" style={{ color: MUTED }}>Opening note (optional)
            <textarea value={intro} onChange={e => setIntro(e.target.value)} disabled={!draft} rows={4} className={textareaCls} maxLength={2000} placeholder="Two or three lines above the articles" />
          </label>
          <fieldset className="grid gap-1.5 m-0 p-0 border-0" disabled={!draft}>
            <legend className="text-[12.5px] mb-1.5" style={{ color: MUTED }}>Articles, in order; the first leads ({ids.length} of up to 6)</legend>
            {articles.length === 0 && <p className="m-0 text-[14px]" style={{ color: MUTED }}>No published articles on this site.</p>}
            <div className="grid gap-1 max-h-[300px] overflow-auto pr-1">
              {articles.map(a => {
                const pos = ids.indexOf(a.id)
                return (
                  <label key={a.id} className={cn('flex items-start gap-2.5 rounded-[10px] px-3 py-2 text-[14px] cursor-pointer', pos >= 0 ? 'bg-[#edf7e8]' : 'hover:bg-[#faf9f6]')}>
                    <input type="checkbox" checked={pos >= 0} onChange={() => toggle(a.id)} className="mt-1" />
                    <span className="min-w-0 flex-1"><span className="block">{pos >= 0 ? `${pos + 1}. ` : ''}{a.title}</span><span className="block text-[12.5px]" style={{ color: MUTED }}>Published {day(a.published_at)}</span></span>
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
          {(msg || progress) && <p className="m-0 text-[13.5px]" role="status">{[progress, msg].filter(Boolean).join(' · ')}</p>}
          {issue.status === 'sent' && <p className="m-0 text-[13.5px]" style={{ color: MUTED }}>Sent {day(issue.sent_at)} to {issue.recipients}{issue.failures ? `, ${issue.failures} failed` : ''}.</p>}
        </div>
        <div className="grid gap-1.5 content-start">
          <span className="text-[12.5px]" style={{ color: MUTED }}>Preview{dirty ? ' (save to refresh)' : ''}</span>
          <iframe title="Email preview" sandbox="" srcDoc={preview ?? '<p style="font-family:sans-serif;color:#4a5550">Loading…</p>'} className="w-full h-[640px] rounded-[12px] bg-white" style={{ border: `1px solid ${RULE}` }} />
        </div>
      </div>
    </section>
  )
}
