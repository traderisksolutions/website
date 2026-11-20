/**
 * Employment Benefits 2.0 (/eb): pricing cards, census by category, Same and Lower tier, Compare with
 * plan lists and copies, insurer schedules. Read-only: the census and the schedule are files made up
 * here, read and priced, never saved.
 */
import { test, expect } from '@playwright/test'
import { dbRows, openClean } from './helpers'

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

const SCHEDULE = ['Cover,Annual premium (S$)', 'Hospital & Surgical,1200', 'Outpatient GP,300'].join('\n')

test('EB 2.0: two pricing cards, census, Same and Lower tier, Compare with plan lists, copies and the proposal (EB-063 to EB-068)', async ({ page }) => {
  test.setTimeout(150_000)
  await openClean(page, '/eb')
  const brochure = page.getByRole('button', { name: /^Brochure pricing/ }), insurer = page.getByRole('button', { name: /^Insurer pricing/ })
  await expect(brochure).toHaveAttribute('aria-pressed', 'true')
  await expect(insurer).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('heading', { name: 'Insurer pricing schedules' })).toHaveCount(0)
  await page.locator('#eb-census-add').setInputFiles({ name: 'journey-census.csv', mimeType: 'text/csv', buffer: Buffer.from(CENSUS) })
  const census = page.getByRole('table', { name: 'Census' })
  await expect(census).toBeVisible({ timeout: 30_000 })
  const rows = census.locator('tbody tr')
  await expect(rows.nth(0)).toContainText('Directors')
  await expect(rows.nth(0)).toContainText('Plan 1 (PTE 1-bed)')
  await expect(rows.nth(1)).toContainText('Staff')
  await expect(census.locator('tbody tr').last()).toContainText('3')                 // employees only
  await expect(page.getByText('spouses and children not counted as headcount')).toBeVisible()

  await page.getByRole('button', { name: 'Generate prices' }).click()
  await expect(page.getByRole('heading', { name: 'Options for the client' })).toBeVisible({ timeout: 60_000 })
  const same = page.getByRole('button', { name: /^Same tier/ }), lower = page.getByRole('button', { name: /^Lower tier/ })
  await expect(same).toHaveAttribute('aria-pressed', 'true')
  await expect(lower).toHaveAttribute('aria-pressed', 'false')

  const compare = page.getByRole('table', { name: 'Compare' })
  await expect(compare).toBeVisible()
  for (const p of ['Current', 'Steadfast MCare+', 'RCC Enhanced III', 'Income FlexCare', 'Singlife MyBenefits Plus', 'AIA Flexi Vital Care Plus']) await expect(compare.getByRole('columnheader', { name: new RegExp(`^${p.replace('+', '\\+')}`) })).toBeVisible()
  await expect(compare.getByRole('cell', { name: 'Hospital & Surgical' })).toBeVisible()
  await expect(compare.getByRole('cell', { name: 'Total a year' })).toBeVisible()
  await expect(compare.getByRole('cell', { name: 'Per employee' })).toBeVisible()
  await expect(page.getByText('Other insurer')).toHaveCount(0)

  // A plan changed in a dropdown reprices the cover and the column total (Income FlexCare is the 5th column).
  const total = compare.getByRole('row', { name: /^Total a year/ }).getByRole('cell').nth(4)
  const before = await total.innerText()
  const select = compare.getByRole('combobox', { name: 'Income FlexCare, Hospital & Surgical, Staff' })
  const now = await select.inputValue()
  const other = (await select.locator('option').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))).find(v => v && v !== now)!
  await select.selectOption(other)
  await expect(total).not.toHaveText(before)

  // Lower tier sets every pick again.
  await lower.click()
  await expect(lower).toHaveAttribute('aria-pressed', 'true')

  // Copy as a new column on the right: the copy is the last column, with ×.
  await compare.getByRole('button', { name: 'Copy Income FlexCare as a new column on the right' }).click()
  const heads = compare.locator('thead th')
  await expect(heads.last()).toContainText('Income FlexCare · copy')
  await expect(compare.getByRole('button', { name: 'Remove Income FlexCare · copy' })).toBeVisible()

  // Proposal under Compare: every column ticked, the copy included; one taken out.
  const proposal = page.getByRole('table', { name: 'Insurers in the proposal' })
  await expect(proposal).toBeVisible()
  await expect(page.getByRole('button', { name: 'Prepare proposal · 6 columns' })).toBeVisible()
  await proposal.getByRole('checkbox', { name: 'Include Income FlexCare', exact: true }).uncheck()
  await expect(page.getByRole('button', { name: 'Prepare proposal · 5 columns' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save quotation' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Excel' })).toBeEnabled()
})

test('Insurer pricing adds the third column; a schedule read by code becomes a Compare column (EB-063, EB-065)', async ({ page }) => {
  test.setTimeout(150_000)
  await openClean(page, '/eb')
  await page.getByRole('button', { name: /^Insurer pricing/ }).click()
  await expect(page.getByRole('heading', { name: 'Insurer pricing schedules' })).toBeVisible()
  await page.locator('#eb-schedules-add').setInputFiles({ name: 'journey-aia-quote.csv', mimeType: 'text/csv', buffer: Buffer.from(SCHEDULE) })
  await expect(page.getByRole('region', { name: 'Insurer pricing schedules' }).getByText(/2 figures read/)).toBeVisible({ timeout: 30_000 })
  await page.locator('#eb-census-add').setInputFiles({ name: 'journey-census.csv', mimeType: 'text/csv', buffer: Buffer.from(CENSUS) })
  await expect(page.getByRole('table', { name: 'Census' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Generate prices' }).click()
  const compare = page.getByRole('table', { name: 'Compare' })
  await expect(compare).toBeVisible({ timeout: 60_000 })
  await expect(compare.getByRole('columnheader', { name: /AIA Flexi Vital Care Plus \(insurer schedule\)/ })).toBeVisible()
  await expect(compare.getByText('Insurer schedule', { exact: true })).toBeVisible()
})

test('a census read can be removed, and nothing from it stays', async ({ page }) => {
  await openClean(page, '/eb')
  await page.locator('#eb-census-add').setInputFiles({ name: 'journey-census.csv', mimeType: 'text/csv', buffer: Buffer.from(CENSUS) })
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
  await expect(page.getByRole('heading', { name: 'Options for the client' })).toHaveCount(0)
})

test('changing the company clears the census read for the last one', async ({ page }) => {
  await openClean(page, '/eb')
  const company = page.getByRole('combobox', { name: 'Company' })
  await company.fill('Zzq Journey First Co')
  await page.locator('#eb-census-add').setInputFiles({ name: 'journey-census.csv', mimeType: 'text/csv', buffer: Buffer.from(CENSUS) })
  await expect(page.getByRole('table', { name: 'Census' })).toBeVisible({ timeout: 30_000 })
  await company.fill('Zzq Journey Second Co')
  await expect(page.getByRole('table', { name: 'Census' })).toHaveCount(0)
})

test('a proposal reopens as Edit quotation with its census and insurers; a sent one never offers Email to client (EB-055, EB-056)', async ({ page }) => {
  test.setTimeout(120_000)
  // A kept quotation whose saved copy holds a census (one saved before 19 Nov holds none and says so).
  const kept = await dbRows<{ id: string; snapshot: { members?: unknown[]; categories?: unknown[] } }>('eb_quotations?select=id,snapshot&order=updated_at.desc&limit=50')
  const q = kept.find(r => (r.snapshot?.members?.length ?? 0) > 0 && (r.snapshot?.categories?.length ?? 0) <= 4)
  test.skip(!q, 'no kept quotation with a census')
  await openClean(page, `/eb/proposal/${q!.id}`)
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
