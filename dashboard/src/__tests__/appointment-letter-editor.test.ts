import { describe, it, expect } from 'vitest'
import { htmlBlocks, letterParts, letterProblems, templateHtml, letterFileName } from '@/lib/letters/appointment'

const base = { clientName: 'Example Pte Ltd', projectTitle: '', programme: 'insurance policies', date: '2026-11-04' }

describe('appointment letter editor', () => {
  it('reads the editor HTML into paragraphs and lists with bold, italic and underline', () => {
    const b = htmlBlocks('<p>We appoint <strong>Trade Risk Solutions</strong> for <u>our policies</u>.</p><ol><li>Public liability</li><li><em>WICA</em></li></ol><ul><li>Note</li></ul>')
    expect(b[0]).toEqual({ kind: 'p', runs: [{ text: 'We appoint ' }, { text: 'Trade Risk Solutions', b: true }, { text: ' for ' }, { text: 'our policies', u: true }, { text: '.' }] })
    expect(b.slice(1).map(x => [x.kind, x.ordered, x.n, x.runs.map(r => r.text).join('')])).toEqual([['li', true, 1, 'Public liability'], ['li', true, 2, 'WICA'], ['li', false, undefined, 'Note']])
    expect(b[2].runs[0].i).toBe(true)
  })
  it('starts from the template wording and falls back to it when the editor is emptied', () => {
    expect(templateHtml({ programme: 'insurance policies' })).toMatch(/with respect to the negotiation, placement and administration of our insurance policies\./)
    const p = letterParts({ ...base, bodyHtml: '<p><br></p>' })
    expect(p.blocks[0].runs[0].text).toMatch(/^This is to confirm that with immediate effect/)
  })
  it('lists the group entities and keeps the letterhead choice', () => {
    const p = letterParts({ ...base, entities: ['A Pte Ltd', ' ', 'B Sdn Bhd'], letterhead: 'trs' })
    expect(p.entities).toEqual(['A Pte Ltd', 'B Sdn Bhd'])
    expect(p.letterhead).toBe('trs')
    expect(letterParts(base).letterhead).toBe('client')
  })
  it('the project line is optional; the programme is needed unless the text was edited', () => {
    expect(letterProblems(base)).toEqual([])
    expect(letterProblems({ ...base, programme: '' })).toEqual(['Enter the insurance programme.'])
    expect(letterProblems({ ...base, programme: '', bodyHtml: '<p>Our own wording.</p>' })).toEqual([])
    expect(letterFileName(base, 'pdf')).toBe('Letter of Broker Appointment - Example Pte Ltd.pdf')
  })
})
