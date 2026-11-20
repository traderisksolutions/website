/** Employment Benefits › Brochures: the library opens with its Drive link and its versions. */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

test('Brochures opens with Open Google Drive and the versions table', async ({ page }) => {
  await openClean(page, '/brochures')
  await expect(page.getByRole('heading', { name: 'Brochures' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Open Google Drive/ })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Brochure versions' })).toBeVisible({ timeout: 30_000 })
  // Add version is a full page, not a modal (EB-059).
  const add = page.getByRole('link', { name: 'Add version' })
  if (await add.count()) {
    await add.click()
    await expect(page).toHaveURL(/\/brochures\/new$/)
    await expect(page.getByRole('heading', { name: 'Add version' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } else {
    await expect(page.getByRole('button', { name: 'Add version' })).toBeDisabled()
  }
})
