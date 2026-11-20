import { describe, expect, it } from 'vitest'
import { firstNameOf, inboxLabel, ringFence } from '@/lib/mail/ring-fence'

const NATHAN = 'nathan.budiutomo@trade-risksol.com'
const ERNEST = 'ernest.tan@trade-risksol.com'

describe('ringFence', () => {
  it('opens the team’s threads and a person’s own', () => {
    expect(ringFence(ERNEST, [])).toEqual({ open: true })
    expect(ringFence(ERNEST, ['operations@trade-risksol.com', NATHAN])).toEqual({ open: true })
    expect(ringFence(NATHAN, [NATHAN])).toEqual({ open: true })
  })
  it('opens a colleague’s thread for someone on the email', () => {
    expect(ringFence(ERNEST, [NATHAN], [ERNEST])).toEqual({ open: true })
  })
  it('names whose inbox holds a colleague’s private thread', () => {
    expect(ringFence(ERNEST, [NATHAN], ['client@x.invalid'])).toEqual({ open: false, inbox: NATHAN, name: 'Nathan' })
  })
  it('a cron (no viewer) opens everything', () => {
    expect(ringFence(null, [NATHAN])).toEqual({ open: true })
  })
})

describe('names', () => {
  it('first names and inbox labels', () => {
    expect(firstNameOf('hasya@trade-risksol.com')).toBe('Hasya')
    expect(inboxLabel([])).toBe('Operations')
    expect(inboxLabel([NATHAN, ERNEST])).toBe('Nathan, Ernest')
  })
})
