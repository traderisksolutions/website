/** Marketing › a website › Google Analytics: the page opens on 28 days with figures, or says what to connect. */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

test('a website links to Google Analytics, which opens with its periods and figures or the connection to make', async ({ page: site }) => {
  await openClean(site, '/websites/traderisksolutions')
  await expect(site.getByText('G-S10RY634MR')).toBeVisible({ timeout: 30_000 })
  // Links inside a page open in a new tab (NewTabLinks).
  const [page] = await Promise.all([site.waitForEvent('popup'), site.getByRole('link', { name: 'Google Analytics' }).click()])
  await expect(page).toHaveURL(/\/marketing\/analytics\?site=traderisksolutions/)
  await expect(page.getByRole('heading', { name: 'Google Analytics', level: 1 })).toBeVisible()
  await expect(page.getByRole('radio', { name: '28 days' })).toHaveAttribute('aria-checked', 'true')
  const figures = page.getByRole('heading', { name: 'Visits by day' })
  const connect = page.getByRole('heading', { name: 'Not connected' })
  await expect(figures.or(connect)).toBeVisible({ timeout: 45_000 })
  if (await connect.isVisible()) await expect(page.getByText('ai-engagement@')).toBeVisible()
})
