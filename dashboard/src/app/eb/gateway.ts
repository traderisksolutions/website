'use server'
/**
 * Employment Benefits's routes as one server action (21 Nov 2026), as Nexus, Placements and the Inbox did.
 * The handlers moved unchanged from src/app/api to src/lib/gb/handlers/; the pages call them through
 * ebFetch (src/lib/gb/fetch.ts) with the same paths. Only TRS staff get through; each handler still
 * checks the session itself. Uploads, downloads and links stay routes.
 */
import { staffUser } from '@/lib/auth/guard'
import { runRoute, type GatewayAnswer, type RouteTable } from '@/lib/actions/route-gateway'

const TABLE: RouteTable = [
  { pattern: '/api/eb/policies', load: () => import('@/lib/gb/handlers/eb-policies') },
  { pattern: '/api/eb/price', load: () => import('@/lib/gb/handlers/eb-price') },
  { pattern: '/api/eb/quotations', load: () => import('@/lib/gb/handlers/eb-quotations') },
  { pattern: '/api/eb/quotations/[id]', load: () => import('@/lib/gb/handlers/eb-quotations-id') },
  { pattern: '/api/eb/quotations/[id]/draft', load: () => import('@/lib/gb/handlers/eb-quotations-id-draft') },
  { pattern: '/api/eb/quotations/[id]/insurers', load: () => import('@/lib/gb/handlers/eb-quotations-id-insurers') },
  { pattern: '/api/eb/quotations/[id]/sent', load: () => import('@/lib/gb/handlers/eb-quotations-id-sent') },
  { pattern: '/api/eb/scheme', load: () => import('@/lib/gb/handlers/eb-scheme') },
  { pattern: '/api/eb/workbook', load: () => import('@/lib/gb/handlers/eb-workbook') },
  { pattern: '/api/group-benefits/census/sources', load: () => import('@/lib/gb/handlers/gb-census-sources') },
  { pattern: '/api/group-benefits/hr-links', load: () => import('@/lib/gb/handlers/gb-hr-links') },
  { pattern: '/api/group-benefits/hr-links/[id]', load: () => import('@/lib/gb/handlers/gb-hr-links-id') },
  { pattern: '/api/group-benefits/hr-links/[id]/census', load: () => import('@/lib/gb/handlers/gb-hr-links-id-census') },
  { pattern: '/api/group-benefits/hr-links/[id]/close', load: () => import('@/lib/gb/handlers/gb-hr-links-id-close') },
  { pattern: '/api/group-benefits/hr-links/[id]/resend', load: () => import('@/lib/gb/handlers/gb-hr-links-id-resend') },
  { pattern: '/api/group-benefits/insurer-contacts', load: () => import('@/lib/gb/handlers/gb-insurer-contacts') },
  { pattern: '/api/group-benefits/plan-rules', load: () => import('@/lib/gb/handlers/gb-plan-rules') },
  { pattern: '/api/group-benefits/rate-tables/[id]', load: () => import('@/lib/gb/handlers/gb-rate-tables-id') },
  { pattern: '/api/group-benefits/rate-tables/[id]/approve', load: () => import('@/lib/gb/handlers/gb-rate-tables-id-approve') },
  { pattern: '/api/group-benefits/rate-tables/[id]/extract', load: () => import('@/lib/gb/handlers/gb-rate-tables-id-extract') },
  { pattern: '/api/group-benefits/rate-tables/[id]/schedule', load: () => import('@/lib/gb/handlers/gb-rate-tables-id-schedule') },
  { pattern: '/api/group-benefits/sources', load: () => import('@/lib/gb/handlers/gb-sources') },
]

export async function ebCall(url: string, method: string, body: string | null): Promise<GatewayAnswer> {
  if (!url.startsWith('/api/eb') && !url.startsWith('/api/group-benefits')) return { status: 404, body: JSON.stringify({ error: 'Not found' }), type: 'application/json' }
  if (!(await staffUser())) return { status: 401, body: JSON.stringify({ error: 'Please sign in again.' }), type: 'application/json' }
  return runRoute(TABLE, url, method, body)
}
