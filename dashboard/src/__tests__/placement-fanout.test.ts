/**
 * A shared request draft fans out into one clone per dispatch at send time. The clone carries
 * the reviewed text, the dispatch's address and contact, and lines up with its dispatch by index.
 */
import { describe, it, expect } from 'vitest'
import { cloneRows, pairClones } from '@/lib/placement/fanout'

const source = { id: 'd0', contact_id: 'c-first', thread_id: null, cc: ['ops@trade-risksol.com'] }
const dispatches = [
  { id: 'x1', to_email: 'Benjamin.Zhong@Allianz.sg', insurer_contact_id: 'c-allianz', insurer_name: 'Allianz' },
  { id: 'x2', to_email: 'quotes@chubb.com', insurer_contact_id: null, insurer_name: 'Chubb' },
]

describe('cloneRows', () => {
  it('writes one pending placement request per dispatch with the reviewed text', () => {
    const rows = cloneRows(source, dispatches, { subject: '  Quotation request — Acme ', body: 'Dear Underwriter,\r\n\r\nPlease quote.\r\n' })
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r).toMatchObject({ status: 'pending', generated_by: 'placement', email_type: 'PLACEMENT_REQUEST', channel: 'email', thread_id: null })
      expect(r.subject).toBe('Quotation request — Acme')
      expect(r.body).toBe('Dear Underwriter,\n\nPlease quote.')
      expect(r.cc).toEqual(['ops@trade-risksol.com'])
    }
  })
  it("addresses each clone to its dispatch and falls back to the shared draft's contact", () => {
    const rows = cloneRows(source, dispatches, { subject: 's', body: 'b' })
    expect(rows[0]).toMatchObject({ to_email: 'benjamin.zhong@allianz.sg', contact_id: 'c-allianz' })
    expect(rows[1]).toMatchObject({ to_email: 'quotes@chubb.com', contact_id: 'c-first' })
  })
  it('copies no cc when the shared draft has none', () => {
    expect(cloneRows({ ...source, cc: null }, dispatches, { subject: 's', body: 'b' })[0].cc).toEqual([])
  })
})

describe('pairClones', () => {
  it('pairs inserted rows with dispatches by position', () => {
    expect(pairClones(dispatches, [{ id: 'n1' }, { id: 'n2' }])).toEqual([
      { draft_id: 'n1', dispatch_id: 'x1', to_email: 'Benjamin.Zhong@Allianz.sg', insurer_name: 'Allianz' },
      { draft_id: 'n2', dispatch_id: 'x2', to_email: 'quotes@chubb.com', insurer_name: 'Chubb' },
    ])
  })
  it('refuses a short insert rather than mispointing a dispatch', () => {
    expect(() => pairClones(dispatches, [{ id: 'n1' }])).toThrow(/1 drafts for 2 dispatches/)
  })
})
