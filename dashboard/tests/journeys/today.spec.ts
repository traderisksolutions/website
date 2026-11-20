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
