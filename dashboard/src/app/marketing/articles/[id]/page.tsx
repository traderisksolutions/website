'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Btn, Chip, Field, SectionCard, Segmented, inputCls, textareaCls } from '@/components/crm/primitives'
import { MarketingPage, MUTED, Note } from '@/components/marketing/page-shell'
import { useSiteKey, useSites, withSite } from '@/components/marketing/site-switch'
import { ArticleStatusChip, CategoryChip } from '@/components/marketing/chips'
import { Prose } from '@/components/marketing/prose'
import { renderMarkdown, wordCount } from '@/lib/marketing/markdown'
import { fmtDate } from '@/lib/marketing/labels'
import type { ArticleDetail, ArticleStatus, SiteSummary } from '@/lib/marketing/types'

const INK = '#0f1412'
type Payload = { site: SiteSummary; article: ArticleDetail }

export default function ArticlePage() {
  return <Suspense fallback={null}><Article /></Suspense>
}

/** One article: edit the text, then approve, publish, unpublish or archive. */
function Article() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { sites } = useSites()
  const [siteKey, setSiteKey] = useSiteKey(sites)
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [form, setForm] = useState({ title: '', slug: '', excerpt: '', topic: '', meta: '', markdown: '' })

  const load = useCallback(async () => {
    if (!siteKey) return
    try {
      const res = await fetch(`/api/marketing/articles/${id}?site=${siteKey}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Could not load the article')
      setData(j); setError(null)
      const a = j.article as ArticleDetail
      setForm({ title: a.title, slug: a.slug, excerpt: a.excerpt ?? '', topic: a.topic ?? '', meta: a.meta_description ?? '', markdown: a.markdown })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [id, siteKey])
  useEffect(() => { void load() }, [load])

  const a = data?.article ?? null
  const dirty = !!a && (form.title !== a.title || form.slug !== a.slug || form.excerpt !== (a.excerpt ?? '') || form.topic !== (a.topic ?? '') || form.meta !== (a.meta_description ?? '') || form.markdown !== a.markdown)
  const words = useMemo(() => wordCount(form.markdown), [form.markdown])
  const html = useMemo(() => (view === 'preview' ? renderMarkdown(form.markdown) : ''), [view, form.markdown])

  async function patch(body: Record<string, unknown>, label: string) {
    if (!siteKey) return
    setBusy(label); setNote(null); setError(null)
    try {
      const res = await fetch(`/api/marketing/articles/${id}?site=${siteKey}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? 'Could not save'); return }
      setNote(label === 'Save' ? 'Saved' : `${label}: done`)
      await load()
    } finally { setBusy(null) }
  }
  const textPatch = () => ({ title: form.title, slug: form.slug, excerpt: form.excerpt, topic: form.topic, metaDescription: form.meta, markdown: form.markdown })
  const setStatus = (status: ArticleStatus, label: string) => patch({ ...(dirty ? textPatch() : {}), status }, label)

  const gq = a?.run?.geo_quality ?? null
  const gate = gq?.engine
  const metrics = (gate?.metrics ?? {}) as Record<string, unknown>

  return (
    <MarketingPage
      back={<Link href={withSite('/marketing/articles', siteKey)} className="underline underline-offset-2" style={{ color: MUTED }}>← Articles</Link>}
      title={a ? form.title || a.title : 'Article'}
      line={a && <span className="inline-flex items-center gap-2 flex-wrap">
        <ArticleStatusChip status={a.status} /><CategoryChip category={a.category} />
        <span>/{a.slug}</span>
        {a.status === 'published' && <a href={a.url} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: INK }}>{a.url.replace(/^https?:\/\//, '')}</a>}
      </span>}
      line2={a && <>
        {words} words · updated {fmtDate(a.updated_at, true)}{a.updated_by ? ` by ${a.updated_by}` : ''}
        {a.published_at && <> · published {fmtDate(a.published_at)}</>}
        {a.approved_by && <> · approved by {a.approved_by}</>}
        {a.run && <> · <Link href={withSite(`/marketing/generate/runs/${a.run.id}`, siteKey)} className="underline underline-offset-2" style={{ color: INK }}>View the run</Link></>}
      </>}
      sites={sites} siteKey={siteKey} onSite={k => { setSiteKey(k); router.push(`/marketing/articles?site=${k}`) }}
      actions={a && <>
        {a.status !== 'archived' && <Btn level="tertiary" disabled={!!busy} onClick={() => setStatus('archived', 'Archive')}>Archive</Btn>}
        {a.status === 'published' && <Btn level="tertiary" disabled={!!busy} onClick={() => setStatus('draft', 'Unpublish')}>Unpublish</Btn>}
        {a.status === 'pending' && <Btn level="secondary" disabled={!!busy} onClick={() => setStatus('archived', 'Reject')}>Reject</Btn>}
        {a.status === 'pending'
          ? <><Btn level="secondary" disabled={!!busy || !dirty} onClick={() => patch(textPatch(), 'Save')}>{busy === 'Save' ? 'Saving…' : 'Save'}</Btn><Btn level="primary" disabled={!!busy} onClick={() => setStatus('published', 'Approve and publish')}>{busy === 'Approve and publish' ? 'Publishing…' : 'Approve and publish'}</Btn></>
          : <><Btn level="secondary" disabled={!!busy || a.status === 'published'} onClick={() => setStatus('published', 'Publish')}>{a.status === 'archived' ? 'Republish' : 'Publish'}</Btn><Btn level="primary" disabled={!!busy || !dirty} onClick={() => patch(textPatch(), 'Save')}>{busy === 'Save' ? 'Saving…' : 'Save'}</Btn></>}
      </>}
    >
      {error && <Note role="alert">{error}</Note>}
      {note && <Note role="status">{note}</Note>}
      {!a && !error && <Note>Loading…</Note>}
      {a && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 flex flex-col gap-6">
            <SectionCard title="Text" actions={<Segmented value={view} onChange={setView} options={[{ value: 'edit', label: 'Edit' }, { value: 'preview', label: 'Preview' }]} />}>
              {view === 'edit' ? (
                <div className="flex flex-col gap-3">
                  <Field label="Title"><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Slug" hint={a.status === 'published' ? 'Fixed once published' : undefined}><input value={form.slug} disabled={a.status === 'published'} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} className={`${inputCls} font-mono text-[13px]`} /></Field>
                    <Field label="Topic">
                      <select value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} className={inputCls}>
                        <option value="">No topic</option>
                        {(data?.site.topics ?? []).map(t => <option key={t} value={t}>{t}</option>)}
                        {form.topic && !(data?.site.topics ?? []).includes(form.topic) && <option value={form.topic}>{form.topic}</option>}
                      </select>
                    </Field>
                  </div>
                  <Field label="Dek" hint="One sentence under the title on the site"><input value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} className={inputCls} maxLength={280} /></Field>
                  <Field label="Meta description" hint={`${form.meta.length} of 160 characters`}><textarea value={form.meta} onChange={e => setForm(f => ({ ...f, meta: e.target.value }))} rows={2} className={textareaCls} /></Field>
                  <Field label="Body (markdown)"><textarea value={form.markdown} onChange={e => setForm(f => ({ ...f, markdown: e.target.value }))} rows={28} className={`${textareaCls} font-mono text-[12.5px] leading-[1.55]`} /></Field>
                </div>
              ) : (
                <article>
                  <h1 className="m-0 mb-1 text-[26px] font-medium tracking-[-0.02em] leading-[1.15]">{form.title}</h1>
                  {form.excerpt && <p className="m-0 mb-4 text-[17px]" style={{ color: MUTED }}>{form.excerpt}</p>}
                  <Prose html={html} />
                </article>
              )}
            </SectionCard>
            {a.faq.length > 0 && (
              <SectionCard title={`FAQ (${a.faq.length})`}>
                <dl className="m-0 flex flex-col gap-3 text-[14px]">
                  {a.faq.map((f, i) => <div key={i}><dt className="font-medium">{f.question}</dt><dd className="m-0 mt-0.5" style={{ color: MUTED }}>{f.answer.replace(/\[F\d+\]/g, '')}</dd></div>)}
                </dl>
              </SectionCard>
            )}
          </div>

          <div className="min-w-0 flex flex-col gap-6">
            {gq && (
              <SectionCard title="Quality gate">
                <div className="flex flex-col gap-2 text-[14px]">
                  <p className="m-0 flex items-center gap-2"><Chip>{gate?.passed_gate ? 'Passed' : 'Held'}</Chip>{typeof gate?.cost_usd === 'number' && <span style={{ color: MUTED }}>US${gate.cost_usd.toFixed(2)}</span>}</p>
                  <p className="m-0" style={{ color: MUTED }}>
                    {gq.unsupportedClaimCount ?? 0} unsupported claims · grounded {Math.round((gq.sourceGroundingScore ?? 0) * 100)}%
                    {typeof metrics.h2_count === 'number' && <> · {String(metrics.h2_count)} H2</>}
                    {typeof metrics.reading_minutes === 'number' && <> · {String(metrics.reading_minutes)} min read</>}
                  </p>
                  {(gq.recommendations ?? []).length > 0 && (
                    <ul className="m-0 pl-4 flex flex-col gap-1" style={{ color: INK }}>{(gq.recommendations ?? []).slice(0, 8).map((r, i) => <li key={i}>{r}</li>)}</ul>
                  )}
                  {(gq.missingTopics ?? []).length > 0 && (
                    <p className="m-0" style={{ color: MUTED }}>Knowledge gaps: {(gq.missingTopics ?? []).join('; ')}</p>
                  )}
                </div>
              </SectionCard>
            )}
            <SectionCard title="Record">
              <dl className="m-0 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
                <dt style={{ color: MUTED }}>Status</dt><dd className="m-0"><ArticleStatusChip status={a.status} /></dd>
                <dt style={{ color: MUTED }}>Source</dt><dd className="m-0"><CategoryChip category={a.category} /></dd>
                <dt style={{ color: MUTED }}>Language</dt><dd className="m-0">{a.language.toUpperCase()} · {a.market}</dd>
                <dt style={{ color: MUTED }}>Created</dt><dd className="m-0">{fmtDate(a.created_at, true)}</dd>
                <dt style={{ color: MUTED }}>Published</dt><dd className="m-0">{fmtDate(a.published_at, true) ?? '–'}</dd>
                <dt style={{ color: MUTED }}>Approved</dt><dd className="m-0">{a.approved_at ? `${fmtDate(a.approved_at, true)} · ${a.approved_by ?? ''}` : '–'}</dd>
                <dt style={{ color: MUTED }}>URL</dt><dd className="m-0 break-all">{a.url}</dd>
              </dl>
            </SectionCard>
          </div>
        </div>
      )}
    </MarketingPage>
  )
}
