/**
 * One website's page under Marketing (/websites/<key>): where its analytics stand and what its
 * articles, enquiries and newsletter hold. Counts only; every figure is read from the tables
 * the existing Marketing pages already use. Server only.
 */
import 'server-only'
import { sbCount } from '@/lib/sales/db'
import { getSite, summarise } from './sites'
import { loadConnection } from './gsc/data'
import { ARTICLE_STATUSES, type ArticleStatus, type SiteSummary } from './types'

export type WebsiteOverview = {
  site: SiteSummary
  analytics: {
    /** GA4 is not wired to the dashboard yet: the site's tag and the Data API come next. */
    ga: { connected: false }
    gsc: { connected: boolean; property: string | null; status: string | null; lastSynced: string | null; lastError: string | null }
  }
  articles: Record<ArticleStatus, number>
  /** Form submissions from the site: site_intakes for the client sites, inbound_leads for TRS. */
  enquiries: { total: number; open: number; source: 'site_intakes' | 'inbound_leads' }
  newsletter: { confirmed: number; pending: number }
}

/** The TRS site's contact form writes inbound_leads (Inbox › Inbound), not site_intakes. */
const LEADS_SITE = 'traderisksolutions'

export async function websiteOverview(key: string): Promise<WebsiteOverview | null> {
  const site = await getSite(key)
  if (!site || site.key !== key) return null
  const counted = (path: string) => sbCount(path).catch(() => 0)
  const leads = site.key === LEADS_SITE
  const [gsc, statusCounts, enqTotal, enqOpen, confirmed, pending] = await Promise.all([
    loadConnection(site.id).catch(() => null),
    Promise.all(ARTICLE_STATUSES.map(s => counted(`cms_articles?site_id=eq.${site.id}&status=eq.${s}`))),
    counted(leads ? 'inbound_leads' : `site_intakes?site_id=eq.${site.id}`),
    counted(leads ? 'inbound_leads?status=eq.new' : `site_intakes?site_id=eq.${site.id}&status=eq.submitted`),
    counted(`newsletter_subscribers?site_id=eq.${site.id}&status=eq.confirmed`),
    counted(`newsletter_subscribers?site_id=eq.${site.id}&status=eq.pending`),
  ])
  const articles = Object.fromEntries(ARTICLE_STATUSES.map((s, i) => [s, statusCounts[i]])) as Record<ArticleStatus, number>
  return {
    site: summarise(site),
    analytics: {
      ga: { connected: false },
      gsc: {
        connected: !!gsc?.property_url && gsc.status !== 'error',
        property: gsc?.property_url ?? null,
        status: gsc?.status ?? null,
        lastSynced: gsc?.last_synced_at ?? null,
        lastError: gsc?.last_error ?? null,
      },
    },
    articles,
    enquiries: { total: enqTotal, open: enqOpen, source: leads ? 'inbound_leads' : 'site_intakes' },
    newsletter: { confirmed, pending },
  }
}
