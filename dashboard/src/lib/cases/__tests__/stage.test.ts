import { describe, it, expect } from 'vitest'
import { stageFromRecords, lineStage, startPointFor, STAGES, type LineFacts, type StageFacts } from '../stage'

const line = (o: Partial<LineFacts> = {}): LineFacts => ({ status: 'open', dispatchesSent: 0, dispatchesDrafted: 0, quotes: 0, ...o })
const facts = (o: Partial<StageFacts> = {}): StageFacts => ({ lines: [], documentsComplete: true, debitNote: false, paid: false, status: 'trs_to_act', stored: null, ...o })

describe('stage', () => {
  it('has the nine stages in order', () => {
    expect(STAGES).toEqual(['request', 'data_complete', 'sent_to_insurers', 'terms_received', 'comparison_sent', 'client_decides', 'bind', 'policy_and_dn', 'paid'])
  })

  it('walks one line through every stage from its records', () => {
    const f = { documentsComplete: true, status: 'waiting_insurer' }
    expect(lineStage(line(), f)).toBe('request')
    expect(lineStage(line({ status: 'quoting', dispatchesDrafted: 3 }), f)).toBe('data_complete')
    expect(lineStage(line({ status: 'quoting', dispatchesSent: 3 }), f)).toBe('sent_to_insurers')
    expect(lineStage(line({ status: 'quoting', dispatchesSent: 3, quotes: 1 }), f)).toBe('terms_received')
    expect(lineStage(line({ status: 'quoted' }), f)).toBe('terms_received')
    expect(lineStage(line({ status: 'presented' }), { documentsComplete: true, status: 'waiting_client' })).toBe('comparison_sent')
    expect(lineStage(line({ status: 'presented' }), { documentsComplete: true, status: 'trs_to_act' })).toBe('client_decides')
    expect(lineStage(line({ status: 'bound' }), f)).toBe('bind')
    expect(lineStage(line({ status: 'done' }), f)).toBe('policy_and_dn')
  })

  it('a quoting line with documents outstanding is still a request', () => {
    expect(lineStage(line({ status: 'quoting' }), { documentsComplete: false, status: null })).toBe('request')
  })

  it('takes the least advanced live line, ignoring declined and dropped lines', () => {
    expect(stageFromRecords(facts({ lines: [line({ status: 'bound' }), line({ status: 'quoting', dispatchesSent: 2 }), line({ status: 'declined' })] }))).toBe('sent_to_insurers')
    expect(stageFromRecords(facts({ lines: [line({ status: 'bound' }), line({ status: 'dropped' })] }))).toBe('bind')
  })

  it('money closes the case: a debit note after bind, then payment', () => {
    expect(stageFromRecords(facts({ lines: [line({ status: 'bound' })], debitNote: true }))).toBe('policy_and_dn')
    expect(stageFromRecords(facts({ lines: [line({ status: 'quoting', dispatchesSent: 1 })], debitNote: true }))).toBe('sent_to_insurers')
    expect(stageFromRecords(facts({ debitNote: true, paid: true }))).toBe('paid')
    expect(stageFromRecords(facts({ debitNote: true }))).toBe('policy_and_dn')
  })

  it('with no placement the stored stage stands, defaulting to request', () => {
    expect(stageFromRecords(facts({ stored: 'terms_received' }))).toBe('terms_received')
    expect(stageFromRecords(facts())).toBe('request')
  })

  it('names the start point', () => {
    expect(startPointFor({ caseType: 'renewal' })).toBe('renewal')
    expect(startPointFor({ caseType: 'new_quote', openedMode: 'from_forward' })).toBe('midway')
    expect(startPointFor({ caseType: 'new_quote', openedMode: 'normal' })).toBe('new_request')
    expect(startPointFor({ caseType: 'claim', openedMode: 'normal' })).toBeNull()
  })
})
