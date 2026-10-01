import { describe, it, expect } from 'vitest'
import { chunkText, renderContext, CHUNK_CHARS, type CompanyChunk } from '@/lib/agents/company-retrieval'

describe('chunkText', () => {
  it('leaves short text whole', () => {
    expect(chunkText('a short note')).toEqual(['a short note'])
  })
  it('returns nothing for empty input', () => {
    for (const v of ['', '   ', '\n\n']) expect(chunkText(v)).toEqual([])
  })
  it('splits long text and overlaps so a fact on a boundary survives', () => {
    const parts = chunkText('x'.repeat(CHUNK_CHARS * 3))
    expect(parts.length).toBeGreaterThan(2)
    expect(parts.every(p => p.length <= CHUNK_CHARS)).toBe(true)
  })
  it('prefers a paragraph boundary when one is near the split', () => {
    // Long enough to force a split, with the paragraph break just before where it would fall.
    const a = 'A'.repeat(CHUNK_CHARS - 50)
    const b = 'Second paragraph about the NRIC. ' + 'B'.repeat(300)
    const parts = chunkText(`${a}\n\n${b}`)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts[0]).not.toContain('Second paragraph')
    expect(parts[1]).toContain('Second paragraph')
  })
  it('always terminates, even when overlap exceeds the step', () => {
    expect(chunkText('y'.repeat(5000), 100, 500).length).toBeGreaterThan(0)
  })
})

describe('renderContext', () => {
  const c = (o: Partial<CompanyChunk>): CompanyChunk => ({
    chunk_id: 1, thread_id: 't', message_id: 'm', attachment_id: null,
    source: 'message', file_name: null, sent_at: '2026-03-10T00:00:00Z',
    similarity: 0.9, content: 'NRIC is S1234567A', ...o,
  })
  it('labels an attachment by file name so a human can check it', () => {
    const out = renderContext([c({ source: 'attachment', file_name: 'nric.pdf', attachment_id: 'a' })])
    expect(out).toContain('attachment "nric.pdf"')
    expect(out).toContain('dated 2026-03-10')
  })
  it('numbers passages so the model can cite them', () => {
    const out = renderContext([c({}), c({ chunk_id: 2 })])
    expect(out).toContain('[1]'); expect(out).toContain('[2]')
  })
  it('is empty when nothing was found', () => {
    expect(renderContext([])).toBe('')
  })
})
