/**
 * Today (19 Nov 2026): clients added by hand, To client and To insurer, Read. Read-only: the
 * journeys open the page and the Add email threads dialog and cancel; they never add a thread,
 * send, draft or start a read (a read is a model call, started only by a person).
 */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

test('Today opens with By client and By email, a person menu and Add email threads', async ({ page }) => {
  await openClean(page, '/today')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  const view = page.getByRole('radiogroup', { name: 'View' })
  await expect(view.getByRole('radio', { name: /^By client/ })).toBeChecked()
  await expect(view.getByRole('radio', { name: /^By email/ })).toBeVisible()
  // TOD-042: whose Today is a menu button, not a select.
  const who = page.getByRole('button', { name: /^Whose Today: / })
  await expect(who).toBeVisible()
  await who.click()
  await expect(page.getByRole('menuitemradio', { name: 'Everyone' })).toBeVisible()
  await page.keyboard.press('Escape')
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

test('TOD-043 links from the retired case list land on Today; /today/queue is gone', async ({ page }) => {
  await openClean(page, '/today?view=coming')
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  const res = await page.goto('/today/queue')
  expect(res?.status()).toBe(404)
})

test('TOD-044 Today that fails to load says so and offers Retry', async ({ page }) => {
  // Today's reads are a server action (21 Nov 2026): every action call fails until the route is lifted.
  const fail = (r: import('@playwright/test').Route) => r.request().headers()['next-action'] ? r.fulfill({ status: 500, body: 'Test failure' }) : r.continue()
  await page.route('**/today**', fail)
  await page.goto('/today')
  await expect(page.getByRole('alert').getByText(/Today did not load/)).toBeVisible({ timeout: 30_000 })
  await page.unroute('**/today**', fail)
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('radiogroup', { name: 'View' })).toBeVisible({ timeout: 30_000 })
})

test('TOD-045 ?client= opens that client on Today', async ({ page }) => {
  await openClean(page, '/today')
  const first = page.locator('section[data-company]').first()
  test.skip(!(await first.count()), 'No client with a company on this Today.')
  const id = await first.getAttribute('data-company')
  await openClean(page, `/today?client=${id}`)
  await expect(page.locator(`section[data-company="${id}"]`).getByRole('button', { name: /^Fold / })).toBeVisible()
})

// 20 Nov 2026 (TOD-033 to TOD-040). Read-only: each control is opened and cancelled; nothing is
// removed, saved, attached, redone or sent.

test('TOD-033 Add email threads searches people and email text', async ({ page }) => {
  await openClean(page, '/today')
  await page.getByRole('button', { name: 'Add email threads' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add email threads' })
  const search = dialog.getByRole('searchbox', { name: 'Search threads' })
  await expect(search).toHaveAttribute('placeholder', /people, company or email text/)
  await search.fill('insurance')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
})

test('TOD-034 TOD-035 TOD-036 TOD-037 TOD-040 a row’s threads and emails carry Remove, Save, Discard and redo, files and Open thread', async ({ page }) => {
  await openClean(page, '/today')
  const row = page.locator('section').filter({ has: page.getByRole('button', { name: /^Fold / }) }).first()
  test.skip(!(await row.count()), 'No client open on this Today.')
  const threads = row.getByRole('button', { name: 'Threads' })
  if (await threads.count()) await threads.click()
  const remove = row.getByRole('listitem').getByRole('button', { name: 'Remove', exact: true }).first()
  if (await remove.count()) {
    await remove.click()
    const ask = row.getByRole('group', { name: 'Remove this thread from Today?' })
    await expect(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Cancel' }).click()
  }
  const card = row.locator('article').first()
  test.skip(!(await card.count()), 'No email on the open client.')
  await expect(card.getByRole('link', { name: 'Open thread' })).toHaveAttribute('href', /\/engagement\?thread=/)
  await card.getByRole('button', { name: 'Discard and redo' }).click()
  const redo = card.getByRole('group', { name: 'Discard and write again?' })
  await expect(redo.getByRole('textbox', { name: 'What to change' })).toBeVisible()
  await redo.getByRole('button', { name: 'Cancel' }).click()
  await card.getByRole('button', { name: 'Add file' }).click()
  await expect(card.getByText('Files on the client’s threads')).toBeVisible()
  await card.getByRole('button', { name: 'Close files' }).click()
  await card.getByRole('button', { name: 'Edit' }).click()
  const form = row.getByRole('textbox', { name: 'Message' }).locator('..')
  await expect(form.getByRole('button', { name: 'Save' })).toBeVisible()
  await form.getByRole('button', { name: 'Cancel' }).click()
})
