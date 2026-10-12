import { describe, it, expect } from 'vitest'
import { approvalBlockers, renderEmail, withinSendWindow, ACTION_FROM } from '@/lib/sales/rules'
import { applyMerge, fieldsUsed, firstNameOf, openingFromDraft, replySubject, templateProblems } from '@/lib/sales/render'
import { buildMime, encodeHeader } from '@/lib/sales/mime'
import { assignSlots, classifyThread, estimateSequence, nextOfficeTime, sgtDay } from '@/lib/sales/schedule'
import { cleanQuery, filterClauses, parseFilters, toSearch, DEFAULT_FILTERS } from '@/lib/sales/filters'
import { companyKey, countryCode, emailStatusOf, personKey, splitDraft } from '@/lib/sales/ingest-rules'
import { csvCell, csvToLeads, parseCsv } from '@/lib/sales/csv'
import { mobileForWhatsApp, toEvidence } from '@/lib/sales/evidence'

describe('draft rules', () => {
  it('only a verified, unsuppressed email draft can be approved', () => {
    expect(approvalBlockers({ status: 'pending_approval', channel: 'email', email: 'a@b.com', contactEmailStatus: 'verified', contactSuppressed: false })).toEqual([])
    expect(approvalBlockers({ status: 'pending_approval', channel: 'email', email: 'a@b.com', contactEmailStatus: 'suggested', contactSuppressed: false })).toEqual(['Recipient email not verified'])
    expect(approvalBlockers({ status: 'approved', channel: 'whatsapp', email: null, contactEmailStatus: null, contactSuppressed: true })).toHaveLength(4)
  })
  it('actions start only from the expected statuses', () => {
    expect(ACTION_FROM.approve).toEqual(['pending_approval'])
    expect(ACTION_FROM.mark_replied).toEqual(['sent'])
  })
  it('send window is Mon–Fri 09:00–17:00 local', () => {
    expect(withinSendWindow('SG', new Date('2026-10-12T02:00:00Z'))).toBe(true)   // Mon 10:00 SGT
    expect(withinSendWindow('SG', new Date('2026-10-12T00:30:00Z'))).toBe(false)  // Mon 08:30 SGT
    expect(withinSendWindow('ID', new Date('2026-10-12T02:00:00Z'))).toBe(true)   // Mon 09:00 WIB
    expect(withinSendWindow('SG', new Date('2026-10-11T04:00:00Z'))).toBe(false)  // Sunday
  })
  it('renders a draft with escaped HTML, linked labels and the unsubscribe footer', () => {
    const { html, text } = renderEmail({ body: 'Hi <there>\n\nSee [our site](https://traderisksolutions.com.sg)', businessName: 'TRS', businessDomain: 'traderisksolutions.com.sg', unsubscribeUrl: 'https://x/u?c=1' })
    expect(html).toContain('Hi &lt;there&gt;')
    expect(html).toContain('<a href="https://traderisksolutions.com.sg" style="color:#1a73e8">our site</a>')
    expect(html).toContain('Unsubscribe')
    expect(text).toContain('our site (https://traderisksolutions.com.sg)')
    expect(renderEmail({ body: 'x', businessName: 'TRS', businessDomain: 'd', unsubscribeUrl: null }).html).not.toContain('Unsubscribe')
  })
})

describe('merge fields', () => {
  it('fills fields, falls back for empty contact fields, drops an empty opening line', () => {
    expect(applyMerge('Hi {{first_name}} at {{company}}', { first_name: 'Ann', company: null })).toBe('Hi Ann at your team')
    expect(applyMerge('Hi {{first_name}},\n{{opening}}\n\nBody', { first_name: 'Ann', opening: '' })).toBe('Hi Ann,\n\nBody')
    expect(applyMerge('{{opening}}\nBody', { opening: 'Saw your expansion.' })).toBe('Saw your expansion.\nBody')
  })
  it('a missing link throws rather than sending an empty promise', () => {
    expect(() => applyMerge('See {{deck_link}}', {})).toThrow('deck_link not set')
    expect(templateProblems(['{{deck_link}} {{nope}}'], { demo_url: null, deck_url: null })).toEqual(['Unknown field {{nope}}', 'Deck link not set'])
    expect(fieldsUsed('{{a}} {{ b }} {{a}}')).toEqual(['a', 'b'])
  })
  it('first names: surname-first Chinese names, role accounts', () => {
    expect(firstNameOf('Lim Geok Khoon')).toBe('Geok Khoon')
    expect(firstNameOf('Koh Dickson')).toBe('Dickson')
    expect(firstNameOf('Heng Yeow Teck Malcolm')).toBe('Malcolm')
    expect(firstNameOf('Jane Doe')).toBe('Jane')
    expect(firstNameOf('General Enquiries')).toBeNull()
    expect(firstNameOf('Mr. Tan Ah Kow')).toBe('Ah Kow')
  })
  it('reply subjects and openings', () => {
    expect(replySubject('Re: Cover')).toBe('Re: Cover')
    expect(replySubject('Cover')).toBe('Re: Cover')
    expect(openingFromDraft('Hi Ann,\n\nObservation: your fleet grew to 40 trucks this year.\n\nAt TRS we...')).toBe('your fleet grew to 40 trucks this year.')
    expect(openingFromDraft('Hi Ann,\n\nI am from Trade Risk Solutions.')).toBeNull()
  })
})

describe('mime', () => {
  it('builds a multipart message with threading and one-click unsubscribe headers', () => {
    const raw = buildMime({ fromName: 'TRS Sales', fromEmail: 'sales@traderisksolutions.com.sg', to: 'a@b.com', bcc: 'sales@traderisksolutions.com.sg', subject: 'Hello', text: 't', html: '<p>t</p>', messageId: '<1@d>', inReplyTo: '<0@d>', unsubscribeUrl: 'https://x/u' })
    expect(raw).toContain('From: TRS Sales <sales@traderisksolutions.com.sg>')
    expect(raw).toContain('Bcc: sales@traderisksolutions.com.sg')
    expect(raw).toContain('In-Reply-To: <0@d>')
    expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click')
    expect(raw).toContain('multipart/alternative')
  })
  it('strips header injection and encodes non-ASCII', () => {
    const raw = buildMime({ fromName: 'A\r\nBcc: evil@x', fromEmail: 's@d', to: 'a@b', subject: 'Hé', text: '', html: '', messageId: '<1@d>', unsubscribeUrl: null })
    expect(raw).not.toContain('\r\nBcc: evil') // flattened into the display name, never a header of its own
    expect(encodeHeader('Hé')).toMatch(/^=\?UTF-8\?B\?/)
  })
})

describe('schedule', () => {
  it('moves a weekend or evening send to the next office morning', () => {
    expect(nextOfficeTime(new Date('2026-10-10T05:00:00Z'), 'SG').toISOString()).toBe('2026-10-12T01:00:00.000Z') // Sat → Mon 09:00 SGT
    expect(nextOfficeTime(new Date('2026-10-12T10:00:00Z'), 'SG').toISOString()).toBe('2026-10-13T01:00:00.000Z') // 18:00 SGT → next day
    expect(nextOfficeTime(new Date('2026-10-12T03:00:00Z'), 'SG').toISOString()).toBe('2026-10-12T03:00:00.000Z') // 11:00 SGT stays
  })
  it('spaces first sends 15 minutes apart and respects the daily cap', () => {
    const now = new Date('2026-10-12T01:00:00Z') // Mon 09:00 SGT
    const slots = assignSlots(['SG', 'SG', 'SG'], now, 2, {})
    expect(sgtDay(slots[0])).toBe('2026-10-12')
    expect(slots[1].getTime() - slots[0].getTime()).toBe(15 * 60_000)
    expect(sgtDay(slots[2])).toBe('2026-10-13')
  })
  it('estimates a sequence and classifies threads', () => {
    const seq = estimateSequence(new Date('2026-10-12T01:00:00Z'), [2, 4], 'SG')
    expect(seq.map(sgtDay)).toEqual(['2026-10-12', '2026-10-14', '2026-10-19'])
    expect(classifyThread('sales@trs.sg', ['TRS <sales@trs.sg>', 'Ann <ann@acme.com>'])).toBe('reply')
    expect(classifyThread('sales@trs.sg', ['sales@trs.sg', 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>'])).toBe('bounce')
    expect(classifyThread('sales@trs.sg', ['sales@trs.sg'])).toBe('none')
  })
})

describe('filters', () => {
  it('parses and round-trips, dropping defaults', () => {
    const f = parseFilters(new URLSearchParams('location=sg&outreach=approved&fit=strong&page=2&pageSize=25&q=acme%2C(x)'))
    expect(f.location).toBe('SG'); expect(f.outreach).toBe('approved'); expect(f.page).toBe(2); expect(f.pageSize).toBe(25); expect(f.q).toBe('acme x')
    expect(toSearch(DEFAULT_FILTERS)).toBe('')
    expect(toSearch({ ...DEFAULT_FILTERS, location: 'SG' }, { lead: 'abc' })).toBe('?location=SG&lead=abc')
    expect(cleanQuery('a%b,c(d)')).toBe('a b c d')
  })
  it('turns filters into PostgREST clauses', () => {
    const c = filterClauses({ ...DEFAULT_FILTERS, location: 'SG', outreach: 'none', fit: 'weak', hasContact: 'no', q: 'acme' })
    expect(c).toContain('location=eq.SG')
    expect(c).toContain('outreach_status=is.null')
    expect(c).toContain('or=(fit_score.is.null,fit_score.lt.70)')
    expect(c).toContain('contact_count=eq.0')
    expect(c.find(x => x.startsWith('or=(company'))).toContain('company.ilike.*acme*')
  })
})

describe('intake rules and CSV', () => {
  it('normalises countries, email evidence and matching keys', () => {
    expect(countryCode('Singapore')).toBe('SG'); expect(countryCode('hk')).toBe('HK'); expect(countryCode('France')).toBeNull()
    expect(emailStatusOf('verified by SMTP')).toBe('verified')
    expect(emailStatusOf('from the team page')).toBe('found_publicly')
    expect(emailStatusOf('2019 directory listing')).toBe('suggested')
    expect(companyKey('HLB Atrede Pte. Ltd.')).toBe(companyKey('HLB Atrede'))
    expect(personKey('Mr. Dickson KOH')).toBe(personKey('Koh Dickson'))
    expect(splitDraft('Subject: Hello\n\nBody here')).toEqual({ subject: 'Hello', body: 'Body here' })
  })
  it('parses quoted CSV and groups rows by company', () => {
    expect(parseCsv('a,"b, c","d ""e"""\n1,2,3')).toEqual([['a', 'b, c', 'd "e"'], ['1', '2', '3']])
    const r = csvToLeads('company,country,name,email,title\nAcme,SG,Ann Tan,ann@acme.com,CEO\nAcme,SG,Bob Lim,bob@acme.com,CFO\nBeta,HK,Cy,cy@gmail.com,')
    expect(r.rows).toBe(3)
    expect(r.leads).toHaveLength(2)
    expect((r.leads[0] as { domain?: string }).domain).toBe('acme.com')
    expect((r.leads[1] as { domain?: string }).domain).toBe('')
    expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"')
  })
  it('renders evidence and WhatsApp numbers safely', () => {
    expect(toEvidence({ a: 'x', b: ['y', { c: 1 }] })).toMatchObject({ kind: 'fields' })
    expect(toEvidence('')).toBeNull()
    expect(mobileForWhatsApp('+65 9123 4567', 'SG')).toBe('6591234567')
    expect(mobileForWhatsApp('6123 4567', 'SG')).toBeNull()
  })
})
