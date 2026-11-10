import { describe, expect, it } from 'vitest'
import { canSeeThread, inMailbox, isShared, personalMailboxes, OPERATIONS_MAILBOX } from '@/lib/mail/visibility'

const NATHAN = 'nathan.budiutomo@trade-risksol.com'
const CHENG = 'chengsou.tan@trade-risksol.com'
const HASYA = 'hasya@trade-risksol.com'

describe('thread visibility', () => {
  it('a thread with no recorded mailbox is the team’s', () => {
    expect(isShared([])).toBe(true)
    expect(canSeeThread(HASYA, [])).toBe(true)
  })
  it('a thread operations@ holds is the team’s, whoever else holds it', () => {
    expect(canSeeThread(HASYA, [NATHAN, OPERATIONS_MAILBOX])).toBe(true)
    expect(canSeeThread(HASYA, ['Operations@Trade-RiskSol.com'])).toBe(true)
  })
  it('a thread only in Nathan’s mailbox is Nathan’s and operations@’s', () => {
    expect(canSeeThread(NATHAN, [NATHAN])).toBe(true)
    expect(canSeeThread('Nathan.Budiutomo@trade-risksol.com', [NATHAN])).toBe(true)
    expect(canSeeThread(OPERATIONS_MAILBOX, [NATHAN])).toBe(true)
    expect(canSeeThread(CHENG, [NATHAN])).toBe(false)
    expect(canSeeThread(HASYA, [NATHAN])).toBe(false)
    expect(canSeeThread('developer@trade-risksol.com', [NATHAN])).toBe(false)
  })
  it('a thread both Nathan and Cheng received, without operations@, is theirs', () => {
    expect(canSeeThread(NATHAN, [NATHAN, CHENG])).toBe(true)
    expect(canSeeThread(CHENG, [NATHAN, CHENG])).toBe(true)
    expect(canSeeThread(HASYA, [NATHAN, CHENG])).toBe(false)
  })
  it('a cron or secret call sees everything', () => {
    expect(canSeeThread(null, [NATHAN])).toBe(true)
    expect(canSeeThread(undefined, [CHENG])).toBe(true)
  })
})

describe('mailbox pill', () => {
  it('"all" keeps everything; "operations" keeps the team’s; an address keeps that person’s', () => {
    expect(inMailbox('all', [NATHAN])).toBe(true)
    expect(inMailbox('operations', [])).toBe(true)
    expect(inMailbox('operations', [NATHAN, OPERATIONS_MAILBOX])).toBe(true)
    expect(inMailbox('operations', [NATHAN])).toBe(false)
    expect(inMailbox(NATHAN, [NATHAN])).toBe(true)
    expect(inMailbox(NATHAN, [NATHAN, OPERATIONS_MAILBOX])).toBe(true)
    expect(inMailbox(NATHAN, [CHENG])).toBe(false)
  })
  it('lists the personal mailboxes among the visible threads, sorted, without operations@', () => {
    expect(personalMailboxes([{ mailboxes: [NATHAN, OPERATIONS_MAILBOX] }, { mailboxes: [CHENG] }, { mailboxes: [] }, {}])).toEqual([CHENG, NATHAN])
  })
})
