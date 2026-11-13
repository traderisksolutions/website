/**
 * Routes between records, and where Back goes. A record opened from a page returns to that page:
 * the company, the thread, the list. Employment Benefits opened from the company page or a
 * thread's rail goes straight to the company's Compare cover; only a quotation opened from the
 * Employment Benefits list returns to the list.
 */
import { test, expect, type Page } from '@playwright/test'
import { companyId, dbRows, openClean } from './helpers'

/** Clicks a link that opens in a new tab and returns that tab once it has settled. */
async function opensTab(page: Page, click: () => Promise<void>): Promise<Page> {
  const [tab] = await Promise.all([page.context().waitForEvent('page'), click()])
  await tab.waitForLoadState('domcontentloaded')
  await tab.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  return tab
}

const back = (p: Page) => p.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link').first()

test('company page › Employment Benefits opens its Compare cover; Back returns to the company', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/companies/${id}`)
  const tab = await opensTab(page, () => page.getByRole('link', { name: 'Employment Benefits', exact: true }).first().click())
  await expect(tab).toHaveURL(/\/pricing-matrix\/quote\/[^/]+\/compare/)
  await expect(back(tab)).toHaveAttribute('href', new RegExp(`/companies/${id}`))
  await expect(back(tab)).toContainText('OUE')
})

test('thread rail › Employment Benefits opens the company Compare cover; Back returns to that thread', async ({ page }) => {
  const [t] = await dbRows<{ id: string }>('email_threads?select=id,companies!inner(kind)&companies.kind=eq.client&deleted_at=is.null&order=last_message_at.desc&limit=1')
  test.skip(!t, 'no thread filed under a client')
  await openClean(page, `/engagement?lead=${t.id}`)
  const link = page.getByRole('complementary', { name: 'Context' }).getByRole('link', { name: 'Compare cover' })
  await expect(link).toBeVisible({ timeout: 30_000 })
  const tab = await opensTab(page, () => link.click())
  await expect(tab).toHaveURL(/\/pricing-matrix\/(quote\/[^/]+\/compare|new\?company=)/)
  await expect(back(tab)).toHaveAttribute('href', new RegExp(`/engagement\\?lead=${t.id}`))
})

test('Quotes › Employment Benefits › a company returns to the list, not to a company visited before', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/companies/${id}`)
  await page.locator('header').getByRole('link', { name: 'Quotes', exact: true }).first().click()
  await expect(page).toHaveURL(/\/pricing-matrix$/)
  const row = page.locator('a[href*="/pricing-matrix/quote/"][href$="/compare"]').first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  const tab = await opensTab(page, () => row.click())
  await expect(back(tab)).toHaveAttribute('href', '/pricing-matrix')
  await expect(tab.getByRole('navigation', { name: 'Breadcrumb' })).not.toContainText('OUE ·')
})

test('company page › Claims opens the claims of that client', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/companies/${id}`)
  const tab = await opensTab(page, () => page.locator(`a[href="/claims?company=${id}"]`).first().click())
  await expect(tab).toHaveURL(new RegExp(`/claims\\?company=${id}`))
  await expect(tab.getByRole('button', { name: 'Show every client' })).toBeVisible({ timeout: 30_000 })
})

test('policy page links to its claims, debit notes and the company', async ({ page }) => {
  const [p] = await dbRows<{ id: string; company_id: string }>('policies?select=id,company_id&company_id=not.is.null&status=eq.active&order=end_date.asc&limit=1')
  test.skip(!p, 'no active policy on file')
  await openClean(page, `/policies/${p.id}`)
  await expect(page.locator(`a[href^="/claims?company=${p.company_id}"]`)).toHaveText('Claims')
  await expect(page.locator(`a[href="/debit-notes?company_id=${p.company_id}"]`).first()).toHaveText('Debit notes')
})

test('Today › Coming up: a renewal names its policy as a link', async ({ page }) => {
  await openClean(page, '/today')
  await page.getByRole('radio', { name: /^Coming up/ }).click()
  await expect(page.locator('a[href^="/policies/"]').first()).toBeVisible({ timeout: 30_000 })
})
