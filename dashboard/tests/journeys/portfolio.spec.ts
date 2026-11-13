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

test('Admin desk lists the top 20% and opens a business with its repeats, open requests and movements', async ({ page }) => {
  await openClean(page, '/companies/portfolio/desk')
  await expect(page.getByText(/^Top 20% · \d+ businesses · \d+ open requests/)).toBeVisible({ timeout: 60_000 })
  const nav = page.getByRole('navigation', { name: 'Businesses' })
  await expect(nav.getByRole('button').first()).toBeVisible()
  await nav.getByRole('button').nth(1).click()
  for (const h of [/^Repeats · \d+$/, /^Open requests · \d+$/, /^Member movements in progress · \d+$/]) await expect(page.getByRole('heading', { name: h })).toBeVisible()
  // Read-only: the buttons are checked, never pressed.
  if (await page.getByRole('checkbox', { name: 'Select every open request' }).count()) {
    await expect(page.getByRole('button', { name: /^Mark done/ })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Done', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Snooze', exact: true }).first()).toBeVisible()
  }
})

test('AI approvals lists every AI agent with a Run button', async ({ page }) => {
  await openClean(page, '/work/ai')
  await expect(page.getByText(/^\d+ tasks held$/)).toBeVisible({ timeout: 30_000 })
  for (const a of ['Document clerk', 'Knowledge keeper', 'Case reader', 'Relay']) await expect(page.getByText(a, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run' })).toHaveCount(8)
})
