/** NAV: every place and tab in the top bar opens without an error. */
import { test } from '@playwright/test'
import { navHrefs, openClean } from './helpers'

for (const { title, href } of navHrefs()) {
  test(`opens ${title} (${href})`, async ({ page }) => { await openClean(page, href) })
}
