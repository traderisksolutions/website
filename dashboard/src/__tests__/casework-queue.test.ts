import { describe, it, expect } from 'vitest'
import { laneOf, signAs, waitingAfterSend } from '@/lib/casework/queue'

describe('laneOf', () => {
  it('puts a decision before a ready draft, and waits last', () => {
    expect(laneOf({ status: 'trs_to_act', needs_human: 'Approve payee', draft: {} })).toBe('decide')
    expect(laneOf({ status: 'stalled', needs_human: null, draft: {} })).toBe('send')
    expect(laneOf({ status: 'trs_to_act', needs_human: null, draft: null })).toBe('act')
    expect(laneOf({ status: 'waiting_insurer', needs_human: null, draft: null })).toBe('waiting')
  })
})

describe('signAs', () => {
  it('fills every signature placeholder with the approver', () => {
    expect(signAs('Dear Lisa,\n\nBest regards,\n{owner_name}', 'Cheng Sou Tan')).toBe('Dear Lisa,\n\nBest regards,\nCheng Sou Tan')
    expect(signAs('{owner_name}', '  ')).toBe('Trade Risk Solutions')
  })
})

describe('waitingAfterSend', () => {
  it('waits on the insurer when any recipient is one, else on the client', () => {
    const insurers = new Set(['qbe.com', 'ihp.com.sg'])
    expect(waitingAfterSend(['claims@ihp.com.sg', 'hr@client.sg'], insurers)).toBe('waiting_insurer')
    expect(waitingAfterSend(['lisa.daly@celavi.com'], insurers)).toBe('waiting_client')
  })
})
