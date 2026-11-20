import { describe, expect, it } from 'vitest'
import { markOlderDrafts, sameAsk } from './old-drafts'

const D = (id: string, createdAt: string, o: Partial<{ to: string; subject: string; body: string; threadId: string | null; anchorThreadId: string | null }> = {}) => ({
  id, createdAt, to: 'jenny@client.invalid', subject: 'Re: Request for Medical, Dental and GTL/GCI Insurance Quotations', body: 'We will obtain three quotations and prepare a comparison of premiums.',
  threadId: 't1', anchorThreadId: null, ...o,
})

describe('markOlderDrafts', () => {
  it('newest is Latest; older ones repeating the ask on the same thread and recipient are Older', () => {
    const m = markOlderDrafts([
      D('a', '2026-10-28T01:00:00Z', { subject: '(no subject)' }),
      D('b', '2026-11-02T01:00:00Z'),
      D('c', '2026-11-03T01:00:00Z', { subject: 'Re: CNMC — employee benefits', body: 'Thank you for your email. We will obtain three quotations for the medical and dental renewal and prepare a comparison of premiums.' }),
    ])
    expect(m.get('c')).toBe('latest')
    expect(m.get('b')).toBe('older')
    expect(m.get('a')).toBe('older')
  })
  it('a different recipient or thread is not the same ask', () => {
    const m = markOlderDrafts([D('a', '2026-11-01T00:00:00Z'), D('b', '2026-11-02T00:00:00Z', { to: 'other@client.invalid' }), D('c', '2026-11-03T00:00:00Z', { threadId: 't2' })])
    expect(m.size).toBe(0)
  })
  it('a different ask to the same person keeps both unmarked', () => {
    const m = markOlderDrafts([D('a', '2026-11-01T00:00:00Z', { subject: 'Claim 4471 documents', body: 'Please send the discharge summary and the receipts.' }), D('b', '2026-11-02T00:00:00Z')])
    expect(m.size).toBe(0)
  })
  it('recipient matched without case and display name; anchor thread counts', () => {
    const m = markOlderDrafts([D('a', '2026-11-01T00:00:00Z', { to: 'Jenny <JENNY@client.invalid>', threadId: null, anchorThreadId: 't1' }), D('b', '2026-11-02T00:00:00Z')])
    expect(m.get('a')).toBe('older')
  })
  it('sameAsk: similar subjects match, an empty subject matches', () => {
    expect(sameAsk({ subject: 'RE: Census for renewal', body: '' }, { subject: 'Census for renewal 2027', body: '' })).toBe(true)
    expect(sameAsk({ subject: '', body: 'x' }, { subject: 'Anything', body: 'y' })).toBe(true)
  })
})
