/** Clients › Portfolio: every business ranked by commission, the top 20% and where their admin goes. Read-only. */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

test('Portfolio ranks businesses by commission, marks the top 20% and breaks their admin down by request type', async ({ page }) => {
  await openClean(page, '/companies/portfolio')
  await expect(page.getByText(/^Top 20%: \d+ of \d+ businesses · [\d.]+% of commission/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('heading', { name: /^Admin for the top 20% · \d+ requests$/ })).toBeVisible()
  for (const t of ['Claims', 'Members and endorsements', 'Quotations and renewals']) await expect(page.getByRole('table', { name: 'Top 20% requests by type' }).getByText(t, { exact: true })).toBeVisible()
  const ranked = page.getByRole('table', { name: 'Businesses by commission' })
  await expect(ranked.getByText(/^#1 · top 20%$/)).toBeVisible()
  await page.getByRole('radio', { name: 'All debit notes' }).click()
  await expect(page.getByText(/^Top 20%: \d+ of \d+ businesses/)).toBeVisible({ timeout: 60_000 })
})

test('a business on the portfolio opens its Knowledge tab with its numbers', async ({ page }) => {
  await openClean(page, '/companies/portfolio')
  const first = page.getByRole('table', { name: 'Businesses by commission' }).getByRole('link').first()
  await expect(first).toBeVisible({ timeout: 60_000 })
  await openClean(page, (await first.getAttribute('href'))!)
  const numbers = page.getByRole('region', { name: 'Business numbers' })
  await expect(numbers.getByText('Rank by commission')).toBeVisible({ timeout: 60_000 })
  await expect(numbers.getByText(/^#1$/)).toBeVisible()
})
