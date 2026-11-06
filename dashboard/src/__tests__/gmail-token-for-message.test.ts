/** A Gmail id belongs to one mailbox, and the thread's aliases do not say which: every mailbox is asked. */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/crm/db', async importOriginal => ({
  ...(await importOriginal<object>()),
  sbTry: async (path: string) => path.startsWith('email_messages') ? [{ thread_id: 't1', gmail_message_id: 'g1' }]
    : path.startsWith('email_thread_aliases') ? [{ mailbox: 'cheng@trade-risksol.com' }]
    : path.startsWith('gmail_mailboxes') ? [] : [],
}))
vi.mock('@/lib/gmail-send', () => ({ getGmailToken: async () => 'ops-token' }))

const { mailboxOrder, OPERATIONS_MAILBOX } = await import('@/lib/gmail/mailboxes')

describe('mailboxOrder', () => {
  it('tries the known mailboxes, then operations@, then every other mailbox, once each', () => {
    expect(mailboxOrder(['cheng@x', OPERATIONS_MAILBOX, 'cheng@x'], ['nathan@x', 'cheng@x'])).toEqual(['cheng@x', OPERATIONS_MAILBOX, 'nathan@x'])
  })
  it('a thread with no alias still reaches the personal mailboxes', () => {
    expect(mailboxOrder([], ['nathan@x'])).toEqual([OPERATIONS_MAILBOX, 'nathan@x'])
  })
})
