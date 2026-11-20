/**
 * Employment Benefits quotation (/eb): census by category, cover design, premiums. Read-only: the
 * census is an uploaded file made up here, read and priced, never saved.
 */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

const CENSUS = [
  'Name,Date of birth,Relationship,Category,GHS Plan',
  'Journey Director One,12/03/1970,Employee,Directors,Plan 1 (PTE 1-bed)',
  'Journey Director Spouse,05/06/1972,Spouse,Directors,',
  'Journey Staff One,01/02/1990,Employee,Staff,Plan 3 (PTE 4-bed)',
  'Journey Staff Two,15/08/1988,Employee,Staff,Plan 3 (PTE 4-bed)',
  'Journey Staff Child,20/10/2015,Child,Staff,',
].join('\n')

test('Employment Benefits is in the navigation and opens the quotation page', async ({ page }) => {
  await openClean(page, '/today')
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Employment Benefits' }).click()
  await expect(page).toHaveURL(/\/eb$/)
  await expect(page.getByRole('heading', { name: 'Employment Benefits', level: 1 })).toBeVisible()
})

test('a census in categories, one tier lower first, then premiums per category with a total', async ({ page }) => {
  test.setTimeout(120_000)
  await openClean(page, '/eb')
  await page.locator('#eb-upload').setInputFiles({ name: 'journey-census.csv', mimeType: 'text/csv', buffer: Buffer.from(CENSUS) })
  const census = page.getByRole('table', { name: 'Census' })
  await expect(census).toBeVisible({ timeout: 30_000 })
  const rows = census.locator('tbody tr')
  await expect(rows.nth(0)).toContainText('Directors')
  await expect(rows.nth(0)).toContainText('Plan 1 (PTE 1-bed)')
  await expect(rows.nth(1)).toContainText('Staff')
  await expect(census.locator('tbody tr').last()).toContainText('3')                 // employees only
  await expect(page.getByText('spouses and children not counted as headcount')).toBeVisible()

  const grid = page.getByRole('table', { name: 'Cover by category' })
  await expect(grid.getByRole('button', { name: /Lower\s*Private 2-bed · S\$20,000/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(grid.getByRole('button', { name: /Same\s*Private 1-bed · S\$25,000/ })).toHaveAttribute('aria-pressed', 'false')

  await page.getByRole('button', { name: 'Generate premium' }).click()
  await expect(page.getByRole('heading', { name: 'Premiums' })).toBeVisible({ timeout: 60_000 })
  const directors = page.getByRole('table', { name: 'Premiums, Directors' }), staff = page.getByRole('table', { name: 'Premiums, Staff' })
  await expect(directors).toBeVisible(); await expect(staff).toBeVisible()
  const [d, s] = await Promise.all([directors.boundingBox(), staff.boundingBox()])
  expect(d!.y).toBeLessThan(s!.y)
  for (const p of ['Steadfast MCare+', 'RCC Enhanced III', 'Income FlexCare', 'Singlife MyBenefits Plus', 'AIA Flexi Vital Care Plus']) await expect(directors.getByRole('columnheader', { name: p })).toBeVisible()
  await expect(directors.getByRole('cell', { name: 'Hospital & Surgical' })).toBeVisible()
  await expect(directors.getByRole('cell', { name: 'Directors · premium a year' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Total premium' }).getByRole('cell', { name: 'Premium a year' })).toBeVisible()
  // Wording (EB-059): Current, Against current as plain signed figures, Per person; one primary per step.
  await expect(directors.getByRole('columnheader', { name: 'Current' })).toBeVisible()
  await expect(directors.getByRole('cell', { name: 'Against current' }).first()).toBeVisible()
  await expect(directors.getByRole('cell', { name: 'Per person' })).toBeVisible()
  await expect(page.getByText(/^Today$|Against today|^A life$/)).toHaveCount(0)
  await expect(page.getByText('Other insurer')).toHaveCount(0)

  // Proposal under Total (EB-051): every insurer ticked, one taken out, nothing saved here.
  const proposal = page.getByRole('table', { name: 'Insurers in the proposal' })
  await expect(proposal).toBeVisible()
  await expect(page.getByRole('button', { name: 'Prepare proposal · 5 insurers' })).toBeVisible()
  await proposal.getByRole('checkbox', { name: 'Include Income FlexCare' }).uncheck()
  await expect(page.getByRole('button', { name: 'Prepare proposal · 4 insurers' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save quotation' })).toBeEnabled()
})

test('a census read can be removed, and nothing from it stays', async ({ page }) => {
  await openClean(page, '/eb')
  await page.locator('#eb-upload').setInputFiles({ name: 'journey-census.csv', mimeType: 'text/csv', buffer: Buffer.from(CENSUS) })
  await expect(page.getByRole('table', { name: 'Census' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('region', { name: 'Census' }).getByRole('button', { name: 'Remove' }).click()
  // Every Remove asks first (EB-059): Cancel keeps it, Remove takes it.
  const ask = page.getByRole('dialog')
  await expect(ask).toContainText('Remove journey-census.csv?')
  await ask.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('table', { name: 'Census' })).toBeVisible()
  await page.getByRole('region', { name: 'Census' }).getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('table', { name: 'Census' })).toHaveCount(0)
  await expect(page.getByRole('table', { name: 'Cover by category' })).toHaveCount(0)
})

test('changing the company clears the census read for the last one', async ({ page }) => {
  await openClean(page, '/eb')
  const company = page.getByRole('combobox', { name: 'Company' })
  await company.fill('Zzq Journey First Co')
  await page.locator('#eb-upload').setInputFiles({ name: 'journey-census.csv', mimeType: 'text/csv', buffer: Buffer.from(CENSUS) })
  await expect(page.getByRole('table', { name: 'Census' })).toBeVisible({ timeout: 30_000 })
  await company.fill('Zzq Journey Second Co')
  await expect(page.getByRole('table', { name: 'Census' })).toHaveCount(0)
})

test('a proposal reopens as Edit quotation with its census and insurers; a sent one never offers Email to client (EB-055, EB-056)', async ({ page }) => {
  test.setTimeout(120_000)
  await openClean(page, '/pricing-matrix')
  const first = page.getByRole('table', { name: 'Quotation register' }).locator('tbody a').first()
  test.skip(!(await first.count()), 'no kept quotation')
  await first.click()
  await expect(page).toHaveURL(/\/eb\/proposal\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').pop()!
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
  const sent = await page.getByText(/· sent /).count()
  if (sent) await expect(page.getByRole('link', { name: 'Email to client' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Edit quotation' }).click()
  await expect(page).toHaveURL(new RegExp(`/eb\\?quotation=${id}`))
  await expect(page.getByRole('heading', { name: 'Edit quotation', level: 1 })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Census' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('table', { name: 'Insurers in the proposal' })).toBeVisible({ timeout: 60_000 })
})

test('the Quotation register searches by company and filters by status; Insurers carries Reload workbook (EB-058, EB-059)', async ({ page }) => {
  await openClean(page, '/pricing-matrix')
  const table = page.getByRole('table', { name: 'Quotation register' })
  await expect(table.getByRole('columnheader', { name: 'Insurers' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('radiogroup', { name: 'Status' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search by company' }).fill('zzq no such company')
  await expect(table.getByText('No quotation matches.')).toBeVisible()
  await page.getByRole('radiogroup', { name: 'Section' }).getByRole('radio', { name: 'Insurers' }).click()
  await expect(page.getByRole('button', { name: 'Reload workbook' })).toBeVisible()
})
