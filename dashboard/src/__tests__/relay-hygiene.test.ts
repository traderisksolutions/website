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
