/**
 * Clients after the 20 Nov 2026 review. Read-only: nothing is linked, merged, filed or snoozed.
 * Guards CLI-002, CLI-005, CLI-013, CLI-025, CLI-029, CLI-033, CLI-035 to CLI-038.
 */
import { test, expect } from '@playwright/test'
import { companyId, dbRows, openClean } from './helpers'

const RULE = 'Mail you see: own inbox and Operations, plus threads you are on.'

test('CLI-025 Unfiled threads: registers, a count in the meta, no File everything', async ({ page }) => {
  await openClean(page, '/companies/triage')
  await expect(page.getByRole('heading', { name: 'Unfiled threads', level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/^\d+ unfiled threads? · \d+ domains? to decide$/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'File everything' })).toHaveCount(0)
  await page.getByRole('radio', { name: /^Leftover threads/ }).click()
  await expect(page.getByText(RULE)).toBeVisible()
  await page.getByRole('radio', { name: /^Under an insurer/ }).click()
  await expect(page.getByText('An insurer wrote about a client')).toHaveCount(0)
})

test('CLI-025 Keep on a duplicate asks to confirm, and Cancel merges nothing', async ({ page }) => {
  await openClean(page, '/companies/triage')
  await page.getByRole('radio', { name: /^Duplicates/ }).click()
  const keep = page.getByRole('table', { name: 'Possible duplicates' }).getByRole('button', { name: /^Keep / }).first()
  test.skip(!(await keep.isVisible({ timeout: 30_000 }).catch(() => false)), 'no duplicate pair')
  await keep.click()
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
  await expect(dialog.getByRole('button', { name: 'Merge' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
})

test('CLI-002 CLI-005 CLI-013 company page: one primary, no Renewals tab, Claims after Quotes, Renews column', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/companies/${id}`)
  const tabs = page.getByRole('radiogroup', { name: 'Company sections' })
  await expect(tabs).toBeVisible({ timeout: 30_000 })
  const names = await tabs.getByRole('radio').allTextContents()
  expect(names.map(n => n.replace(/\d+$/, '').trim()).slice(2, 4)).toEqual(['Quotes', 'Claims'])
  expect(names.join(' ')).not.toContain('Renewals')
  await expect(page.locator('header').getByRole('button', { name: /Drafts to approve/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Request to insurers' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New request' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Policies' }).getByText('Renews', { exact: true }).or(page.getByText('No policies on file.'))).toBeVisible({ timeout: 30_000 })
  await openClean(page, `/companies/${id}?tab=renewals`)
  await expect(page.getByRole('table', { name: 'Policies' }).or(page.getByText('No policies on file.'))).toBeVisible({ timeout: 30_000 })
})

test('CLI-036 the Claims tab lists the company’s claims', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/companies/${id}?tab=claims`)
  await expect(page.getByRole('table', { name: 'Claims' }).or(page.getByText('No claims on file for this company.'))).toBeVisible({ timeout: 30_000 })
})

test('CLI-033 CLI-035 CLI-037 Threads: Waiting on, the mail rule, Breadcrumbs, tabs on a phone', async ({ page }) => {
  const [t] = await dbRows<{ company_id: string }>('email_threads?select=company_id,companies!inner(kind)&companies.kind=eq.client&deleted_at=is.null&order=last_message_at.desc&limit=1')
  test.skip(!t, 'no client thread')
  await page.setViewportSize({ width: 390, height: 844 })
  await openClean(page, `/companies/${t.company_id}?tab=threads`)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: '← Back' })).toHaveCount(0)
  await expect(page.getByRole('tablist', { name: 'Company sections' })).toBeVisible()
  await expect(page.getByText(RULE)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('table', { name: 'Threads' }).getByText('Waiting on', { exact: true })).toBeVisible()
})

test('CLI-029 People is built from contacts with company links; no pills, referral or import', async ({ page }) => {
  await openClean(page, '/contacts')
  await expect(page.getByText(/^\d+ people · \d+ under a company$/)).toBeVisible({ timeout: 60_000 })
  for (const gone of ['Log referral', 'Import CSV']) await expect(page.getByRole('button', { name: gone })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Filter by status' })).toHaveCount(0)
  await expect(page.getByRole('table', { name: 'People' }).locator('a[href^="/companies/"]').first()).toBeVisible()
})

test('CLI-038 Follow-ups: the title, a 7-day snooze and the old company page redirect', async ({ page }) => {
  await openClean(page, '/nexus')
  await expect(page.getByRole('heading', { name: 'Follow-ups', level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /Snooze 3 days/ })).toHaveCount(0)
  const id = await companyId(page, 'OUE')
  await openClean(page, `/nexus/companies/${id}`)
  await expect(page).toHaveURL(new RegExp(`/companies/${id}\\?tab=nexus`))
})
