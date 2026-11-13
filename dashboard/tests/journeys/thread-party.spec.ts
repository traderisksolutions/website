/**
 * The Inbox rail labels who a thread is from: Client, Insurer or Referral. Client and Insurer
 * offer Read thread; Referral offers the shared company search for the client referred.
 * Read-only: the journeys look, they never change a label.
 */
import { test, expect } from '@playwright/test'
import { dbRows, openClean } from './helpers'

const from = (page: import('@playwright/test').Page) => page.getByRole('complementary', { name: 'Context' }).getByRole('combobox', { name: 'Thread from' })

async function threadOf(kind: string, withClient = false) {
  const links = withClient ? await dbRows<{ thread_id: string }>(`thread_insurers?client_company_id=not.is.null&select=thread_id,companies!thread_insurers_insurer_company_id_fkey!inner(kind)&companies.kind=eq.${kind}&order=last_message_at.desc.nullslast&limit=1`) : []
  if (withClient) return links[0]?.thread_id ?? null
  const [t] = await dbRows<{ id: string }>(`email_threads?select=id,companies!inner(kind)&companies.kind=eq.${kind}&deleted_at=is.null&order=last_message_at.desc&limit=1`)
  return t?.id ?? null
}

test('a client thread reads Client, with Read thread', async ({ page }) => {
  const id = await threadOf('client')
  test.skip(!id, 'no client thread')
  await openClean(page, `/engagement?lead=${id}`)
  await expect(from(page)).toHaveValue('client', { timeout: 30_000 })
  await expect(from(page).locator('option')).toHaveText(['Client', 'Insurer', 'Referral'])
  await expect(page.getByRole('complementary', { name: 'Context' }).getByRole('button', { name: 'Read thread' }).first()).toBeVisible()
})

test('an insurer thread reads Insurer, with Read thread', async ({ page }) => {
  const id = await threadOf('insurer')
  test.skip(!id, 'no insurer thread')
  await openClean(page, `/engagement?lead=${id}`)
  await expect(from(page)).toHaveValue('insurer', { timeout: 30_000 })
})

test('a referral thread reads Referral, with the company search holding the client referred', async ({ page }) => {
  const id = await threadOf('partner', true)
  test.skip(!id, 'no referral thread with a client')
  await openClean(page, `/engagement?lead=${id}`)
  await expect(from(page)).toHaveValue('referral', { timeout: 30_000 })
  const company = page.getByRole('complementary', { name: 'Context' }).getByRole('combobox', { name: 'Company' })
  await expect(company).toBeVisible()
  await expect(company).not.toHaveValue('')
})
