// Loads the hand-written articles each site ships in its code into the article library, once,
// by slug. Reads the dashboard's .env.local for the database key, so run it from dashboard/:
//
//   npx tsx scripts/import-site-articles.ts corpcover
//   npx tsx scripts/import-site-articles.ts benefixe
//
// Idempotent: a slug already in cms_articles is skipped. Nothing is deleted.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const HERE = resolve(__dirname, '..')
for (const line of readFileSync(resolve(HERE, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

type Block = { type: 'p'; text: string } | { type: 'h2'; text: string } | { type: 'ul'; items: string[] }
type Source = { slug: string; title: string; dek: string; topic: string; published: string; updated?: string; body: Block[] }

async function main() {
  const key = process.argv[2]
  if (key !== 'corpcover' && key !== 'benefixe') { console.error('usage: import-site-articles.ts corpcover|benefixe'); process.exit(2) }
  const { blocksToMarkdown } = await import('../src/lib/marketing/blocks')
  const { getSite } = await import('../src/lib/marketing/sites')
  const { importArticles } = await import('../src/lib/marketing/articles')
  const site = await getSite(key)
  if (!site) throw new Error(`site ${key} not found: apply supabase/migrations/20261012_marketing.sql first`)
  // A non-literal specifier: the site modules use their own "@/…" aliases, which the dashboard's
  // type-check must not try to resolve. tsx resolves it at run time.
  const modPath = key === 'corpcover' ? '../../corpcover/src/content/articles' : '../../benefixe/src/content/blogs'
  const mod = (await import(modPath)) as { articles?: Source[]; blogs?: Source[] }
  const items = ((key === 'corpcover' ? mod.articles : mod.blogs) ?? []).map(a => ({
    slug: a.slug, title: a.title, excerpt: a.dek, topic: a.topic, published: a.published, updated: a.updated, metaDescription: a.dek, markdown: blocksToMarkdown(a.body), status: 'published' as const,
  }))
  const r = await importArticles(site, items, 'import:site-code')
  console.log(`${site.domain}: ${r.inserted} inserted, ${r.skipped.length} already present${r.errors.length ? `, errors: ${r.errors.join('; ')}` : ''}`)
}

main().catch(e => { console.error(e); process.exit(1) })
