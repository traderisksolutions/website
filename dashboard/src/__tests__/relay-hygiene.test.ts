import { describe, it, expect } from 'vitest'
import { isSignatureImage } from '@/lib/admin/b/relay/compose'
import { firstNameFrom } from '@/lib/admin/b/contact-id'
import { isBulkMail } from '@/lib/admin/a/signals'
import { routeRecipients } from '@/lib/admin/b/router'

describe('isSignatureImage', () => {
  it('drops embedded pictures and keeps documents', () => {
    expect(isSignatureImage('image001.png', 'image/png')).toBe(true)
    expect(isSignatureImage('Outlook-abc12.gif', 'image/gif')).toBe(false)
    expect(isSignatureImage('logo-trs.png', 'image/png')).toBe(true)
    expect(isSignatureImage('ABC-LT-2026-001 - Letter of Undertaking.docx', null)).toBe(false)
    expect(isSignatureImage('site-photo-damage.jpg', 'image/jpeg')).toBe(false)
  })
})

describe('firstNameFrom', () => {
  it('reads the display name, then the address', () => {
    expect(firstNameFrom('Mei Ling Tan <meiling.tan@example-client.sg>', 'meiling.tan@example-client.sg')).toBe('Mei Ling')
    expect(firstNameFrom('TAN Mei Ling <meiling.tan@example-client.sg>', 'meiling.tan@example-client.sg')).toBe('Mei Ling')
    expect(firstNameFrom('Alex Ho <alex.hp@example.io>', 'alex.hp@example.io')).toBe('Alex')
    expect(firstNameFrom(null, 'alex.hp@example.io')).toBe('Alex')
    expect(firstNameFrom('Claims Team <claims@example-insurer.com>', 'claims@example-insurer.com')).toBeNull()
    expect(firstNameFrom(null, 'hr@client.sg')).toBeNull()
    expect(firstNameFrom('fac@example-re.com', 'fac@example-re.com')).toBeNull()
  })
})

describe('isBulkMail', () => {
  it('spots calendar traffic and newsletters', () => {
    expect(isBulkMail('Invitation: Vendor interview @ Tue 4 Nov 2026 10am (SGT)', 'Join with Google Meet')).toBe(true)
    expect(isBulkMail('Member newsletter — November', 'Hello,\n\nThis month...\n\nUnsubscribe | View in browser')).toBe(true)
    expect(isBulkMail('Re: Employee Removal Request - Insurance', 'Hi, please remove one staff member effective 17 Nov. Thanks')).toBe(false)
    expect(isBulkMail('Claim Pending Further Action (N0000001)', 'Dear TRS, kindly submit the documents.')).toBe(false)
  })
})

describe('routeRecipients: client side never picks a partner or reinsurer', () => {
  it('skips the RI broker who wrote last and takes the client contact', () => {
    const r = routeRecipients({
      side: 'client', scope: 'construction_car',
      messages: [
        { side: 'client', from: 'fac@example-re.com', to: ['ops@trade-risksol.com'], cc: [], sent_at: '2026-11-02' } as any,
        { side: 'client', from: 'meiling.tan@example-client.sg', to: ['ops@trade-risksol.com'], cc: ['hr@example-client.sg'], sent_at: '2026-10-30' } as any,
      ],
      clientContacts: [], groupContacts: [], insurerDesk: [], insurerLastHandler: null,
      insurerDomains: ['example-insurer.com'], otherDomains: ['example-re.com'], departed: [], owner: null,
    })
    expect(r.ok && r.to).toEqual(['meiling.tan@example-client.sg'])
    expect(r.ok && r.cc).toContain('hr@example-client.sg')
  })
})

describe('isBulkMail: insurer circulars to intermediaries', () => {
  it('treats a "Dear Valued Partner … disseminate … unsubscribe" circular as bulk', async () => {
    const { isBulkMail } = await import('@/lib/admin/a/signals')
    expect(isBulkMail('(TRS) ICOM-2026-09-30 Introducing a new way to book appointments', 'Dear Valued Partner, Kindly assist to disseminate to your advisers. Note: If you no longer wish to receive our emails, kindly reply to this email to unsubscribe. Kind regards')).toBe(true)
    expect(isBulkMail('Re: Quote slip', 'Dear Nathan, please find the slip attached. Regards')).toBe(false)
  })
})

describe('relay and placement', () => {
  it('stands aside only when the placement module acted on the message', async () => {
    const { placementActed } = await import('@/lib/admin/b/relay/agent')
    expect(placementActed('quote')).toBe(true)
    expect(placementActed('decline')).toBe(true)
    expect(placementActed('acceptance')).toBe(true)
    expect(placementActed('other')).toBe(false)
    expect(placementActed('question')).toBe(false)
    expect(placementActed('unread')).toBe(false)
  })
})

describe('instruction is an instruction', () => {
  it('reads a condition to proceed as no instruction, and a real one as one', async () => {
    const { detectIntent } = await import('@/lib/admin/b/relay/intent')
    const nda = detectIntent({ side: 'client', subject: 'RE: Enquiry on insurance', text: 'Could you kindly assist in having your Legal Team review the revised copy and share their feedback before we proceed with the DocuSign process?', files: [], caseType: 'new_quote' })
    expect(nda.intent).not.toBe('instruction')
    const go = detectIntent({ side: 'client', subject: 'RE: Quotation', text: 'Thanks Nathan. Please proceed with the Chubb quotation, start date 1 December.', files: [], caseType: 'new_quote' })
    expect(go.intent).toBe('instruction')
  })
})
