/**
 * The send route is locked (Jarod, 3 Nov 2026). Two ways to send, both through it unchanged:
 *   (a) an agent drafts, a person reviews on Today and presses Send;
 *   (b) a person writes the email and sends it.
 * Anything an agent path needs (a contact on the draft, the approved To and Cc) is done before
 * the call, in the prepare step (src/lib/today/data.ts ensureDraftContact) or by the caller.
 * Changing this file needs Jarod's explicit approval; then update the hash below in the same commit.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const LOCKED = '2e810566e19934ddac62184018321e4f8804e6727dae90f04369429c798bfed2'

describe('send route', () => {
  it('is unchanged', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/email/send/route.ts'))
    expect(createHash('sha256').update(src).digest('hex')).toBe(LOCKED)
  })
})
