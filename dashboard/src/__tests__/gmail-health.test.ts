/** The mailbox check that replaced the browser's 90-second Gmail poll. */
import { describe, it, expect } from 'vitest'
import { mailboxProblems } from '@/lib/gmail/health'

const monday = new Date('2026-11-10T06:00:00Z')   // Tue 10 Nov, 14:00 SGT, a working day (Mon 9 Nov is Deepavali)
const box = { email: 'n@trade-risksol.com', status: 'active', watch_expiration: '2026-11-14T04:29:39Z', last_ingest_at: '2026-11-10T05:30:00Z' }

describe('mailboxProblems', () => {
  it('a healthy mailbox has none', () => { expect(mailboxProblems(box, monday)).toEqual([]) })
  it('a subscription lapsing within a day', () => { expect(mailboxProblems({ ...box, watch_expiration: '2026-11-10T20:00:00Z' }, monday)[0]).toMatch(/lapses within a day/) })
  it('a lapsed subscription', () => { expect(mailboxProblems({ ...box, watch_expiration: '2026-11-09T20:00:00Z' }, monday)[0]).toMatch(/lapsed/) })
  it('no mail in 24 hours on a working afternoon', () => { expect(mailboxProblems({ ...box, last_ingest_at: '2026-11-08T05:00:00Z' }, monday)[0]).toMatch(/no email received/) })
  it('quiet on a Sunday is not a problem', () => { expect(mailboxProblems({ ...box, last_ingest_at: '2026-11-06T05:00:00Z' }, new Date('2026-11-08T06:00:00Z'))).toEqual([]) })
  it('a disconnected mailbox is not checked', () => { expect(mailboxProblems({ ...box, status: 'revoked', watch_expiration: null }, monday)).toEqual([]) })
})
