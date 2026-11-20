/**
 * What the Inbox shows about one company beside a thread: its name, kind, domains and owner, and
 * its open to-dos. Replaces the whole board (boardData: every client and insurer with every task),
 * which the Inbox read for one row. Clients and insurers only, as on the board. The staff names the
 * board carried come with the page (InboxTeam in src/components/engagement/company-card.tsx).
 */
import { db, rows } from '@/lib/db/client'
import type { BoardTask, TaskPriority, TaskStatus } from '@/lib/crm/board'

export type CardCompany = { id: string; name: string; kind: string; domains: string[]; domain: string | null; owner_email: string | null }
export type CompanyCard = { company: CardCompany | null; tasks: BoardTask[] }

const BOARD_KINDS = ['client', 'insurer']

export async function companyCard(id: string): Promise<CompanyCard> {
  const [[c], tasks] = await Promise.all([
    rows('Company card', db().from('companies').select('id,company_name,kind,domains,domain,owner_email').eq('id', id).in('kind', BOARD_KINDS).limit(1)),
    rows('Company card to-dos', db().from('board_tasks').select('*').eq('company_id', id).neq('status', 'complete')
      .order('position', { ascending: true }).order('created_at', { ascending: true }).limit(200)),
  ])
  if (!c) return { company: null, tasks: [] }
  // Domains as the board normalises them (normalizeCompany): the list, or the legacy single domain.
  const legacy = c.domain?.trim().toLowerCase() || null
  const listed = (c.domains ?? []).map(d => String(d).toLowerCase())
  return {
    company: {
      id: c.id, name: c.company_name ?? '', kind: c.kind ?? 'client', owner_email: c.owner_email ?? null,
      domains: Array.from(new Set([...listed, ...(legacy && listed.length === 0 ? [legacy] : [])])), domain: legacy,
    },
    tasks: tasks.map(t => ({
      ...t, status: t.status as TaskStatus, priority: t.priority as TaskPriority, collaborators: t.collaborators ?? [], commentCount: 0,
    })),
  }
}
