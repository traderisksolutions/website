// The article library, per site. Markdown in content_json is the source of truth; content_html
// and schema_jsonld are rendered on every save so the sites never render markdown themselves.
import { sb, sbPage, enc } from '@/lib/sales/db'
import { buildArticleJsonLd } from './jsonld'
import { excerptOf, h2sOf, renderMarkdown, slugify, wordCount } from './markdown'
import { articleUrl } from './sites'
import type { ArticleDetail, ArticleListRow, ArticleStatus, GeoQuality, Site } from './types'
import { ARTICLE_STATUSES } from './types'

const LIST_COLS = 'id,title,slug,excerpt,topic,status,category,language,market,word_count,quality_score,published_at,updated_at,created_at'

export async function listArticles(siteId: string, opts: { status?: string; q?: string; limit?: number } = {}): Promise<{ rows: ArticleListRow[]; total: number; counts: Record<ArticleStatus, number> }> {
  const clauses = [`site_id=eq.${siteId}`]
  if (opts.status && (ARTICLE_STATUSES as readonly string[]).includes(opts.status)) clauses.push(`status=eq.${opts.status}`)
  const q = (opts.q ?? '').replace(/[%,()]/g, ' ').trim()
  if (q) clauses.push(`or=(title.ilike.*${enc(q)}*,slug.ilike.*${enc(q)}*,topic.ilike.*${enc(q)}*)`)
  const [{ rows, total }, countRows] = await Promise.all([
    sbPage<ArticleListRow>(`cms_articles?${clauses.join('&')}&select=${LIST_COLS}&order=updated_at.desc&limit=${opts.limit ?? 500}`),
    sb<{ status: ArticleStatus }[]>(`cms_articles?site_id=eq.${siteId}&select=status&limit=5000`),
  ])
  const counts: Record<ArticleStatus, number> = { draft: 0, pending: 0, published: 0, archived: 0 }
  for (const r of countRows) counts[r.status] = (counts[r.status] ?? 0) + 1
  return { rows, total, counts }
}

type Stored = { format?: string; markdown?: string; faq?: { question: string; answer: string }[] }

type FullRow = ArticleListRow & { site_id: string; meta_description: string | null; content_html: string; content_json: Stored; approved_at: string | null; approved_by: string | null; updated_by: string | null }

export async function getArticle(site: Site, id: string): Promise<ArticleDetail | null> {
  const [rows, runs] = await Promise.all([
    sb<FullRow[]>(`cms_articles?id=eq.${id}&site_id=eq.${site.id}&select=${LIST_COLS},site_id,meta_description,content_html,content_json,approved_at,approved_by,updated_by&limit=1`),
    sb<{ id: string; status: string; geo_quality: GeoQuality | null }[]>(`blog_generation_runs?article_id=eq.${id}&site_id=eq.${site.id}&select=id,status,geo_quality&order=created_at.desc&limit=1`),
  ])
  const a = rows[0]
  if (!a) return null
  const { content_json, site_id: _s, ...rest } = a
  void _s
  return { ...rest, markdown: content_json?.markdown ?? '', faq: content_json?.faq ?? [], url: articleUrl(site, a.slug, a.market), run: runs[0] ?? null }
}

export async function uniqueSlug(siteId: string, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base)
  const rows = await sb<{ slug: string; id: string }[]>(`cms_articles?site_id=eq.${siteId}&slug=like.${enc(root)}*&select=slug,id`)
  const taken = new Set(rows.filter(r => r.id !== excludeId).map(r => r.slug))
  if (!taken.has(root)) return root
  for (let i = 2; i < 200; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`
  return `${root}-${Date.now().toString(36)}`
}

export type ArticlePatch = { title?: string; markdown?: string; metaDescription?: string | null; excerpt?: string | null; topic?: string | null; slug?: string; status?: ArticleStatus }

function validate(title: string, markdown: string, meta: string | null): string | null {
  if (title.trim().length < 3 || title.trim().length > 200) return 'Title must be 3 to 200 characters'
  if (markdown.trim().length < 50) return 'The article body must be at least 50 characters'
  if ((meta ?? '').length > 300) return 'Meta description must be under 300 characters'
  return null
}

/** Render + save. Publishing a pending article through the editor counts as approval. */
export async function saveArticle(site: Site, id: string, patch: ArticlePatch, actor: string): Promise<{ status: ArticleStatus; url: string } | { error: string }> {
  const rows = await sb<FullRow[]>(`cms_articles?id=eq.${id}&site_id=eq.${site.id}&select=${LIST_COLS},site_id,meta_description,content_html,content_json,approved_at,approved_by,updated_by&limit=1`)
  const a = rows[0]
  if (!a) return { error: 'Article not found' }
  const title = (patch.title ?? a.title).trim()
  const markdown = (patch.markdown ?? a.content_json?.markdown ?? '').trim()
  const meta = patch.metaDescription === undefined ? a.meta_description : (patch.metaDescription ?? '').trim() || null
  const excerpt = patch.excerpt === undefined ? (a.excerpt ?? excerptOf(markdown)) : (patch.excerpt ?? '').trim() || excerptOf(markdown)
  const topic = patch.topic === undefined ? a.topic : (patch.topic ?? '').trim() || null
  const status = patch.status ?? a.status
  const invalid = validate(title, markdown, meta)
  if (invalid) return { error: invalid }
  if (!(ARTICLE_STATUSES as readonly string[]).includes(status)) return { error: 'Invalid status' }
  if (topic && site.topics.length && !site.topics.includes(topic)) return { error: `Topic must be one of: ${site.topics.join(', ')}` }

  let slug = a.slug
  if (patch.slug !== undefined && patch.slug.trim() !== a.slug) {
    if (a.status === 'published') return { error: 'The slug of a published article cannot change' }
    const wanted = patch.slug.trim().toLowerCase()
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(wanted) || wanted.length < 3 || wanted.length > 120) return { error: 'Slug must be 3 to 120 characters of lowercase letters, numbers and hyphens' }
    const clash = await sb<{ id: string }[]>(`cms_articles?site_id=eq.${site.id}&slug=eq.${enc(wanted)}&id=neq.${id}&select=id&limit=1`)
    if (clash.length) return { error: 'Slug already in use' }
    slug = wanted
  }

  const now = new Date().toISOString()
  const goingLive = status === 'published' && a.status !== 'published'
  const publishedAt = status === 'published' ? (a.published_at ?? now) : a.published_at
  const url = articleUrl(site, slug)
  const faq = a.content_json?.faq ?? []
  await sb(`cms_articles?id=eq.${id}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: JSON.stringify({
      title, slug, excerpt, topic, meta_description: meta,
      content_html: renderMarkdown(markdown),
      content_json: { ...(a.content_json ?? {}), format: 'markdown', markdown },
      schema_jsonld: buildArticleJsonLd({ title, description: meta, url, orgName: site.business_name, orgDomain: site.domain, datePublished: publishedAt ?? now, dateModified: now, language: a.language, faq }),
      word_count: wordCount(markdown),
      status, published_at: publishedAt,
      ...(goingLive && a.status === 'pending' ? { approved_at: now, approved_by: actor } : {}),
      updated_at: now, updated_by: actor,
    }),
  })
  return { status, url }
}

export async function createArticle(site: Site, input: { title?: string; markdown?: string; metaDescription?: string; topic?: string; status?: string }, actor: string): Promise<{ id: string; slug: string } | { error: string }> {
  const title = (input.title ?? '').trim()
  const markdown = (input.markdown ?? '').trim()
  const meta = (input.metaDescription ?? '').trim() || null
  const invalid = validate(title, markdown, meta)
  if (invalid) return { error: invalid }
  const status: ArticleStatus = input.status === 'published' ? 'published' : 'draft'
  const topic = (input.topic ?? '').trim() || null
  if (topic && site.topics.length && !site.topics.includes(topic)) return { error: `Topic must be one of: ${site.topics.join(', ')}` }
  const slug = await uniqueSlug(site.id, title)
  const now = new Date().toISOString()
  const rows = await sb<{ id: string }[]>('cms_articles?select=id', {
    method: 'POST',
    body: JSON.stringify({
      site_id: site.id, title, slug, excerpt: excerptOf(markdown), topic, meta_description: meta,
      content_html: renderMarkdown(markdown), content_json: { format: 'markdown', markdown },
      schema_jsonld: buildArticleJsonLd({ title, description: meta, url: articleUrl(site, slug), orgName: site.business_name, orgDomain: site.domain, datePublished: now }),
      status, category: 'manual', word_count: wordCount(markdown), published_at: status === 'published' ? now : null, updated_by: actor,
    }),
  })
  return { id: rows[0].id, slug }
}

export async function approveArticle(site: Site, id: string, actor: string): Promise<{ url: string } | { error: string }> {
  const r = await saveArticle(site, id, { status: 'published' }, actor)
  return 'error' in r ? r : { url: r.url }
}

export async function setStatus(site: Site, id: string, status: ArticleStatus, actor: string): Promise<{ status: ArticleStatus } | { error: string }> {
  const r = await saveArticle(site, id, { status }, actor)
  return 'error' in r ? r : { status: r.status }
}

export type ImportItem = { slug: string; title: string; markdown: string; excerpt?: string; topic?: string; metaDescription?: string; published?: string; updated?: string; status?: 'draft' | 'published'; market?: string }

/** Existing hand-written articles from a site's code, inserted once by slug. */
export async function importArticles(site: Site, items: ImportItem[], actor: string): Promise<{ inserted: number; skipped: string[]; errors: string[] }> {
  const existing = new Set((await sb<{ slug: string }[]>(`cms_articles?site_id=eq.${site.id}&select=slug&limit=5000`)).map(r => r.slug))
  const skipped: string[] = []
  const errors: string[] = []
  const rows: Record<string, unknown>[] = []
  for (const it of items.slice(0, 200)) {
    const slug = slugify(it.slug || it.title)
    if (existing.has(slug)) { skipped.push(slug); continue }
    const invalid = validate(it.title ?? '', it.markdown ?? '', it.metaDescription ?? null)
    if (invalid) { errors.push(`${slug}: ${invalid}`); continue }
    const published = it.published && !Number.isNaN(Date.parse(it.published)) ? new Date(it.published).toISOString() : new Date().toISOString()
    const updated = it.updated && !Number.isNaN(Date.parse(it.updated)) ? new Date(it.updated).toISOString() : published
    const status = it.status ?? 'published'
    const market = it.market && /^[A-Z]{2}$/.test(it.market) ? it.market : 'SG'
    rows.push({
      site_id: site.id, title: it.title.trim(), slug, excerpt: (it.excerpt ?? '').trim() || excerptOf(it.markdown), topic: it.topic?.trim() || null,
      meta_description: (it.metaDescription ?? it.excerpt ?? '').trim().slice(0, 300) || null,
      content_html: renderMarkdown(it.markdown), content_json: { format: 'markdown', markdown: it.markdown.trim() },
      schema_jsonld: buildArticleJsonLd({ title: it.title, description: it.excerpt ?? null, url: articleUrl(site, slug, market), orgName: site.business_name, orgDomain: site.domain, datePublished: published, dateModified: updated }),
      status, market, category: 'import', word_count: wordCount(it.markdown), published_at: status === 'published' ? published : null,
      created_at: published, updated_at: updated, updated_by: actor,
    })
    existing.add(slug)
  }
  if (rows.length) await sb('cms_articles', { method: 'POST', body: JSON.stringify(rows), prefer: 'return=minimal' })
  return { inserted: rows.length, skipped, errors }
}

/** Published articles for a site's public blog API. */
export type PublicArticle = {
  slug: string; market: string; title: string; excerpt: string | null; topic: string | null; language: string; published_at: string; updated_at: string
  word_count: number | null; reading_minutes: number; meta_description: string | null; url: string
}

export async function publicList(site: Site, market?: string | null): Promise<PublicArticle[]> {
  const mk = market && /^[A-Z]{2}$/.test(market) ? `&market=eq.${market}` : ''
  const rows = await sb<ArticleListRow[]>(`cms_articles?site_id=eq.${site.id}&status=eq.published${mk}&select=${LIST_COLS},meta_description&order=published_at.desc&limit=500`)
  return rows.map(r => ({
    slug: r.slug, market: r.market, title: r.title, excerpt: r.excerpt, topic: r.topic, language: r.language, published_at: r.published_at ?? r.created_at, updated_at: r.updated_at,
    word_count: r.word_count, reading_minutes: Math.max(1, Math.round((r.word_count ?? 0) / 220)), meta_description: (r as ArticleListRow & { meta_description: string | null }).meta_description, url: articleUrl(site, r.slug, r.market),
  }))
}

export async function publicArticle(site: Site, slug: string): Promise<(PublicArticle & { content_html: string; markdown: string; headings: { id: string; text: string }[]; faq: { question: string; answer: string }[]; schema_jsonld: unknown }) | null> {
  const rows = await sb<(FullRow & { schema_jsonld: unknown })[]>(`cms_articles?site_id=eq.${site.id}&slug=eq.${enc(slug)}&status=eq.published&select=${LIST_COLS},site_id,meta_description,content_html,content_json,schema_jsonld,approved_at,approved_by,updated_by&limit=1`)
  const a = rows[0]
  if (!a) return null
  return {
    slug: a.slug, market: a.market, title: a.title, excerpt: a.excerpt, topic: a.topic, language: a.language, published_at: a.published_at ?? a.created_at, updated_at: a.updated_at,
    word_count: a.word_count, reading_minutes: Math.max(1, Math.round((a.word_count ?? 0) / 220)), meta_description: a.meta_description, url: articleUrl(site, a.slug, a.market),
    content_html: a.content_html, markdown: a.content_json?.markdown ?? '', headings: h2sOf(a.content_json?.markdown ?? ''), faq: a.content_json?.faq ?? [], schema_jsonld: a.schema_jsonld,
  }
}
