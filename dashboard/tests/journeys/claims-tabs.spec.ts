/** Claims is one place: Claims, Second opinion and Documents are its tabs; the old /documents lands there. */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

test('Claims carries Second opinion and Documents as tabs, and /documents lands on the Documents tab', async ({ page }) => {
  await openClean(page, '/claims')
  const tabs = page.getByRole('radiogroup', { name: 'Claims' })
  await expect(tabs.getByRole('radio', { name: 'Claims' })).toHaveAttribute('aria-checked', 'true')
  await tabs.getByRole('radio', { name: 'Second opinion' }).click()
  await expect(page).toHaveURL(/\/claims\/second-opinion$/)
  await expect(page.getByRole('radio', { name: 'Second opinion' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: 'Documents' }).click()
  await expect(page).toHaveURL(/\/claims\/documents$/)
  await expect(page.getByRole('table', { name: 'Documents' })).toBeVisible({ timeout: 30_000 })
  await openClean(page, '/documents')
  await expect(page).toHaveURL(/\/claims\/documents/)
})
