import { describe, it, expect } from 'vitest'
import { TRS_ADDRESSEE, htmlBlocks, letterLogo, letterParts, letterProblems, templateHtml, letterFileName } from '@/lib/letters/appointment'
import { imageSize } from '@/lib/letters/appointment-server'

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
  it('lists the group entities', () => {
    expect(letterParts({ ...base, entities: ['A Pte Ltd', ' ', 'B Sdn Bhd'] }).entities).toEqual(['A Pte Ltd', 'B Sdn Bhd'])
  })
  it('the client letterhead stays blank unless a logo or address is given', () => {
    const p = letterParts(base)
    expect(p.clientLogo).toBeNull()
    expect(p.clientAddress).toEqual([])
    expect(p.addressee).toEqual(TRS_ADDRESSEE)
    const q = letterParts({ ...base, clientLogo: 'data:image/png;base64,iVBORw0KGgo=', clientAddress: ['1 Example Road', ' ', 'Singapore 123456'], addressee: ['Trade Risk Solutions Pte. Ltd.', 'Attn: Nathan'] })
    expect(q.clientLogo).toMatch(/^data:image\/png/)
    expect(q.clientAddress).toEqual(['1 Example Road', 'Singapore 123456'])
    expect(q.addressee).toEqual(['Trade Risk Solutions Pte. Ltd.', 'Attn: Nathan'])
  })
  it('accepts only a PNG or JPEG data URL under the size limit as the logo', () => {
    expect(letterLogo('data:image/jpeg;base64,/9j/4AAQ')).not.toBeNull()
    expect(letterLogo('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull()
    expect(letterLogo('https://example.com/logo.png')).toBeNull()
    expect(letterLogo(`data:image/png;base64,${'A'.repeat(900_000)}`)).toBeNull()
  })
  it('reads a PNG size for the Word image', () => {
    const png = Buffer.alloc(32); png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(400, 16); png.writeUInt32BE(120, 20)
    expect(imageSize(png)).toEqual({ w: 400, h: 120 })
    expect(imageSize(Buffer.from('not an image'))).toBeNull()
  })
  it('the project line is optional; the programme is needed unless the text was edited', () => {
    expect(letterProblems(base)).toEqual([])
    expect(letterProblems({ ...base, programme: '' })).toEqual(['Enter the insurance programme.'])
    expect(letterProblems({ ...base, programme: '', bodyHtml: '<p>Our own wording.</p>' })).toEqual([])
    expect(letterFileName(base, 'pdf')).toBe('Letter of Broker Appointment - Example Pte Ltd.pdf')
  })
})
