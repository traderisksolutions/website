/**
 * Today (19 Nov 2026): clients added by hand, To client and To insurer, Read. Read-only: the
 * journeys open the page and the Add email threads dialog and cancel; they never add a thread,
 * send, draft or start a read (a read is a model call, started only by a person).
 */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

test('Today opens with By client and By email, an employee picker and Add email threads', async ({ page }) => {
  await openClean(page, '/today')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  const view = page.getByRole('radiogroup', { name: 'View' })
  await expect(view.getByRole('radio', { name: /^By client/ })).toBeChecked()
  await expect(view.getByRole('radio', { name: /^By email/ })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Whose Today' })).toBeVisible()
  await view.getByRole('radio', { name: /^By email/ }).click()
  await expect(view.getByRole('radio', { name: /^By email/ })).toBeChecked()
})

test('Add email threads lists Inbox threads to tick and closes without adding', async ({ page }) => {
  await openClean(page, '/today')
  await page.getByRole('button', { name: 'Add email threads' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add email threads' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('searchbox', { name: 'Search threads' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Add to Today' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
})

test('the earlier case list lives at /today/queue and its old links lead there', async ({ page }) => {
  await openClean(page, '/today?view=coming')
  await expect(page).toHaveURL(/\/today\/queue\?view=coming/)
  await expect(page.getByRole('heading', { name: 'To do', level: 1 })).toBeVisible()
})
