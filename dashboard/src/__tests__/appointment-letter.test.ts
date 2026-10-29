import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { isBrokerBlock, letterFileName, letterParts, letterProblems, letterStatus } from '@/lib/letters/appointment'
import { buildAppointmentDocx } from '@/lib/letters/appointment-server'

const chec = { clientName: 'China Harbour Engineering Company Ltd (Singapore Branch)', projectTitle: 'Proposed residential development at Stevens Road (Newton Planning Area)', programme: "Contractor's All Risks and Public Liability insurance for the Stevens Road project.", date: '2026-10-29' }

describe('appointment letter', () => {
  it("keeps TRS's wording and fills the programme", () => {
    const p = letterParts(chec)
    expect(p.title).toBe('Appointment of Insurance Broker')
    expect(p.date).toBe('29 October 2026')
    expect(p.body[0]).toBe("This is to confirm that with immediate effect, we have appointed Trade Risk Solutions Pte. Ltd. as our insurance broker with respect to negotiation, placement and administration of our Contractor's All Risks and Public Liability insurance for the Stevens Road project.")
    expect(p.body[1]).toBe('This letter and the authority contained herein shall remain in full force until cancelled by us in writing.')
    expect(p.name).toBe('[Name]')
  })
  it('says what is missing', () => {
    expect(letterProblems({ clientName: 'X', date: '2026-10-29' })).toEqual(['Enter the project title.', 'Enter the insurance programme.'])
    expect(letterProblems(chec)).toEqual([])
  })
  it('names the file by client and project', () => {
    expect(letterFileName(chec, 'pdf')).toMatch(/^Letter of Broker Appointment - China Harbour Engineering Company Ltd \(Singapore Branch\) - Proposed residential development at Stevens Road.*\.pdf$/)
  })
  it.each([
    ['We have already quoted this risk through another broker.', true],
    ['Unfortunately the market is blocked; please provide a BOR.', true],
    ['Risk was previously submitted by another broker, unable to quote', true],
    ['We decline as construction is outside our appetite.', false],
  ])('reads "%s" as a broker block: %s', (t, v) => expect(isBrokerBlock(t)).toBe(v))
  it('works out the status from the data room', () => {
    const d = (o: object) => ({ id: 'x', doc_type: 'broker_appointment', source: 'generated', status: 'filed', received_at: '2026-10-15T00:00:00Z', created_at: '2026-10-15T00:00:00Z', drive_url: 'u', ...o })
    expect(letterStatus([], false).state).toBe('needed')
    expect(letterStatus([], true).state).toBe('none')
    expect(letterStatus([d({})], false).state).toBe('sent')
    expect(letterStatus([d({}), d({ id: 's', source: 'upload', received_at: '2026-10-20T00:00:00Z' })], false)).toMatchObject({ state: 'signed', documentId: 's' })
  })
  it('builds a Word file with the letter text', async () => {
    const buf = await buildAppointmentDocx(chec)
    const zip = await JSZip.loadAsync(buf)
    const doc = await zip.file('word/document.xml')!.async('string')
    expect(doc).toContain('Appointment of Insurance Broker')
    expect(doc).toContain('Re: Proposed residential development at Stevens Road')
    expect(doc).toContain('Contractor&apos;s All Risks'.replace('&apos;', "'"))
  })
})
