/**
 * Intake end to end against an in-memory PostgREST: what it stores and what it hands on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as F from './fixtures'

type Row = Record<string, any>
const db: Record<string, Row[]> = {}
const writes: { path: string; method: string; body: any }[] = []
const enqueued: any[] = []

function rowsFor(path: string): Row[] {
  const [table, query = ''] = path.split('?')
  const rows = db[table] ?? []
  const params = new URLSearchParams(query)
  const conds = Array.from(params.entries()).filter(([k]) => !['select', 'order', 'limit', 'on_conflict'].includes(k) && !k.includes('.'))
  return rows.filter(r => {
    for (const [k, v] of conds) {
      const x = r[k]
      if (v.startsWith('eq.') && String(x) !== v.slice(3)) return false
      if (v.startsWith('neq.') && String(x) === v.slice(4)) return false
      if (v === 'is.null' && x != null) return false
      if (v === 'not.is.null' && x == null) return false
      if (v.startsWith('gte.') && !(x != null && String(x) >= v.slice(4))) return false
      if (v.startsWith('lte.') && !(x != null && String(x) <= v.slice(4))) return false
      if (v.startsWith('ilike.')) { const re = new RegExp(`^${v.slice(6).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i'); if (!re.test(String(x ?? ''))) return false }
      if (v.startsWith('in.(')) { const set = v.slice(4, -1).split(',').map(y => y.replace(/"/g, '')); if (!set.includes(String(x))) return false }
    }
    return true
  })
}

vi.mock('@/lib/crm/db', async () => {
  const actual = await vi.importActual<any>('@/lib/crm/db')
  const sb = async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      const body = init.body ? JSON.parse(String(init.body)) : null
      writes.push({ path, method: init.method, body })
      const table = path.split('?')[0]
      if (init.method === 'POST') for (const r of [].concat(body)) (db[table] ??= []).push({ id: `${table}-${(db[table] ?? []).length + 1}`, ...(r as object) })
      return []
    }
    return rowsFor(path)
  }
  return { ...actual, sb, sbTry: async (path: string, fallback: unknown, init?: RequestInit) => { try { return await sb(path, init) } catch { return fallback } } }
})
vi.mock('@/lib/agent-tasks/queue', () => ({
  enqueue: async (t: any) => { enqueued.push(...[].concat(t)) },
  skip: async () => {}, askHuman: async () => {}, finish: async () => {}, fail: async () => {},
}))
vi.mock('@/lib/casework/run', () => ({ workCompany: async () => ({ cases: [], stored: 0, dropped: 0, note: null }) }))

const { intakeMessage } = await import('../intake')
const { clearReferenceCache } = await import('../references')
const task = (message_id: string) => ({ id: 't1', agent: 'intake', kind: 'message', payload: { message_id }, attempts: 1, max_attempts: 3 } as any)

// The fixtures are dated; a message older than a week on arrival is history, so the clock stays with them.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T00:00:00Z'))
  for (const k of Object.keys(db)) delete db[k]
  writes.length = 0; enqueued.length = 0
  clearReferenceCache()
  db.companies = [{ id: 'ins1', kind: 'insurer', domains: ['insurer-example.com'] }, { id: 'acme', kind: 'client', company_name: 'Acme Retail Pte Ltd', domains: ['acme-retail.example'] }]
  db.policies = [{ id: 'pol1', company_id: 'acme', policy_number: '2026-F1234567-BFP' }]
})

describe('intake: a client forwards two emails TRS never received', () => {
  beforeEach(() => {
    db.email_threads = [{ id: 'th1', subject: 'Fwd: Damage at Harbourfront unit', company_id: 'acme' }]
    db.email_messages = [{ id: 'm1', thread_id: 'th1', direction: 'inbound', from_address: 'Pat Lim <pat.lim@acme-retail.example>', subject: 'Fwd: Damage at Harbourfront unit', body_text: F.CLIENT_FORWARDS_TWO, sent_at: '2026-10-30T02:00:00Z', has_attachments: false }]
  })

  it('rebuilds both messages, oldest first, marked forward', async () => {
    const r = await intakeMessage(task('m1')) as any
    expect(r.forward).toBe(true)
    const rebuilt = writes.find(w => w.path.startsWith('rebuilt_messages'))!.body
    expect(rebuilt.map((x: any) => [x.origin, x.position, x.from_address])).toEqual([['forward', 1, 'pat.lim@acme-retail.example'], ['forward', 0, 'pat.lim@acme-retail.example']])
    expect(rebuilt.every((x: any) => x.trs_copied === true)).toBe(true) // sent to Catherine at TRS
    expect(r.refs).toEqual(['2026F1234567BFP'])
  })

  it('opens it as a claim from the forward, with the files TRS does not hold as gaps', async () => {
    await intakeMessage(task('m1'))
    const midway = enqueued.find(t => t.agent === 'claims' && t.kind === 'open_midway')
    expect(midway).toBeTruthy()
    expect(midway.idem_key).toBe('midway:th1')
    expect(midway.payload.opened_mode).toBe('from_forward')
    expect(midway.payload.gaps.map((g: any) => g.item)).toEqual(['Repair quotation HF-0922.pdf', 'IMG_2041.jpg', 'IMG_2042.jpg'])
    expect(midway.payload.company_id).toBe('acme')
    expect(enqueued.some(t => t.agent === 'knowledge_keeper' && t.kind === 'seed_company')).toBe(true)
    expect(enqueued.some(t => t.agent === 'resolver')).toBe(false) // already filed
  })

  it('joins an open claim by the insurer claim reference instead of opening a new one', async () => {
    db.email_messages[0].body_text = F.CLIENT_FORWARDS_TWO.replace('Policy no. 2026-F1234567-BFP.', 'Your claim ref GC26-004411.')
    db.claims = [{ id: 'cl1', work_item_id: 'wi1', company_id: 'acme', insurer_ref: 'GC26-004411', policy_number: null }]
    db.work_items = [{ id: 'wi1', case_type: 'claim', company_id: 'acme', title: 'Water damage — Harbourfront', closed_at: null, work_item_threads: [], claims: { insurer_ref: 'GC26-004411', policy_number: null }, companies: { company_name: 'Acme Retail Pte Ltd' } }]
    db.email_participants = []
    db.work_item_threads = []
    const r = await intakeMessage(task('m1')) as any
    expect(r.matched?.joinedBy).toBe('claim_ref')
    const link = writes.find(w => w.path.startsWith('work_item_threads'))!.body
    expect(link).toMatchObject({ work_item_id: 'wi1', thread_id: 'th1', joined_by: 'claim_ref' })
    const mail = enqueued.find(t => t.agent === 'claims' && t.kind === 'case_mail')
    expect(mail.payload).toMatchObject({ work_item_id: 'wi1', claim_id: 'cl1', joined_by: 'claim_ref' })
    expect(enqueued.some(t => t.kind === 'open_midway')).toBe(false)
  })
})

describe('intake: operations@ copied midway on an insurer conversation', () => {
  it('opens it midway from the quoted history when there is no record', async () => {
    db.email_threads = [{ id: 'th2', subject: 'FW: Enquiry on Claim Payment', company_id: null }]
    db.email_messages = [{ id: 'm2', thread_id: 'th2', direction: 'inbound', from_address: 'low.kai@example-civil.com', subject: 'Re: Enquiry on Claim Payment - Claim No. GC26-004411', body_text: F.OUTLOOK_RECEIVED, sent_at: '2026-10-20T02:00:00Z', created_at: '2026-10-20T02:05:00Z', has_attachments: true }]
    const r = await intakeMessage(task('m2')) as any
    expect(r.first_held).toBe(true)
    expect(r.rebuilt).toBeGreaterThanOrEqual(0)
    expect(enqueued.find(t => t.agent === 'document_clerk')?.idem_key).toBe('docs:m2')
    const resolve = enqueued.find(t => t.agent === 'resolver')
    expect(resolve.idem_key).toBe('resolve:th2')
    expect(Date.parse(resolve.run_after)).toBeGreaterThan(Date.now())
    const midway = enqueued.find(t => t.kind === 'open_midway')
    expect(midway.payload.opened_mode).toBe('midway')
    expect(midway.payload.gaps.map((g: any) => g.item)).toContain('Policy or claim number')
  })
})

describe('intake: automated and out-of-office mail', () => {
  it('files attachments but reads nothing else', async () => {
    db.email_threads = [{ id: 'th3', subject: 'Automatic reply: Renewal', company_id: 'acme' }]
    db.email_messages = [{ id: 'm3', thread_id: 'th3', direction: 'inbound', from_address: 'pat.lim@acme-retail.example', subject: 'Automatic reply: Renewal', body_text: 'I am out of the office until 3 Nov.', sent_at: '2026-10-30T02:00:00Z', has_attachments: false }]
    const r = await intakeMessage(task('m3')) as any
    expect(r.out_of_office).toBe(true)
    expect(enqueued).toEqual([])
  })
})
