import { describe, it, expect } from 'vitest'
import { stripSignature } from '@/lib/signature-html'

// #5: guarantee exactly one signature on send, regardless of what's already in
// the body. stripSignature removes any block from its <hr> marker onward.

const SIG = '<br><hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb"><p>Jarod</p><p>Developer</p>'
const BODY = '<p>Dear Allianz,</p><p>We seek a quotation.</p><p>Thank you.</p>'

describe('stripSignature', () => {
  it('removes an appended signature block', () => {
    expect(stripSignature(BODY + SIG)).toBe(BODY)
  })

  it('removes a DOUBLED signature (the reported bug) down to none', () => {
    expect(stripSignature(BODY + SIG + SIG)).toBe(BODY)
  })

  it('leaves a body with no signature untouched', () => {
    expect(stripSignature(BODY)).toBe(BODY)
  })

  it('is idempotent: strip → append once → strip yields the body', () => {
    const once = stripSignature(BODY + SIG) + SIG
    expect(stripSignature(once)).toBe(BODY)
  })
})
