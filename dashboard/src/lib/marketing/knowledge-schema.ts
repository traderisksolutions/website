// The knowledge bank's six sections: one source of truth for the page, the API and the Python
// engine (content-engine/engine/knowledge.py mirrors these labels). Structured sections are
// loaded whole into every run; documents are retrieved by relevance. Pure.

export type KnowledgeSection = 'business' | 'product' | 'case_study' | 'claim' | 'market' | 'document'
export type KnowledgeStatus = 'draft' | 'verified' | 'archived'
export type MarketCode = 'SG' | 'HK' | 'ID' | 'MY'

export type KnowledgeEntry = {
  id: string
  site_id: string
  section: KnowledgeSection
  title: string
  body: string
  attributes: Record<string, string>
  markets: string[]
  language: string
  status: KnowledgeStatus
  priority: number
  source: string
  created_at: string
  updated_at: string
  updated_by: string | null
}

export type AttributeField = { key: string; label: string; hint?: string; multiline?: boolean }

export type SectionMeta = { key: KnowledgeSection; label: string; bodyLabel: string; bodyHint: string; attributeFields: AttributeField[] }

export const SECTIONS: SectionMeta[] = [
  {
    key: 'business', label: 'Business facts', bodyLabel: 'Facts',
    bodyHint: 'Plain sentences, one idea per line. The writer may only state what is written here.',
    attributeFields: [{ key: 'evidence_url', label: 'Evidence link', hint: 'A public page that backs this up.' }],
  },
  {
    key: 'product', label: 'Products and services', bodyLabel: 'What it covers',
    bodyHint: 'One entry per policy type or service, described as you would to a client.',
    attributeFields: [
      { key: 'key_features', label: 'What the policy covers', multiline: true },
      { key: 'use_cases', label: 'Who needs it', hint: 'The businesses and situations it applies to.', multiline: true },
      { key: 'outcomes', label: 'What a claim pays', multiline: true },
      { key: 'unique_value', label: 'What to check on renewal', multiline: true },
      { key: 'pricing_notes', label: 'Pricing notes', hint: 'Only if premiums may be mentioned.', multiline: true },
      { key: 'evidence_url', label: 'Product page link' },
    ],
  },
  {
    key: 'case_study', label: 'Case studies', bodyLabel: 'What happened',
    bodyHint: 'Client type, the exposure, what was placed, and the measurable result. No client names unless approved.',
    attributeFields: [{ key: 'source_url', label: 'Public case study link' }, { key: 'tag', label: 'Category' }],
  },
  {
    key: 'claim', label: 'Approved claims', bodyLabel: 'The claim',
    bodyHint: 'Exact wording you are happy to publish, and where it comes from. Unverified claims are flagged, never stated as fact.',
    attributeFields: [{ key: 'evidence_url', label: 'Evidence link' }, { key: 'evidence_note', label: 'Evidence note', hint: 'Which source, measured how, over what period.', multiline: true }],
  },
  {
    key: 'market', label: 'Market notes', bodyLabel: 'Notes',
    bodyHint: 'Laws, regulators, statutory limits and buyer habits for one market. The engine never invents a regulation.',
    attributeFields: [{ key: 'regulators', label: 'Laws and regulators to cite', multiline: true }, { key: 'currency', label: 'Currency code' }],
  },
  {
    key: 'document', label: 'Documents', bodyLabel: 'Content',
    bodyHint: 'Longer reference material: policy wordings, guides, transcripts. Retrieved by relevance for each article.',
    attributeFields: [{ key: 'source', label: 'Where it came from' }],
  },
]

export const SECTION_BY_KEY: Record<KnowledgeSection, SectionMeta> = Object.fromEntries(SECTIONS.map(s => [s.key, s])) as Record<KnowledgeSection, SectionMeta>

export const MARKETS: { code: MarketCode; label: string; language: 'en' | 'id'; currency: string }[] = [
  { code: 'SG', label: 'Singapore', language: 'en', currency: 'SGD' },
  { code: 'HK', label: 'Hong Kong', language: 'en', currency: 'HKD' },
  { code: 'MY', label: 'Malaysia', language: 'en', currency: 'MYR' },
  { code: 'ID', label: 'Indonesia', language: 'id', currency: 'IDR' },
]

export const marketLabel = (code: string) => MARKETS.find(m => m.code === code)?.label ?? code

export function isSection(v: unknown): v is KnowledgeSection { return typeof v === 'string' && SECTIONS.some(s => s.key === v) }
export function isMarket(v: unknown): v is MarketCode { return typeof v === 'string' && MARKETS.some(m => m.code === v) }

export type Readiness = {
  counts: Partial<Record<KnowledgeSection, number>>
  business: boolean
  product: boolean
  case_study: boolean
  claim: boolean
  market: boolean
  verified: number
  total: number
}

/** What the Generate page checks before a run: which sections are filled for a market. */
export function computeReadiness(entries: Pick<KnowledgeEntry, 'section' | 'status' | 'markets'>[], market: string): Readiness {
  const active = entries.filter(e => e.status !== 'archived')
  const counts: Partial<Record<KnowledgeSection, number>> = {}
  for (const e of active) counts[e.section] = (counts[e.section] ?? 0) + 1
  return {
    counts,
    business: (counts.business ?? 0) > 0,
    product: (counts.product ?? 0) > 0,
    case_study: (counts.case_study ?? 0) > 0,
    claim: (counts.claim ?? 0) > 0,
    market: active.some(e => e.section === 'market' && e.markets.length > 0 && e.markets.includes(market)),
    verified: active.filter(e => e.status === 'verified').length,
    total: active.length,
  }
}

/** Pasted text → entries: one per top-level "# Heading", or one entry when there are none. */
export function splitMarkdown(markdown: string, fallbackTitle: string): { title: string; body: string }[] {
  const text = markdown.replace(/\r\n/g, '\n').trim()
  const parts = text.split(/^(?=#\s+)/m).map(p => p.trim()).filter(Boolean)
  const entries: { title: string; body: string }[] = []
  for (const part of parts) {
    const m = part.match(/^#\s+(.+)\n?([\s\S]*)$/)
    if (m) entries.push({ title: m[1].trim().slice(0, 200), body: m[2].trim() || m[1].trim() })
    else entries.push({ title: fallbackTitle, body: part })
  }
  return entries.length ? entries : [{ title: fallbackTitle, body: text }]
}
