/** Record pages: a company, a policy and the inbox open with their parts. */
import { test, expect } from '@playwright/test'
import { companyId, openClean } from './helpers'

test('company page opens with breadcrumbs and its sections', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/companies/${id}`)
  await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Company sections' })).toBeVisible()
})

test('inbox opens a thread with the rail groups', async ({ page }) => {
  await openClean(page, '/engagement')
  const first = page.getByRole('list', { name: 'Conversations' }).getByRole('button').first()
  await expect(first).toBeVisible()
  await first.click()
  await page.waitForLoadState('networkidle').catch(() => {})
  for (const g of ['Actions', 'AI', 'Information']) await expect(page.getByText(g, { exact: true }).first()).toBeVisible()
})

test('no page offers a hand-made back link or button; breadcrumbs carry Back', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  for (const href of ['/pricing-matrix', `/companies/${id}`, '/policies', '/today']) {
    await openClean(page, href)
    await expect(page.getByRole('link', { name: /^←/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^←/ })).toHaveCount(0)
  }
  await openClean(page, '/pricing-matrix/new')
  await expect(page.getByRole('button', { name: /^←/ })).toHaveCount(0)
})
