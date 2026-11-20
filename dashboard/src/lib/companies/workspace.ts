/**
 * Everything the company page's default view needs, read once on the server (20 Nov 2026).
 * The page made 13 requests after it opened, and the routes behind them re-read the same rows:
 * the company 5 times, its thread ids 6 times. Here each is read once and shared: the overview is
 * built from the thread list, the people and the payments the page shows. Cases and the activity
 * log load when their tab is opened.
 *
 * Mail visibility (INB-002): `viewer` is the signed-in person and is required. The threads, the
 * overview (alerts, where we left off, last threads, stakeholders) and the people are read only
 * from the threads that person may see, by the same rule as GET /api/companies/[id]/threads.
 * A colleague's private thread is counted in `threadsHidden`, never listed or quoted.
 */
import { getCompany, getCompanyThreadIds } from '@/lib/crm/db'
import { buildOverview } from '@/lib/crm/overview'
import { listVisibleCompanyThreads } from '@/lib/crm/threads'
import { rankPeople } from '@/lib/crm/people'
import { loadCompanyPayments } from '@/lib/crm/payments-server'
import { listCompanyQuotes } from '@/lib/crm/quotes'
import { listCompanyPolicies } from '@/lib/policies/spine'
import { companyReviewQueue } from '@/lib/policies/queue'
import { loadBundle } from '@/lib/placement/store'
import { derivePositions } from '@/lib/placement/position'
import { isUuid } from '@/lib/placement/api'
import * as docStore from '@/lib/documents/store'
import { dataRooms } from '@/lib/documents/rooms'
import { letterStatus, type LetterStatus } from '@/lib/letters/appointment'
import { db, rows } from '@/lib/db/client'
import type { DataRoomStatus } from '@/lib/documents/taxonomy'
import type { Company, CompanyThread, CompanyOverview, Person, PaymentDerived, PaymentSummary, QuoteRow } from '@/lib/crm/types'
import type { LinePosition, PlacementBundle } from '@/lib/placement/types'
import type { PolicyView } from '@/lib/policies/types'
import type { PolicyFiles } from '@/components/policies/PoliciesRegister'

export type WorkspaceOverview = CompanyOverview & { company: Company }
export type PlacementData = { bundle: PlacementBundle; positions: LinePosition[] }

export interface CompanyWorkspaceData {
  overview: WorkspaceOverview
  threads: CompanyThread[]
  /** The company's threads in a colleague's private mailbox: a count only. */
  threadsHidden: number
  people: { people: Person[]; observedDomains: { domain: string; count: number }[] }
  payments: { payments: PaymentDerived[]; paymentSummary: PaymentSummary }
  policies: PolicyView[]
  placements: PlacementData
  quotes: QuoteRow[]
  docStatus: Record<string, DataRoomStatus>
  docFiles: Record<string, PolicyFiles>
  draftsCount: number
  letter: LetterStatus | null
  /** Who can own a company: the sign-in roster. */
  team: { email: string; name: string }[]
  userEmail: string
  /** Reads that failed, keyed as the page keys its API reloads ('/policies', '/placements', …). */
  failed: Record<string, string>
}

const LIVE = new Set(['live', 'bound', 'renewal_due'])
const EMPTY_BUNDLE: PlacementBundle = { placements: [], lines: [], rounds: [], dispatches: [], quotes: [], tiers: [], log: [] }

/** The company page's data, or null when there is no such company. Throws when the company or its mail cannot be read. */
export async function loadCompanyWorkspace(id: string, viewer: string): Promise<CompanyWorkspaceData | null> {
  if (!isUuid(id)) return null
  if (!viewer) throw new Error('Company page: no signed-in person to read mail for')
  const [company, threadIds] = await Promise.all([getCompany(id), getCompanyThreadIds(id)])
  if (!company) return null

  // A section that fails shows its own line on its tab, as when it was read through the API.
  const failed: Record<string, string> = {}
  const settle = <T,>(key: string, p: Promise<T>, fallback: T): Promise<T> => p.catch((e: unknown) => {
    failed[key] = e instanceof Error ? e.message : String(e)
    console.error(`[companies/[id]] ${key} failed`, e)
    return fallback
  })

  // The viewer's threads first; the overview and the people read only those.
  const mailP = listVisibleCompanyThreads(id, viewer, { insurers: true, threadIds })
  const paymentsP = loadCompanyPayments(id)
  const peopleP = mailP.then(m => rankPeople(company, m.ownIds))
  const overviewP = mailP.then(m => buildOverview(company, viewer, {
    threadIds: m.ownIds, threads: m.threads.filter(t => !t.via), people: peopleP, payments: paymentsP,
  }))

  const [mail, overview, people, payments, policies, bundle, roomPolicies, docs, queue, quotes, users] = await Promise.all([
    mailP, overviewP, peopleP, paymentsP,
    settle('/policies', listCompanyPolicies(id), []),
    settle('/placements', loadBundle(id), EMPTY_BUNDLE),
    settle('/data-room', docStore.companyPolicies(id), []),
    settle('/data-room', docStore.companyDocuments(id), []),
    settle('/drafts', companyReviewQueue(id), []),
    settle('/quotes', listCompanyQuotes(company), []),
    // The owner picker degrades to the current owner alone without the roster.
    settle('team', rows('Company page: team', db().from('app_users').select('email, name').order('email')), []),
  ])

  const { rooms } = dataRooms(roomPolicies, docs)
  return {
    overview: {
      company, alerts: overview.alerts, leftOff: overview.leftOff, lastThreads: overview.lastThreads, stakeholders: overview.stakeholders,
      needsReply: overview.needsReply, statusLine: overview.statusLine, summaryStale: overview.summaryStale,
    },
    threads: mail.threads,
    threadsHidden: mail.hidden,
    people: { people: people.people, observedDomains: people.observedDomains },
    payments: { payments: payments.notes, paymentSummary: payments.summary },
    policies,
    placements: { bundle, positions: derivePositions(bundle) },
    quotes,
    docStatus: Object.fromEntries(rooms.map(r => [r.policy.id, r.status])),
    docFiles: Object.fromEntries(rooms.map(r => [r.policy.id, {
      folder: r.policy.drive_folder_url ?? null,
      documents: r.documents.map(d => ({ id: d.id, doc_type: d.doc_type, title: d.title, filename: d.filename, received_at: d.received_at, created_at: d.created_at })),
    }])),
    draftsCount: queue.length,
    // The same rule as GET /api/letters/appointment, from the rows already read. Unknown when the data room failed.
    letter: failed['/data-room'] ? null : letterStatus(docs, roomPolicies.some(p => LIVE.has(p.lifecycle))),
    team: users.filter(u => u.email).map(u => ({ email: u.email, name: (u.name ?? '').trim() || u.email.split('@')[0] })),
    userEmail: viewer,
    failed,
  }
}
