/**
 * Today 2.0 (20 Nov 2026): the logo opens Today, Today is off the bar, Calendar is a view on Today,
 * ⌘K finds email, and a colleague's private thread opens the ring-fence modal. Read-only: nothing
 * is added, condensed, sent or copied to anyone.
 */
import { test, expect } from '@playwright/test'
import { dbRows, openClean } from './helpers'

test('TOD-049 the TRS logo opens Today; Today is not a place on the bar', async ({ page }) => {
  await openClean(page, '/companies')
  const bar = page.getByRole('navigation', { name: 'Primary' }).first()
  await expect(bar.getByRole('link', { name: 'Today', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Today', exact: true }).first().click()
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
})

test('TOD-050 Calendar is a view on Today; /calendar still opens', async ({ page }) => {
  await openClean(page, '/today')
  const view = page.getByRole('radiogroup', { name: 'View' })
  await view.getByRole('radio', { name: /^Calendar/ }).click()
  await expect(page).toHaveURL(/calendar=1/)
  await expect(page.getByRole('radiogroup', { name: 'Calendar view' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today')
  await openClean(page, '/calendar')
  await expect(page.getByRole('radiogroup', { name: 'Calendar view' })).toBeVisible()
})

test('INB-050 Spotlight finds a thread by a sender’s name', async ({ page }) => {
  const [p] = await dbRows<{ name: string | null }>('email_participants?role=eq.from&name=not.is.null&email=not.ilike.*trade-risksol*&select=name&order=created_at.desc&limit=1')
  test.skip(!p?.name, 'No named sender to search for.')
  const word = p!.name!.replace(/["']/g, '').trim().split(/\s+/)[0]
  test.skip(word.length < 3, 'Sender name too short to search.')
  await openClean(page, '/today')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
  const box = page.getByRole('textbox', { name: 'Search pages and email' })
  await expect(box).toBeVisible()
  await box.fill(word)
  await expect(page.getByRole('dialog').getByText(/^Threads · \d+/)).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('Escape')
})

test('TOD-051 a colleague’s private thread on Everyone’s Today opens the ring-fence modal', async ({ page }) => {
  await openClean(page, '/today?who=all')
  await page.getByRole('button', { name: /^Whose Today: / }).click()
  await page.getByRole('menuitemradio', { name: 'Everyone' }).click()
  await page.getByRole('button', { name: 'Unfurl all' }).click().catch(() => {})
  const locked = page.locator('button[title$="’s inbox"]').first()
  test.skip(!(await locked.count()), 'No colleague’s private thread on Today for this user.')
  await locked.click()
  const modal = page.getByRole('dialog', { name: /^This email lives in .+’s inbox\.$/ })
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('button', { name: /^Ask / })).toBeVisible()
  await modal.getByRole('button', { name: 'Close' }).first().click()
  await expect(modal).toBeHidden()
})
