/**
 * The Inbox rail labels who a thread is from: Client, Insurer or Referral. Client and Insurer
 * offer Read thread; Referral offers the shared company search for the client referred.
 * Read-only: the journeys look, they never change a label.
 */
import { test, expect } from '@playwright/test'
import { dbRows, openClean } from './helpers'

const from = (page: import('@playwright/test').Page) => page.getByRole('complementary', { name: 'Context' }).getByRole('combobox', { name: 'Thread from' })

// A long thread with inline images takes over 30 seconds to arrive on a local build; the label is what is guarded.
test.describe.configure({ timeout: 180_000 })
const OPENS = { timeout: 120_000 }

const WHO = process.env.JOURNEY_USER_EMAIL ?? 'nathan.budiutomo@trade-risksol.com'

/** The newest thread of that company kind the signed-in user's mailbox holds: a colleague's private thread does not open. */
async function threadOf(kind: string, withClient = false) {
  const links = withClient ? await dbRows<{ thread_id: string }>(`thread_insurers?client_company_id=not.is.null&select=thread_id,companies!thread_insurers_insurer_company_id_fkey!inner(kind)&companies.kind=eq.${kind}&order=last_message_at.desc.nullslast&limit=1`) : []
  if (withClient) return links[0]?.thread_id ?? null
  const newest = await dbRows<{ id: string }>(`email_threads?select=id,companies!inner(kind)&companies.kind=eq.${kind}&deleted_at=is.null&order=last_message_at.desc&limit=40`)
  if (!newest.length) return null
  const held = await dbRows<{ thread_id: string }>(`email_thread_aliases?select=thread_id&mailbox=eq.${encodeURIComponent(WHO)}&thread_id=in.(${newest.map(t => t.id).join(',')})`)
  const mine = new Set(held.map(a => a.thread_id))
  return newest.find(t => mine.has(t.id))?.id ?? null
}

test('a client thread reads Client, with Read thread', async ({ page }) => {
  const id = await threadOf('client')
  test.skip(!id, 'no client thread')
  await openClean(page, `/engagement?lead=${id}`)
  await expect(from(page)).toHaveValue('client', OPENS)
  await expect(from(page).locator('option')).toHaveText(['Client', 'Insurer', 'Referral'])
  await expect(page.getByRole('complementary', { name: 'Context' }).getByRole('button', { name: 'Read thread' }).first()).toBeVisible()
})

test('an insurer thread reads Insurer, with Read thread', async ({ page }) => {
  const id = await threadOf('insurer')
  test.skip(!id, 'no insurer thread')
  await openClean(page, `/engagement?lead=${id}`)
  await expect(from(page)).toHaveValue('insurer', OPENS)
})

test('a referral thread reads Referral, with the company search holding the client referred', async ({ page }) => {
  const id = await threadOf('partner', true)
  test.skip(!id, 'no referral thread with a client')
  await openClean(page, `/engagement?lead=${id}`)
  await expect(from(page)).toHaveValue('referral', OPENS)
  const company = page.getByRole('complementary', { name: 'Context' }).getByRole('combobox', { name: 'Company' })
  await expect(company).toBeVisible()
  await expect(company).not.toHaveValue('')
})
