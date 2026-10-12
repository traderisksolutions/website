// The block shape corpcover and benefixe used for their hand-written articles, converted to
// the markdown the article library stores. Pure; used by scripts/import-site-articles.ts.

export type SiteBlock = { type: 'p'; text: string } | { type: 'h2'; text: string } | { type: 'ul'; items: string[] }

export function blocksToMarkdown(blocks: SiteBlock[]): string {
  return blocks.map(b => {
    if (b.type === 'h2') return `## ${b.text.trim()}`
    if (b.type === 'ul') return b.items.map(i => `- ${i.trim()}`).join('\n')
    return b.text.trim()
  }).join('\n\n').trim() + '\n'
}
