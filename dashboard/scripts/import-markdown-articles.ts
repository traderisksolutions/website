// Loads a folder of markdown articles into the article library for one site, rendered the same
// way the dashboard renders an edit (renderMarkdown + buildArticleJsonLd), so the sites and the
// Marketing → Articles screen see identical rows. Reads the dashboard's .env.local for the key.
//
//   npx tsx scripts/import-markdown-articles.ts <site key|domain> <folder> [--update] [--dry]
//
// File shape: see the format note at the top of each folder (front matter between two '---'
// lines: slug, title, meta_description, excerpt, topic, market; then the markdown body with a
// "## Frequently asked questions" section of "### Question" + answer paragraphs).
// Idempotent: an existing slug is skipped unless --update, which re-renders and patches it.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const HERE = resolve(__dirname, '..')
for (const envPath of [resolve(HERE, '.env.local'), resolve(HERE, '../../trs-website/dashboard/.env.local')]) {
  if (!existsSync(envPath)) continue
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
  break
}

type Front = { slug: string; title: string; meta_description: string; excerpt: string; topic: string; market: string }
type Parsed = { front: Front; markdown: string; faq: { question: string; answer: string }[]; file: string }

function parseFile(path: string): Parsed {
  const raw = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) throw new Error(`${path}: no front matter`)
  const front: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/)
    if (kv) front[kv[1]] = kv[2].trim().replace(/^"|"$/g, '')
  }
  for (const k of ['slug', 'title', 'meta_description', 'excerpt', 'topic', 'market']) if (!front[k]) throw new Error(`${path}: front matter missing ${k}`)
  const markdown = m[2].trim() + '\n'
  // FAQ pairs: the "### Question" blocks under the FAQ heading.
  const faq: { question: string; answer: string }[] = []
  const fi = markdown.search(/^## Frequently asked questions\s*$/im)
  if (fi >= 0) {
    const after = markdown.slice(fi).split('\n').slice(1)
    let q: string | null = null
    let a: string[] = []
    const flush = () => { if (q && a.join(' ').trim()) faq.push({ question: q, answer: a.join(' ').replace(/\s+/g, ' ').trim() }); q = null; a = [] }
    for (const line of after) {
      if (/^## /.test(line)) { flush(); break }
      const h = line.match(/^### (.+)$/)
      if (h) { flush(); q = h[1].trim(); continue }
      if (q && line.trim()) a.push(line.trim())
    }
    flush()
  }
  return { front: front as Front, markdown, faq, file: path }
}

async function main() {
  const [key, dir, ...flags] = process.argv.slice(2)
  if (!key || !dir) { console.error('usage: import-markdown-articles.ts <site> <folder> [--update] [--dry]'); process.exit(2) }
  const update = flags.includes('--update')
  const dry = flags.includes('--dry')
  const { renderMarkdown, wordCount, excerptOf } = await import('../src/lib/marketing/markdown')
  const { buildArticleJsonLd } = await import('../src/lib/marketing/jsonld')
  const { getSite, articleUrl } = await import('../src/lib/marketing/sites')
  const { sb, enc } = await import('../src/lib/sales/db')
  const site = await getSite(key)
  if (!site) throw new Error(`site ${key} not found`)

  const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort()
  const parsed = files.map(f => parseFile(resolve(dir, f)))
  const problems: string[] = []
  for (const p of parsed) {
    const { front, markdown, faq } = p
    const wc = wordCount(markdown)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(front.slug) || front.slug.length > 120) problems.push(`${front.slug}: bad slug`)
    if (front.title.length < 3 || front.title.length > 200) problems.push(`${front.slug}: title length ${front.title.length}`)
    if (front.meta_description.length > 300) problems.push(`${front.slug}: meta ${front.meta_description.length} chars`)
    if (front.meta_description.length > 165) console.warn(`warn ${front.slug}: meta ${front.meta_description.length} chars (aim ≤ 155)`)
    if (site.topics.length && !site.topics.includes(front.topic)) problems.push(`${front.slug}: topic "${front.topic}" not in ${site.topics.join(' | ')}`)
    if (!/^[A-Z]{2}$/.test(front.market)) problems.push(`${front.slug}: market ${front.market}`)
    if (wc < 900) problems.push(`${front.slug}: only ${wc} words`)
    if (wc > 2200) console.warn(`warn ${front.slug}: ${wc} words`)
    if (faq.length < 3) problems.push(`${front.slug}: ${faq.length} FAQ pairs parsed`)
    if (!/^## Sources\s*$/m.test(markdown)) problems.push(`${front.slug}: no Sources section`)
    if (/^# /m.test(markdown)) problems.push(`${front.slug}: H1 in body`)
    if (/<[a-z][^>]*>/i.test(markdown)) problems.push(`${front.slug}: HTML in body`)
    if (/§/.test(markdown)) problems.push(`${front.slug}: section symbol`)
    if (/!/.test(markdown.replace(/\[[^\]]*\]\([^)]*\)/g, ''))) console.warn(`warn ${front.slug}: exclamation mark`)
  }
  const dup = parsed.map(p => p.front.slug).filter((s, i, a) => a.indexOf(s) !== i)
  if (dup.length) problems.push(`duplicate slugs: ${dup.join(', ')}`)
  if (problems.length) { console.error('Problems:\n  ' + problems.join('\n  ')); process.exit(1) }

  const existing = new Map((await sb<{ id: string; slug: string; status: string; published_at: string | null }[]>(`cms_articles?site_id=eq.${site.id}&select=id,slug,status,published_at&limit=5000`)).map(r => [r.slug, r]))
  const now = new Date().toISOString()
  const actor = 'import:blogs-2026-11-10'
  const rows: Record<string, unknown>[] = []
  let patched = 0
  const skipped: string[] = []
  for (const p of parsed) {
    const { front, markdown, faq } = p
    const url = articleUrl(site, front.slug, front.market)
    const was = existing.get(front.slug)
    const published = was?.published_at ?? now
    const base = {
      title: front.title, excerpt: front.excerpt || excerptOf(markdown), topic: front.topic, meta_description: front.meta_description.slice(0, 300),
      content_html: renderMarkdown(markdown), content_json: { format: 'markdown', markdown, faq },
      schema_jsonld: buildArticleJsonLd({ title: front.title, description: front.meta_description, url, orgName: site.business_name, orgDomain: site.domain, datePublished: published, dateModified: now, language: 'en', faq }),
      word_count: wordCount(markdown), market: front.market, language: 'en', updated_at: now, updated_by: actor,
    }
    if (was) {
      if (!update) { skipped.push(front.slug); continue }
      if (!dry) await sb(`cms_articles?id=eq.${was.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(base) })
      patched++
      continue
    }
    rows.push({ ...base, site_id: site.id, slug: front.slug, status: 'published', category: 'manual', published_at: now, approved_at: now, approved_by: actor, created_at: now })
  }
  if (rows.length && !dry) {
    for (let i = 0; i < rows.length; i += 20) await sb('cms_articles', { method: 'POST', body: JSON.stringify(rows.slice(i, i + 20)), prefer: 'return=minimal' })
  }
  console.log(`${site.domain}: ${rows.length} inserted${dry ? ' (dry run)' : ''}, ${patched} updated, ${skipped.length} skipped (already present${skipped.length ? ': ' + skipped.join(', ') : ''})`)
  console.log(`words: ${parsed.map(p => wordCount(p.markdown)).join(', ')}`)
  console.log(`first url: ${parsed[0] ? articleUrl(site, parsed[0].front.slug, parsed[0].front.market) : '-'}`)
}

main().catch(e => { console.error(e); process.exit(1) })
