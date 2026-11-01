import { describe, it, expect } from 'vitest'
import { readHistory, parseLooseDate, parseWrote, filesNamed, normaliseBody, addressesIn } from '../history'
import * as F from './fixtures'

describe('readHistory — forwards', () => {
  it('reads a Gmail forward with mailto duplicates and a wrapped Cc', () => {
    const h = readHistory(F.GMAIL_FORWARD, 'Fwd: Re: (TRS) Acme Services - PII')
    expect(h.top).toContain('Please see the thread below')
    expect(h.top).not.toContain('Forwarded message')
    expect(h.messages).toHaveLength(1)
    const m = h.messages[0]
    expect(m.origin).toBe('forward')
    expect(m.fromAddress).toBe('robin.ong@trade-risksol.com')
    expect(m.fromName).toBe('Robin Ong')
    expect(m.to).toEqual(['jamie@acme-example.com.sg'])
    expect(m.cc).toEqual(['ernest.tan@trade-risksol.com', 'sam.wong@trade-risksol.com'])
    expect(m.subject).toBe('Re: (TRS) Acme Services - PII')
    expect(m.sentAt).toBe('2025-11-04T00:54:00.000Z')
    expect(m.body).toContain('renewal proposal form')
  })

  it('splits two forwarded emails, newest first, oldest at position 0', () => {
    const h = readHistory(F.CLIENT_FORWARDS_TWO, 'Fwd: Damage at Harbourfront unit')
    expect(h.messages).toHaveLength(2)
    const [newer, older] = h.messages
    expect(newer.position).toBe(1)
    expect(older.position).toBe(0)
    expect(newer.sentAt).toBe('2026-09-22T02:15:00.000Z')
    expect(older.sentAt).toBe('2026-09-21T09:40:00.000Z')
    expect(older.cc).toEqual(['chris.goh@acme-retail.example'])
    expect(newer.body).toContain('2026-F1234567-BFP')
    expect(newer.body).not.toContain('Water leaked')
    expect(older.body).toContain('Water leaked')
    expect(newer.attachmentsNamed).toEqual(['Repair quotation HF-0922.pdf'])
    expect(older.attachmentsNamed).toEqual(['IMG_2041.jpg', 'IMG_2042.jpg'])
    expect(h.messages.every(m => m.origin === 'forward')).toBe(true)
  })

  it('reads Apple Mail "Begin forwarded message" with a zone', () => {
    const h = readHistory(F.APPLE_FORWARD, 'Fwd: Example (HK) Limited - New registration')
    expect(h.messages).toHaveLength(1)
    const m = h.messages[0]
    expect(m.origin).toBe('forward')
    expect(m.fromAddress).toBe('morgan.kwan@insurer-example.com')
    expect(m.sentAt).toBe('2026-10-21T03:40:35.000Z')
    expect(m.cc).toEqual(['dana.ho@insurer-example.com'])
    expect(m.body).toContain('Please provide the following documents.')
  })

  it('reads a forward with blank lines between every header line', () => {
    const h = readHistory(F.SPACED_FORWARD, 'Fwd: Block 7 - Performance Bond')
    expect(h.messages).toHaveLength(1)
    const m = h.messages[0]
    expect(m.fromAddress).toBe('quinn@example-water.com')
    expect(m.subject).toBe('Block 7 - Performance Bond')
    expect(m.sentAt).toBe('2026-10-07T05:27:00.000Z')
    expect(m.body).toContain('Spoken and attach docs')
  })
})

describe('readHistory — quoted history', () => {
  it('reads Outlook "Original Message" with an ISO date', () => {
    const h = readHistory(F.OUTLOOK_ORIGINAL, 'Re: Re: Re : Example Trader Group Pte Ltd - Renewal')
    expect(h.top).toContain('We confirm the renewal')
    expect(h.messages).toHaveLength(1)
    const m = h.messages[0]
    expect(m.origin).toBe('quoted')
    expect(m.fromAddress).toBe('catherine.lim@trade-risksol.com')
    expect(m.sentAt).toBe('2026-10-15T04:44:00.000Z')
    expect(m.to).toEqual(['victor.li@example-gas.com'])
    expect(m.cc).toContain('operations@trade-risksol.com')
    expect(m.cc).toContain('nora.teo@example-trader.sg')
    expect(m.subject).toContain('WC-0001234')
  })

  it('reads a Gmail "wrote:" line wrapped over two lines and strips the quote marks', () => {
    const h = readHistory(F.GMAIL_QUOTED, 'Re: (TRS) WIC Renewal')
    expect(h.top).toContain('Please proceed with the renewal')
    expect(h.messages).toHaveLength(1)
    const m = h.messages[0]
    expect(m.fromAddress).toBe('sam.wong@trade-risksol.com')
    expect(m.fromName).toBe('Sam Wong')
    expect(m.sentAt).toBe('2026-10-14T01:51:00.000Z')
    expect(m.body.startsWith('Hi Max,')).toBe(true)
    expect(m.body).not.toContain('>')
  })

  it('reads an Outlook block with bold labels inside >> quoting', () => {
    const h = readHistory(F.NESTED_OUTLOOK, 'Re: (TRS) Example School - WIC Renewal 2026')
    expect(h.messages).toHaveLength(1)
    const m = h.messages[0]
    expect(m.fromAddress).toBe('sam.wong@trade-risksol.com')
    expect(m.to).toEqual(['wendy.seah@example-mail.com'])
    expect(m.cc).toEqual(['robin.ong@trade-risksol.com', 'operations@trade-risksol.com'])
    expect(m.subject).toBe('Re: (TRS) Example School - WIC Renewal 2026')
    expect(m.sentAt).toBe('2026-10-08T01:13:44.000Z')
    expect(m.body).toContain('May I follow up')
  })

  it('reads Chinese header labels', () => {
    const h = readHistory(F.CHINESE_HEADERS, 'Re: Re: Re: Pending Director Acceptance')
    expect(h.messages).toHaveLength(1)
    const m = h.messages[0]
    expect(m.fromAddress).toBe('catherine.lim@trade-risksol.com')
    expect(m.to).toEqual(['ivy@example-logistics.cn'])
    expect(m.cc).toEqual(['operations@trade-risksol.com'])
    expect(m.sentAt).toBe('2026-09-18T09:12:00.000Z')
    expect(m.body).toContain('Kindly sign')
  })

  it('reads an Outlook web "Received:" line as the date', () => {
    const h = readHistory(F.OUTLOOK_RECEIVED, 'FW: Enquiry on Claim Payment')
    expect(h.messages).toHaveLength(1)
    expect(h.messages[0].fromAddress).toBe('low.kai@example-civil.com')
    expect(h.messages[0].fromName).toBe('LOW KAI')
    expect(h.messages[0].sentAt).toBe('2026-10-19T03:56:58.000Z')
  })

  it('does not take "From:" and "Date:" in running text for a header', () => {
    const h = readHistory(F.NOT_A_HEADER, 'Vehicle list')
    expect(h.messages).toHaveLength(0)
    expect(h.top).toContain('vehicle list is final')
  })

  it('returns the whole body as top when there is no history', () => {
    const h = readHistory('Hello\n\nJust one line.', 'Hi')
    expect(h.messages).toEqual([])
    expect(h.top).toBe('Hello\n\nJust one line.')
  })
})

describe('parseLooseDate', () => {
  const cases: [string, string | null][] = [
    ['Tue, 4 Nov 2025 at 08:54', '2025-11-04T00:54:00.000Z'],
    ['2026-10-15 12:44:00', '2026-10-15T04:44:00.000Z'],
    ['21 October 2026 at 11:40:35 AM HKT', '2026-10-21T03:40:35.000Z'],
    ['Wednesday, 7 October 2026 at 5:16 PM', '2026-10-07T09:16:00.000Z'],
    ['Monday, October 26, 2026 4:38 PM', '2026-10-26T08:38:00.000Z'],
    ['Thursday, 08 October 2026 09:13:44', '2026-10-08T01:13:44.000Z'],
    ['Wed, Oct 14, 2026, 09:51', '2026-10-14T01:51:00.000Z'],
    ['Fri, 30 Oct 2026 13:55:59 +0800', '2026-10-30T05:55:59.000Z'],
    ['Thursday, October 15, 2026 0:06', '2026-10-14T16:06:00.000Z'],
    ['Monday, 21 July 2025 12:30 am', '2025-07-20T16:30:00.000Z'],
    ['26/10/2026 03:57:30 PM', '2026-10-26T07:57:30.000Z'],
    ['2026年10月14日 9:51', '2026-10-14T01:51:00.000Z'],
    ['Senin, 12 Oktober 2026 10:00 WIB', '2026-10-12T03:00:00.000Z'],
    ['Mon, 12 Oct 2026 08:00 GMT', '2026-10-12T08:00:00.000Z'],
    ['yesterday', null],
    ['', null],
  ]
  for (const [input, want] of cases) it(`${input || '(empty)'} → ${want}`, () => expect(parseLooseDate(input)).toBe(want))
})

describe('parseWrote', () => {
  it('splits date and name around the time', () => {
    expect(parseWrote('On Wed, 28 Oct 2026 at 18:13, Kim Yeo <kim.yeo@insurer-example.com> wrote:')).toEqual({ fromAddress: 'kim.yeo@insurer-example.com', fromName: 'Kim Yeo', dateText: 'Wed, 28 Oct 2026 at 18:13' })
  })
  it('handles a date with no time', () => {
    const r = parseWrote('On 28 Oct 2026, Kim Yeo <kim.yeo@insurer-example.com> wrote:')
    expect(r.dateText).toBe('28 Oct 2026')
    expect(r.fromName).toBe('Kim Yeo')
  })
})

describe('helpers', () => {
  it('normalises mailto duplicates and invisible characters', () => {
    expect(normaliseBody('a@b.com<mailto:a@b.com>​ x y')).toBe('a@b.com x y')
    expect(normaliseBody('Name [mailto:a@b.com]')).toBe('Name <a@b.com>')
  })
  it('collects addresses once, lower case', () => {
    expect(addressesIn('"A" <A@X.com>; b@y.com, a@x.com')).toEqual(['a@x.com', 'b@y.com'])
  })
  it('names files from an Attachments line, brackets and file-only lines, not links', () => {
    expect(filesNamed('Claim form.pdf; Photos 1.jpg', 'see https://x.com/a.pdf\n[Medical report.pdf]\nInvoice 33.xlsx')).toEqual(['Claim form.pdf', 'Photos 1.jpg', 'Medical report.pdf', 'Invoice 33.xlsx'])
  })
})
