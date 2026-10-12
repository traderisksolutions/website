import { describe, it, expect, beforeAll } from 'vitest'
import { anchorOf, excerptOf, h2sOf, plainText, renderMarkdown, slugify, wordCount } from '@/lib/marketing/markdown'
import { blocksToMarkdown } from '@/lib/marketing/blocks'
import { buildArticleJsonLd } from '@/lib/marketing/jsonld'
import { computeReadiness, splitMarkdown } from '@/lib/marketing/knowledge-schema'
import { classifyQueries, expectedCtr, isBrandQuery, weightedPosition } from '@/lib/marketing/gsc/actions'
import { pickProperty, signState, verifyState } from '@/lib/marketing/gsc/client'
import { decryptSecret, encryptSecret } from '@/lib/marketing/gsc/crypto'
import { cleanSitePatch } from '@/lib/marketing/sites'
import { cleanSetup } from '@/lib/marketing/engine'
import type { Site } from '@/lib/marketing/types'

beforeAll(() => { process.env.AUTH_SECRET = 'test-secret-for-marketing-rules-0123456789' })

const SITE: Site = {
  id: 'b1000000-0000-4000-8000-000000000001', key: 'corpcover', name: 'Corp Cover', domain: 'corpcover.com', base_url: 'https://corpcover.com', blog_base_path: '/articles',
  contact_url: 'https://corpcover.com/#start', business_name: 'Corp Cover', markets: ['SG'], brand_terms: ['corp cover'], topic_terms: [], pillar_pages: [], topics: ['Required by law', 'Liability'],
  banned_terms: ['MAS'], require_approval: true, nightly_count: 0, sort_order: 1, updated_at: '2026-10-12T00:00:00Z',
}

describe('markdown', () => {
  it('renders headings with anchors, lists, links and escapes html', () => {
    const html = renderMarkdown('Intro <b>x</b> with [a link](https://x.sg) and *em*.\n\n## Who must be covered?\n\n- Every employee doing manual work\n- Staff earning S$2,600 or less\n\n1. first\n2. second')
    expect(html).toContain('<p>Intro &lt;b&gt;x&lt;/b&gt; with <a href="https://x.sg">a link</a> and <em>em</em>.</p>')
    expect(html).toContain('<h2 id="who-must-be-covered">Who must be covered?</h2>')
    expect(html).toContain('<ul><li>Every employee doing manual work</li><li>Staff earning S$2,600 or less</li></ul>')
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>')
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a')
  })
  it('renders pipe tables, blockquote CTAs and footnotes', () => {
    const html = renderMarkdown('| Cover | Limit |\n|---|---|\n| WICA | S$45,000 |\n\n> **Want a review?**\n>\n> [Talk to us](https://corpcover.com/#start)\n\nA claim[^1].\n\n[^1]: [MOM](https://mom.gov.sg)')
    expect(html).toContain('<table><thead><tr><th>Cover</th><th>Limit</th></tr></thead><tbody><tr><td>WICA</td><td>S$45,000</td></tr></tbody></table>')
    expect(html).toContain('<blockquote><p><strong>Want a review?</strong></p><p><a href="https://corpcover.com/#start">Talk to us</a></p></blockquote>')
    expect(html).toContain('<sup id="fnref-1"><a href="#fn-1">1</a></sup>')
    expect(html).toContain('<li id="fn-1"><a href="https://mom.gov.sg">MOM</a>')
  })
  it('derives slug, anchor, excerpt, word count and h2s', () => {
    expect(slugify('Work injury compensation: who must be insured?')).toBe('work-injury-compensation-who-must-be-insured')
    expect(anchorOf('What does the **policy** pay?')).toBe('what-does-the-policy-pay')
    const md = '# Title\n\nThe Work Injury Compensation Act requires employers to insure [F1].\n\n## Who?\n\n- a\n\nMore text [^1].'
    expect(excerptOf(md)).toBe('The Work Injury Compensation Act requires employers to insure.')
    expect(plainText('**Bold** and `code` [F2] [link](https://x)')).toBe('Bold and code link')
    expect(wordCount('one two three [F1]')).toBe(3)
    expect(h2sOf(md)).toEqual([{ id: 'who', text: 'Who?' }])
  })
})

describe('import and knowledge helpers', () => {
  it('turns site blocks into markdown', () => {
    expect(blocksToMarkdown([{ type: 'p', text: 'Intro.' }, { type: 'h2', text: 'Who?' }, { type: 'ul', items: ['a', 'b'] }])).toBe('Intro.\n\n## Who?\n\n- a\n- b\n')
  })
  it('splits pasted text on top-level headings', () => {
    expect(splitMarkdown('# A\nbody a\n# B\nbody b', 'X')).toEqual([{ title: 'A', body: 'body a' }, { title: 'B', body: 'body b' }])
    expect(splitMarkdown('no headings here', 'Fallback')).toEqual([{ title: 'Fallback', body: 'no headings here' }])
  })
  it('readiness checks each section and the market note', () => {
    const r = computeReadiness([{ section: 'business', status: 'verified', markets: [] }, { section: 'market', status: 'draft', markets: ['HK'] }, { section: 'product', status: 'archived', markets: [] }], 'SG')
    expect(r.business).toBe(true); expect(r.product).toBe(false); expect(r.market).toBe(false); expect(r.total).toBe(2); expect(r.verified).toBe(1)
  })
  it('builds JSON-LD with an FAQ graph and strips fact markers', () => {
    const ld = buildArticleJsonLd({ title: 'T', description: 'd', url: 'https://corpcover.com/articles/t', orgName: 'Corp Cover', orgDomain: 'corpcover.com', datePublished: '2026-10-12', faq: [{ question: 'Q?', answer: 'A [F2].' }] }) as { '@graph': Record<string, unknown>[] }
    expect(ld['@graph'][0]['@type']).toBe('BlogPosting')
    expect(JSON.stringify(ld['@graph'][1])).toContain('"text":"A ."')
  })
})

describe('search console', () => {
  it('classifies queries into snippet, depth and write', () => {
    const rows = [
      { query: 'corp cover review', page: 'https://corpcover.com/', impressions: 200, clicks: 50, ctr: 0.25, position: 1.2 },
      { query: 'wica insurance cost', page: 'https://corpcover.com/articles/wica', impressions: 400, clicks: 2, ctr: 0.005, position: 3 },
      { query: 'public liability excess', page: 'https://corpcover.com/articles/pl', impressions: 60, clicks: 1, ctr: 0.016, position: 14 },
      { query: 'd&o insurance singapore', page: 'https://corpcover.com/', impressions: 40, clicks: 0, ctr: 0, position: 35 },
      { query: 'tiny', page: 'https://corpcover.com/', impressions: 3, clicks: 0, ctr: 0, position: 30 },
    ]
    const actions = classifyQueries(rows, { brandTerms: ['corp cover'] })
    expect(actions.map(a => [a.query, a.kind])).toEqual([['wica insurance cost', 'snippet'], ['public liability excess', 'depth'], ['d&o insurance singapore', 'write']])
    expect(actions[2].page).toBeNull()
    expect(isBrandQuery('corpcover sg', ['corpcover'])).toBe(true)
    expect(expectedCtr(1)).toBe(0.28); expect(expectedCtr(25)).toBe(0.002)
    expect(weightedPosition([{ impressions: 10, position: 2 }, { impressions: 30, position: 10 }])).toBe(8)
  })
  it('signs and verifies the OAuth state with an expiry', () => {
    const s = signState(SITE.id)
    expect(verifyState(s)).toBe(SITE.id)
    expect(verifyState(s, Date.now() + 16 * 60_000)).toBeNull()
    expect(verifyState(`${s}x`)).toBeNull()
  })
  it('encrypts the refresh token at rest', () => {
    const blob = encryptSecret('1//refresh-token')
    expect(blob).not.toContain('refresh-token')
    expect(decryptSecret(blob)).toBe('1//refresh-token')
  })
  it('picks the matching property', () => {
    const sites = [{ siteUrl: 'sc-domain:benefixe.com', permissionLevel: 'siteOwner' }, { siteUrl: 'https://www.corpcover.com/', permissionLevel: 'siteFullUser' }, { siteUrl: 'https://old.example/', permissionLevel: 'siteUnverifiedUser' }]
    expect(pickProperty(sites, 'corpcover.com')).toBe('https://www.corpcover.com/')
    expect(pickProperty(sites, 'benefixe.com')).toBe('sc-domain:benefixe.com')
    expect(pickProperty(sites, 'newsouthsea.com')).toBeNull()
  })
})

describe('validation', () => {
  it('cleans a site patch', () => {
    expect(cleanSitePatch({ base_url: 'corpcover.com' })).toEqual({ error: 'Base URL must start with https://' })
    expect(cleanSitePatch({ blog_base_path: 'articles' })).toEqual({ error: 'Blog path must look like /articles' })
    const ok = cleanSitePatch({ markets: ['sg', 'xx'], topics: [' A ', 'A', ''], nightly_count: '2', require_approval: 'true', pillar_pages: [{ url: 'https://corpcover.com/articles', title: 'Guides' }, { url: 'nope' }] })
    expect(ok).toEqual({ patch: { markets: ['SG'], topics: ['A'], nightly_count: 2, require_approval: true, pillar_pages: [{ url: 'https://corpcover.com/articles', title: 'Guides' }] } })
  })
  it('cleans a run setup', () => {
    expect(cleanSetup(SITE, { focus: { type: 'topic' }, topic: 'ab' })).toEqual({ error: 'Give a topic, or choose a product or case study to focus on' })
    expect(cleanSetup(SITE, { focus: { type: 'product' } })).toEqual({ error: 'Choose the entry to focus on' })
    expect(cleanSetup(SITE, { topic: 'x'.repeat(10), topic_label: 'Perks' })).toEqual({ error: 'Topic must be one of: Required by law, Liability' })
    const r = cleanSetup(SITE, { focus: { type: 'question', label: 'wica for contractors' }, market: 'HK', length: 'long', target_query: 'wica for contractors', target_position: '14.2' })
    expect('setup' in r && r.setup.market).toBe('SG') // HK is not one of the site's markets
    expect('setup' in r && r.setup.length).toBe('long')
    expect('setup' in r && r.setup.target_position).toBe(14.2)
    expect('setup' in r && r.setup.site_id).toBe(SITE.id)
  })
})
