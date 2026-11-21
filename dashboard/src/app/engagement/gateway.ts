'use server'
/**
 * The Inbox's routes as one server action (21 Nov 2026): threads, drafts, summaries, filing,
 * the rail's bar, inbound leads, search and the senders list. The handlers moved unchanged to
 * src/lib/inbox/handlers/; pages call them through inboxFetch / callInbox (src/lib/inbox/fetch.ts)
 * with the same paths. Staff only; each handler keeps its own check. Stay routes:
 * email/send, email/ingest and email/attachments/upload, the attachment download,
 * engagement/auto-summarize (inbound/reply calls it server to server) and
 * engagement/conversations (the list pages through it; journeys test it directly).
 */
import { staffUser } from '@/lib/auth/guard'
import { runRoute, type GatewayAnswer, type RouteTable } from '@/lib/actions/route-gateway'

const TABLE: RouteTable = [
  { pattern: '/api/email/attachments/for-thread', load: () => import('@/lib/inbox/handlers/email-attachments-for-thread') },
  { pattern: '/api/email/attachments/upload-url', load: () => import('@/lib/inbox/handlers/email-attachments-upload-url') },
  { pattern: '/api/email/available-senders', load: () => import('@/lib/inbox/handlers/email-available-senders') },
  { pattern: '/api/email/ingest-trigger', load: () => import('@/lib/inbox/handlers/email-ingest-trigger') },
  { pattern: '/api/engagement/company-card', load: () => import('@/lib/inbox/handlers/engagement-company-card') },
  { pattern: '/api/engagement/conversation/promote', load: () => import('@/lib/inbox/handlers/engagement-conversation-promote') },
  { pattern: '/api/engagement/conversation', load: () => import('@/lib/inbox/handlers/engagement-conversation') },
  { pattern: '/api/engagement/draft', load: () => import('@/lib/inbox/handlers/engagement-draft') },
  { pattern: '/api/engagement/drafts/[id]', load: () => import('@/lib/inbox/handlers/engagement-drafts-id') },
  { pattern: '/api/engagement/drafts', load: () => import('@/lib/inbox/handlers/engagement-drafts') },
  { pattern: '/api/engagement/refresh-summary', load: () => import('@/lib/inbox/handlers/engagement-refresh-summary') },
  { pattern: '/api/engagement/thread-summaries', load: () => import('@/lib/inbox/handlers/engagement-thread-summaries') },
  { pattern: '/api/engagement/thread/[id]/company', load: () => import('@/lib/inbox/handlers/engagement-thread-id-company') },
  { pattern: '/api/engagement/thread/[id]/party', load: () => import('@/lib/inbox/handlers/engagement-thread-id-party') },
  { pattern: '/api/engagement/thread/[id]/referral', load: () => import('@/lib/inbox/handlers/engagement-thread-id-referral') },
  { pattern: '/api/engagement/thread', load: () => import('@/lib/inbox/handlers/engagement-thread') },
  { pattern: '/api/inbound/auto-draft', load: () => import('@/lib/inbox/handlers/inbound-auto-draft') },
  { pattern: '/api/inbound/reply', load: () => import('@/lib/inbox/handlers/inbound-reply') },
  { pattern: '/api/leads', load: () => import('@/lib/inbox/handlers/leads') },
  { pattern: '/api/search', load: () => import('@/lib/inbox/handlers/search') },
  { pattern: '/api/threads/[id]/bar', load: () => import('@/lib/inbox/handlers/threads-id-bar') },
]
const AREAS = ['/api/engagement/', '/api/email/', '/api/inbound/', '/api/threads/', '/api/search', '/api/leads']

export async function inboxCall(url: string, method: string, body: string | null): Promise<GatewayAnswer> {
  if (!AREAS.some(a => url.startsWith(a))) return { status: 404, body: JSON.stringify({ error: 'Not found' }), type: 'application/json' }
  if (!(await staffUser())) return { status: 401, body: JSON.stringify({ error: 'Please sign in again.' }), type: 'application/json' }
  return runRoute(TABLE, url, method, body)
}
