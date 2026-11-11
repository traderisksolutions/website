import { describe, expect, it } from 'vitest'
import { censusAmong } from '@/lib/chief/suggest'

const sheet = [
  'Sheet: Census',
  'Name of Company: OUE Group',
  'Name,Date of Birth,Gender,Relationship,Plan',
  'Tan Ah Kow,12/03/1980,M,Employee,1',
  'Lim Bee Hoon,01/07/1975,F,Employee,2',
  'Lee Siew Mei,23/11/1990,F,Spouse,2',
].join('\n')

const att = (id: string, messageId: string, filename: string, created: string, text: string | null = sheet) =>
  ({ thread_id: 't1', message_id: messageId, filename, mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size_bytes: 85251, parsed_text: text, created_at: created })

describe('censusAmong', () => {
  it('one file however many copies and forwards carry it', () => {
    const atts = [
      att('a', 'm1', 'Member Census - OUE Group.xlsx', '2026-11-03T08:58:00Z'),
      att('b', 'm2', 'Member Census - OUE Group (1).xlsx', '2026-11-04T07:56:00Z', null),
      att('c', 'm3', '[OUE Group] Member Census.xlsx', '2026-11-04T08:07:00Z'),
      att('d', 'm4', '[OUE Group] Member Census.xlsx', '2026-11-05T03:21:00Z', null),
    ]
    const c = censusAmong(atts, new Set(['m1', 'm2', 'm3', 'm4']))
    expect(c).toMatchObject({ rows: 3, company: 'OUE Group', filename: 'Member Census - OUE Group.xlsx' })
  })
  it('reads the text from a copy when the live message carries none', () => {
    const atts = [att('a', 'm1', 'Census.xlsx', '2026-11-03T08:58:00Z', null), att('b', 'm2', 'Census.xlsx', '2026-11-04T08:07:00Z')]
    expect(censusAmong(atts, new Set(['m1']))).toMatchObject({ messageId: 'm1', rows: 3 })
  })
  it('nothing without a live inbound message or without members', () => {
    expect(censusAmong([att('a', 'm1', 'Census.xlsx', '2026-11-03T08:58:00Z')], new Set())).toBeNull()
    expect(censusAmong([att('a', 'm1', 'Rates.xlsx', '2026-11-03T08:58:00Z', 'Sheet: Rates\nPlan,Premium\n1,100')], new Set(['m1']))).toBeNull()
  })
})
