import { describe, expect, it } from 'vitest'
import { snippetOf, subjectNames } from '@/lib/nexus/company-view'

describe('subjectNames', () => {
  it('finds the client in an insurer thread subject', () => {
    expect(subjectNames('RE: (TRS) Zurich - CHEC Stevens Rd GPA', 'CHEC SG')).toBe(true)
    expect(subjectNames('RE: (TRS) Zurich- JGC Asia WIC', 'JGC ASIA PACIFIC PTE. LTD.')).toBe(true)
  })
  it('does not match a word that merely starts the same', () => {
    expect(subjectNames('Checkpoint review', 'CHEC SG')).toBe(false)
  })
})

describe('snippetOf', () => {
  it('keeps the reply and drops the quoted history', () => {
    expect(snippetOf('Dear Nathan,\nPlease see attached.\n\nFrom: Nathan\nSent: Monday')).toBe('Dear Nathan, Please see attached.')
  })
  it('clips long text', () => {
    expect(snippetOf('x'.repeat(300), 20)).toHaveLength(20)
  })
})
