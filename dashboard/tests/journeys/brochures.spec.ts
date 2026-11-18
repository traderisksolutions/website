/** Employment Benefits › Brochures: the library opens with its Drive link and its versions. */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

test('Brochures opens with Open Google Drive and the versions table', async ({ page }) => {
  await openClean(page, '/brochures')
  await expect(page.getByRole('heading', { name: 'Brochures' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Open Google Drive/ })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Brochure versions' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Add version' })).toBeVisible()
})
