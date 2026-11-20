/**
 * Routes between records, and where Back goes. A record opened from a page returns to that page:
 * the company, the thread, the list. A proposal opened from the Quotation register returns to the
 * register. The old quotation pages were deleted on 20 Nov 2026 (employment-benefits.spec.ts EB-061).
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

test('thread rail › Employment Benefits › Quotations opens the company\'s Employment Benefits tab', async ({ page }) => {
  const [t] = await dbRows<{ id: string; company_id: string }>('email_threads?select=id,company_id,companies!inner(kind)&companies.kind=eq.client&deleted_at=is.null&order=last_message_at.desc&limit=1')
  test.skip(!t, 'no thread filed under a client')
  await openClean(page, `/engagement?lead=${t.id}`)
  const link = page.getByRole('complementary', { name: 'Context' }).getByRole('link', { name: 'Quotations' })
  await expect(link).toBeVisible({ timeout: 30_000 })
  await expect(link).toHaveAttribute('href', `/companies/${t.company_id}?tab=eb`)
  await expect(page.getByRole('link', { name: 'Compare cover' })).toHaveCount(0)
})

test('Employment Benefits › Quotation register › a proposal returns to the register, not to a company visited before', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/companies/${id}`)
  await page.locator('header').getByRole('link', { name: 'Employment Benefits', exact: true }).first().click()
  await page.getByRole('navigation', { name: 'Employment Benefits' }).getByRole('link', { name: 'Quotation register', exact: true }).click()
  await expect(page).toHaveURL(/\/eb\/quotations$/)
  const [q] = await dbRows<{ id: string }>('eb_quotations?select=id&order=created_at.desc&limit=1')
  test.skip(!q, 'no quotation kept from /eb')
  const row = page.locator(`a[href="/eb/proposal/${q.id}"]`)
  await expect(row).toBeVisible({ timeout: 30_000 })
  const tab = await opensTab(page, () => row.click())
  await expect(back(tab)).toHaveAttribute('href', '/eb/quotations')
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

test('TOD-047 Calendar › Employment Benefits renewals: each renewal names its policy and opens its census', async ({ page }) => {
  await openClean(page, '/calendar')
  await page.getByRole('radiogroup', { name: 'Calendar view' }).getByRole('radio', { name: /^Employment Benefits renewals/ }).click()
  await expect(page).toHaveURL(/view=eb/)
  const table = page.getByRole('table', { name: 'Employment Benefits renewals' })
  await expect(table).toBeVisible({ timeout: 30_000 })
  const census = table.getByRole('link', { name: 'Open census' }).first()
  test.skip(!(await census.count()), 'No Employment Benefits policy ends in the next 120 days.')
  await expect(table.locator('a[href^="/policies/"]').first()).toBeVisible()
  await expect(census).toHaveAttribute('href', /^\/eb(\?company=[0-9a-f-]{36})?$/)
})

test('TOD-048 a calendar that fails to load says so and offers Retry, not an empty month', async ({ page }) => {
  await page.route('**/api/calendar/events?*', r => r.fulfill({ status: 500, json: { error: 'Test failure' } }))
  await openClean(page, '/calendar')
  await expect(page.getByRole('alert').getByText(/The calendar did not load/)).toBeVisible()
  await expect(page.getByText('Nothing due this month.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})
