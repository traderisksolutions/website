/** Record pages: a company, a policy and the inbox open with their parts. */
import { test, expect } from '@playwright/test'
import { companyId, openClean } from './helpers'

test('company page opens with breadcrumbs and its sections', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/companies/${id}`)
  await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Company sections' })).toBeVisible()
  // Workbench: Policies first, the facts line, the rail's three groups, Working on as a tab.
  await expect(page.getByRole('radio', { name: /^Policies/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Appointment letter', { exact: true }).first()).toBeVisible()
  const rail = page.getByRole('complementary', { name: 'Company context' })
  for (const g of ['Actions', 'AI', 'Information']) await expect(rail.getByRole('region', { name: g })).toBeVisible()
  await page.getByRole('button', { name: 'New request' }).click()
  await expect(page).toHaveURL(/tab=working/)
  await expect(page.getByRole('button', { name: 'Add from emails' })).toBeVisible()
  await page.getByRole('button', { name: /^More$/ }).click()
  await page.getByRole('menuitem', { name: /^Nexus/ }).click()
  await expect(page).toHaveURL(/tab=nexus/)
})

test('policies in force are listed, not an empty register', async ({ page }) => {
  // The list once read 0 while 350 were live: a second policies→companies link made the join ambiguous.
  await openClean(page, '/policies?view=in_force')
  await expect(page.getByText('No policies in this view')).toHaveCount(0)
  expect(await page.locator('tbody tr').count()).toBeGreaterThan(10)
})

test('Policies opens on Working on: clients by count, a client opens to its policies, Add from emails lists threads', async ({ page }) => {
  await openClean(page, '/policies')
  await expect(page.getByText(/policies? working on/)).toBeVisible()
  const clients = page.getByRole('table', { name: 'Clients with policies being worked on' })
  await expect(clients.locator('tbody tr').first()).toBeVisible()
  await clients.locator('tbody tr').first().click()
  await expect(page.getByRole('table', { name: /^Policies being worked on for / })).toBeVisible()
  await expect(page.getByRole('combobox', { name: /^Client side, / }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Add from emails' }).click()
  const modal = page.getByRole('dialog', { name: 'Add from emails' })
  await expect(modal.getByRole('listitem').first()).toBeVisible({ timeout: 30_000 })
  await modal.getByRole('listitem').locator('input[type=checkbox]:not([disabled])').first().check()
  await modal.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('dialog', { name: 'Parties and policies' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Add 1 to the list$/ })).toBeVisible()
  await page.keyboard.press('Escape')
})

test('a policy being worked on opens its Policy page: Overview, Request with the email, Quotes with the activity', async ({ page }) => {
  await openClean(page, '/policies')
  const clients = page.getByRole('table', { name: 'Clients with policies being worked on' })
  await clients.locator('tbody tr').first().click()
  // Record links open in a new tab (the shell's NewTabLinks); the Policy page is followed there.
  const [tab] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('link', { name: 'Policy page' }).first().click()])
  await tab.waitForLoadState('load')
  await expect(tab.getByRole('radiogroup', { name: 'Policy sections' })).toBeVisible({ timeout: 30_000 })
  await expect(tab.getByText('Next steps', { exact: false }).first()).toBeVisible()
  await tab.getByRole('radio', { name: /^Request/ }).click()
  await expect(tab.getByText('Request details')).toBeVisible()
  await expect(tab.getByRole('textbox', { name: 'Message' })).toHaveValue(/Dear Underwriter,/)
  await expect(tab.getByRole('button', { name: /^Draft \d+ emails?$/ })).toBeVisible()
  await tab.getByRole('radio', { name: /^Quotes/ }).click()
  await expect(tab.getByRole('table', { name: 'Activity' })).toBeVisible()
  await tab.getByRole('radio', { name: /^Letter/ }).click()
  await expect(tab.getByRole('heading', { name: /^Appointment letter · / })).toBeVisible({ timeout: 30_000 })
  await expect(tab.getByRole('button', { name: /^(Create|New) letter$/ })).toBeVisible()
  await tab.close()
})

test('closing an edited email asks first in the confirm box; Cancel keeps it, Discard closes it', async ({ page }) => {
  await openClean(page, '/engagement')
  await page.getByRole('button', { name: 'Compose' }).first().click()
  await page.locator('#new-email-subject').fill('Journey draft · not sent')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  const box = page.getByRole('dialog', { name: 'Discard this email?' })
  await expect(box).toBeVisible()
  await box.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('#new-email-subject')).toHaveValue('Journey draft · not sent')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('dialog', { name: 'Discard this email?' }).getByRole('button', { name: 'Discard' }).click()
  await expect(page.locator('#new-email-subject')).toHaveCount(0)
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

test('Quotes › Lines shows a line: client data beside insurer asks, both drafts, Knowledge for AI with versions', async ({ page }) => {
  await openClean(page, '/lines?line=ear')
  await expect(page.getByRole('heading', { name: 'EAR' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Data required from client · \d+/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^From insurer · \d+/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Draft to insurer' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Knowledge for AI' })).toBeVisible()
  await page.getByRole('button', { name: /^Versions · \d+/ }).last().click()
  await page.getByRole('navigation', { name: 'Lines' }).getByRole('button', { name: 'CAR' }).click()
  await expect(page.getByRole('heading', { name: 'CAR' })).toBeVisible()
})
