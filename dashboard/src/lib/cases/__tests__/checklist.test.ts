import { describe, it, expect } from 'vitest'
import { caseLine, checklistLine, checklistState, cleanItem, fileMatches, findFile, lineName, type Call, type ChecklistItem } from '../checklist'
import type { SourceMessage } from '../sources'

const item = (o: Partial<ChecklistItem> & { id: string; label: string }): ChecklistItem => ({ line: 'employee_benefits', found_by: 'file', doc_types: [], words: [], position: 0, active: true, ...o })
const census = item({ id: 'i1', label: 'Census', doc_types: ['member_list'], position: 1 })
const premium = item({ id: 'i2', label: 'Last year’s premium', doc_types: ['insurer_debit_note'], words: ['premium'], position: 2 })
const wish = item({ id: 'i3', label: 'Client wish list', found_by: 'wish', position: 3 })
const workshop = item({ id: 'i4', label: 'Workshop requirement', found_by: 'person', position: 4 })
const msg = (id: string, sent_at: string, files: string[], thread_id = 't1'): SourceMessage => ({ id, thread_id, direction: 'inbound', from_address: 'hr@orchard-foods.example', subject: 'Renewal', body_text: '', sent_at, files })
const messages = [
  msg('m1', '2026-11-01T02:00:00Z', ['Employee Census 2026.xlsx', 'image001.png']),
  msg('m2', '2026-11-04T02:00:00Z', ['Census update Nov.xlsx', 'Premium summary 2025.pdf']),
]
const call = (o: Partial<Call> & { item_id: string }): Call => ({ status: null, message_id: null, filename: null, found: false, rejected: [], actor: 'nathan@trade-risksol.com', at: '2026-11-10T02:00:00Z', ...o })

describe('the list a line uses', () => {
  it('puts the group health and personal accident lines on the Employment Benefits list', () => {
    expect(checklistLine('group_health')).toBe('employee_benefits')
    expect(checklistLine('group_personal_accident')).toBe('employee_benefits')
    expect(checklistLine('wica')).toBe('wica')
    expect(checklistLine(null)).toBeNull()
    expect(lineName('group_health')).toBe('Employment Benefits')
  })
  it('takes a person’s choice, then the policy, then the title', () => {
    expect(caseLine({ chosen: 'wica', policyLine: 'do', title: 'Fleet renewal' })).toEqual({ line: 'wica', by: 'person' })
    expect(caseLine({ policyLine: 'do', title: 'Fleet renewal' })).toEqual({ line: 'do', by: 'policy' })
    expect(caseLine({ policyClass: 'Work Injury Compensation', title: 'Fleet renewal' })).toEqual({ line: 'wica', by: 'policy' })
    expect(caseLine({ title: 'Group hospital renewal 2027' })).toEqual({ line: 'group_health', by: 'title' })
    expect(caseLine({ chosen: 'not-a-line', title: 'Annual catch-up' })).toBeNull()
  })
})

describe('cleanItem', () => {
  it('keeps a file item with a type or a word', () => {
    expect(cleanItem({ label: '  Vehicle   list ', words: ['Fleet', 'fleet', ' Log Card '] })).toEqual({ item: { label: 'Vehicle list', found_by: 'file', doc_types: [], words: ['fleet', 'log card'] } })
  })
  it('drops types and words from an item a file cannot tick', () => {
    expect(cleanItem({ label: 'Workshop requirement', found_by: 'person', doc_types: ['member_list'], words: ['workshop'] })).toEqual({ item: { label: 'Workshop requirement', found_by: 'person', doc_types: [], words: [] } })
  })
  it('refuses a nameless item, an unknown type, a short word, and a file item with nothing to match', () => {
    expect(cleanItem({ label: ' ' })).toEqual({ error: 'Name the document.' })
    expect(cleanItem({ label: 'x'.repeat(81), words: ['census'] })).toEqual({ error: 'Keep the name under 80 characters.' })
    expect(cleanItem({ label: 'Census', doc_types: ['spreadsheet'] })).toEqual({ error: 'Unknown document type.' })
    expect(cleanItem({ label: 'Census', words: ['hr'] })).toEqual({ error: 'A word is 3 to 40 characters.' })
    expect(cleanItem({ label: 'Census', words: Array.from({ length: 9 }, (_, i) => `word${i}`) })).toEqual({ error: 'At most 8 words.' })
    expect(cleanItem({ label: 'Census' })).toEqual({ error: 'Choose a document type or a word a file name carries.' })
  })
})

describe('finding a file', () => {
  it('matches a document type or a word at the start of a word in the file name', () => {
    expect(fileMatches(census, 'Employee Census 2026.xlsx')).toBe(true)
    expect(fileMatches(premium, 'Premium summary 2025.pdf')).toBe(true)
    expect(fileMatches(premium, 'supremium.pdf')).toBe(false)
    expect(fileMatches(census, 'image001.png')).toBe(false)
  })
  it('takes the newest file and passes over a finding a person turned down', () => {
    expect(findFile(census, messages)).toMatchObject({ message_id: 'm2', filename: 'Census update Nov.xlsx', thread_id: 't1' })
    expect(findFile(census, messages, [{ message_id: 'm2', filename: 'Census update Nov.xlsx' }])).toMatchObject({ message_id: 'm1', filename: 'Employee Census 2026.xlsx' })
    expect(findFile(wish, messages)).toBeNull()
  })
})

describe('checklistState', () => {
  const items = [workshop, wish, premium, census, item({ id: 'i9', label: 'Retired', words: ['census'], active: false })]
  it('lists active items in order: found by file, by wish, or missing', () => {
    const s = checklistState(items, [], messages, true)
    expect(s.rows.map(r => [r.label, r.state])).toEqual([['Census', 'found'], ['Last year’s premium', 'found'], ['Client wish list', 'found'], ['Workshop requirement', 'missing']])
    expect(s).toMatchObject({ ticked: 3, confirmed: 0, total: 4, complete: false })
    expect(checklistState(items, [], [], false).ticked).toBe(0)
  })
  it('lets a person’s call stand over what code finds', () => {
    const s = checklistState(items, [
      call({ item_id: 'i1', status: 'confirmed', message_id: 'm1', filename: 'Employee Census 2026.xlsx', found: true }),
      call({ item_id: 'i2', status: 'not_needed' }),
      call({ item_id: 'i4', status: 'confirmed' }),
    ], messages, true)
    expect(s.rows.map(r => r.state)).toEqual(['confirmed', 'not_needed', 'found', 'confirmed'])
    expect(s.rows[0].file).toMatchObject({ message_id: 'm1', filename: 'Employee Census 2026.xlsx' })
    expect(s.rows[1].file).toBeNull()
    expect(s.rows[3]).toMatchObject({ file: null, actor: 'nathan@trade-risksol.com' })
    expect(s).toMatchObject({ ticked: 4, confirmed: 3, complete: true })
  })
  it('shows the next file, or Missing, once a finding is turned down', () => {
    const one = checklistState([census], [call({ item_id: 'i1', rejected: [{ message_id: 'm2', filename: 'Census update Nov.xlsx' }] })], messages, false)
    expect(one.rows[0]).toMatchObject({ state: 'found', file: { message_id: 'm1' } })
    const none = checklistState([census], [call({ item_id: 'i1', rejected: [{ message_id: 'm2', filename: 'Census update Nov.xlsx' }, { message_id: 'm1', filename: 'Employee Census 2026.xlsx' }] })], messages, false)
    expect(none.rows[0]).toMatchObject({ state: 'missing', file: null })
    expect(none.complete).toBe(false)
  })
  it('is never complete with nothing on the list', () => {
    expect(checklistState([], [], messages, true)).toMatchObject({ total: 0, complete: false })
  })
})
