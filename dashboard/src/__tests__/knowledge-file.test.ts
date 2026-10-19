import { describe, it, expect } from 'vitest'
import { headingCount, sectionFor, splitFile, wordCount } from '@/lib/marketing/knowledge-file'

const FILE = `# Business
Corp Cover is a Singapore commercial insurance brokerage for SMEs.
Operated by Trade Risk Solutions Pte Ltd, a registered insurance broker.

# Approved claims
Quotes from 5 or more insurers on every placement.

# Market, Singapore
Work Injury Compensation Act requires WICA cover for manual workers.
## Regulators
MAS licenses brokers.

# Market, Hong Kong
Employees' Compensation Ordinance requires EC insurance.

# Market, Thailand
Not a market yet, but the body is long enough to keep.

# Case studies
A logistics firm placed marine cargo cover across 3 insurers.

# Do not write
Never promise a premium figure.

# Public liability
Covers third-party injury and property damage claims against the business.

# Too short
tiny
`

describe('splitFile', () => {
  const blocks = splitFile(FILE)

  it('makes one block per `# ` heading and drops bodies under 10 characters', () => {
    expect(blocks.map(b => b.title)).toEqual([
      'Business', 'Approved claims', 'Market, Singapore', 'Market, Hong Kong', 'Market, Thailand', 'Case studies', 'Do not write', 'Public liability',
    ])
  })

  it('maps headings to sections', () => {
    expect(blocks.map(b => b.section)).toEqual(['business', 'claim', 'market', 'market', 'market', 'case_study', 'business', 'product'])
  })

  it('reads the market code after the comma', () => {
    expect(blocks[2].markets).toEqual(['SG'])
    expect(blocks[3].markets).toEqual(['HK'])
    expect(blocks[4].markets).toEqual([])
  })

  it('keeps `## ` subheadings inside the body', () => {
    expect(blocks[2].body).toContain('## Regulators')
    expect(blocks[2].body).toContain('MAS licenses brokers.')
  })

  it('trims the body and keeps every line under the heading', () => {
    expect(blocks[0].body).toBe('Corp Cover is a Singapore commercial insurance brokerage for SMEs.\nOperated by Trade Risk Solutions Pte Ltd, a registered insurance broker.')
  })

  it('ignores text before the first heading and empty headings', () => {
    expect(splitFile('preamble line that is long enough\n# \nbody under an empty heading\n# Business\nfacts here, ten plus')).toEqual([
      { section: 'business', title: 'Business', markets: [], body: 'facts here, ten plus' },
    ])
  })

  it('accepts CRLF line endings', () => {
    const out = splitFile('# Business\r\nline one is here\r\nline two\r\n# Approved claims\r\nclaim text here')
    expect(out).toHaveLength(2)
    expect(out[0].body).toBe('line one is here\nline two')
  })

  it('returns nothing for a file without headings', () => {
    expect(splitFile('just some text with no heading at all')).toEqual([])
  })

  it('caps the title at 200 characters', () => {
    const out = splitFile(`# ${'x'.repeat(300)}\nbody is long enough`)
    expect(out[0].title).toHaveLength(200)
  })
})

describe('sectionFor', () => {
  it('is case-insensitive', () => {
    expect(sectionFor('BUSINESS FACTS').section).toBe('business')
    expect(sectionFor('approved CLAIMS').section).toBe('claim')
    expect(sectionFor('Case Study: cargo').section).toBe('case_study')
    expect(sectionFor('Markets, malaysia')).toEqual({ section: 'market', title: 'Markets, malaysia', markets: ['MY'] })
    expect(sectionFor('Market, ID').markets).toEqual(['ID'])
  })

  it('renames the do-not-write block and files it under business', () => {
    expect(sectionFor('Do not write about competitors')).toEqual({ section: 'business', title: 'Do not write', markets: [] })
  })

  it('files everything else under product', () => {
    expect(sectionFor('Directors and officers').section).toBe('product')
  })
})

describe('counts', () => {
  it('counts words and `# ` headings only', () => {
    expect(wordCount('one two  three\n\nfour')).toBe(4)
    expect(headingCount(FILE)).toBe(9)
    expect(headingCount('# A\n## B\n#C\n# \n# D')).toBe(2)
    expect(headingCount('# A\r\n# B')).toBe(2)
  })
})
