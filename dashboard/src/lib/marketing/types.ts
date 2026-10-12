// Shared shapes for the Marketing screens and APIs. Pure: safe to import from client components.

export type Site = {
  id: string
  key: string
  name: string
  domain: string
  base_url: string
  blog_base_path: string
  contact_url: string
  business_name: string
  markets: string[]
  brand_terms: string[]
  topic_terms: string[]
  pillar_pages: { url: string; title: string }[]
  topics: string[]
  banned_terms: string[]
  require_approval: boolean
  nightly_count: number
  sort_order: number
  updated_at: string
}

export type SiteSummary = Pick<Site, 'id' | 'key' | 'name' | 'domain' | 'base_url' | 'blog_base_path' | 'topics' | 'markets' | 'require_approval' | 'nightly_count'>

export const ARTICLE_STATUSES = ['draft', 'pending', 'published', 'archived'] as const
export type ArticleStatus = typeof ARTICLE_STATUSES[number]

export type ArticleListRow = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  topic: string | null
  status: ArticleStatus
  category: string
  language: string
  market: string
  word_count: number | null
  quality_score: number | null
  published_at: string | null
  updated_at: string
  created_at: string
}

export type ArticleDetail = ArticleListRow & {
  meta_description: string | null
  markdown: string
  content_html: string
  faq: { question: string; answer: string }[]
  approved_at: string | null
  approved_by: string | null
  updated_by: string | null
  url: string
  run: { id: string; status: string; geo_quality: GeoQuality | null } | null
}

export type GeoQuality = {
  unsupportedClaimCount?: number
  missingTopics?: string[]
  recommendations?: string[]
  sourceGroundingScore?: number
  engine?: { passed_gate?: boolean; metrics?: Record<string, unknown>; cost_usd?: number; status?: string }
}

export const RUN_STATUSES = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const
export type RunStatus = typeof RUN_STATUSES[number]

export type RunSetup = {
  engine: 'python'
  site_id: string
  topic_label: string
  focus: { type: 'product' | 'case_study' | 'market' | 'topic' | 'question'; id: string; label: string }
  market: string
  language: '' | 'en' | 'id'
  topic: string
  reader_question: string
  objective: string
  length: 'standard' | 'long'
  extra_instructions: string
  contact_url: string
  auto_publish: boolean
  target_query: string
  target_position: number
}

export type RunListRow = {
  id: string
  status: RunStatus
  setup: Partial<RunSetup>
  primary_target_name: string | null
  article_id: string | null
  total_duration_ms: number | null
  error: string | null
  triggered_by: string
  created_by: string | null
  created_at: string
  completed_at: string | null
  geo_quality: GeoQuality | null
}

export type RunNode = {
  id: string
  node_key: string
  label: string
  type: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
  sort_order: number
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  input_summary: string | null
  output_summary: string | null
  prompt: string | null
  model: string | null
  token_usage: { input?: number; output?: number } | null
  source_ids: string[]
  error: string | null
  metadata: Record<string, unknown>
}

export type RunEvent = { id: string; node_key: string | null; level: string; message: string; created_at: string }
export type RunSource = { id: string; doc_id: string; title: string | null; url: string | null; excerpt: string | null; score: number | null; used_in: string[]; citation_status: string }

export type RunDetail = {
  run: RunListRow & { started_at: string | null; draft: { title?: string; markdown?: string; slug?: string } | null; article_status: ArticleStatus | null }
  nodes: RunNode[]
  events: RunEvent[]
  sources: RunSource[]
}

export type GscConnectionView = {
  site_id: string
  google_email: string | null
  property_url: string | null
  available_sites: string[]
  status: 'connected' | 'needs_property' | 'error' | 'disconnected'
  last_error: string | null
  last_synced_at: string | null
}

export type GscRow = { label: string; impressions: number; clicks: number; ctr: number; position: number }

export type GscAction = {
  kind: 'snippet' | 'depth' | 'write'
  query: string
  page: string | null
  impressions: number
  clicks: number
  position: number
  expectedClicks: number
  score: number
}

export type GscOverview = {
  connection: GscConnectionView | null
  totals: { impressions: number; clicks: number; ctr: number; position: number; days: number }
  trend: { date: string; impressions: number; clicks: number; position: number }[]
  topPages: GscRow[]
  topQueries: GscRow[]
  actions: GscAction[]
}

export type MarketingStatus = { engine: boolean; engineReachable: boolean | null; gsc: boolean }
