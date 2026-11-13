/** Employment Benefits journeys: where it lives, how a quotation starts, the company tab. */
import { test, expect } from '@playwright/test'
import { companyId, openClean } from './helpers'

test('Employment Benefits sits under Quotes', async ({ page }) => {
  await openClean(page, '/pricing-matrix')
  await expect(page.getByRole('link', { name: 'Quotes', exact: true }).first()).toBeVisible()
  await expect(page.getByText('Employment Benefits').first()).toBeVisible()
  await expect(page.getByText(/^EB$/)).toHaveCount(0)
})

test('+ New quotation opens its own page: company search first, census and last year side by side, brochures', async ({ page }) => {
  await openClean(page, '/pricing-matrix')
  await page.getByRole('link', { name: /New quotation/ }).first().click()
  await expect(page).toHaveURL(/\/pricing-matrix\/new/)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Employment Benefits')
  await expect(page.getByRole('heading', { name: 'Census' })).toBeVisible()
  await expect(page.getByRole('heading', { name: "Last year's policy and premium" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Brochures' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Steadfast MCare+', exact: true })).toBeVisible()
  const company = page.getByRole('combobox', { name: 'Company' })
  await expect(company).toBeVisible()
  await company.fill('Zzq Journey Test Co')
  await expect(page.getByText(/Add .*Zzq Journey Test Co.* as a new company/)).toBeVisible()
})

test('company page has an Employment Benefits tab with + New quotation', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/companies/${id}?tab=eb`)
  await expect(page.getByRole('link', { name: /New quotation/ }).first()).toBeVisible()
})

test('a link with the company opens New quotation with it filled, older links included', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/pricing-matrix/new?company=OUE&companyId=${id}`)
  await expect(page.getByRole('combobox', { name: 'Company' })).toHaveValue(/OUE/)
  await openClean(page, `/pricing-matrix?tab=quote&company=OUE&companyId=${id}`)
  await expect(page).toHaveURL(/\/pricing-matrix\/new\?company=OUE/)
  await expect(page.getByRole('combobox', { name: 'Company' })).toHaveValue(/OUE/)
})

test('a quotation opens Compare cover: today and the five products, every cover, Back to the list', async ({ page }) => {
  await openClean(page, '/pricing-matrix')
  const row = page.locator('a[href*="/pricing-matrix/quote/"][href$="/compare"]').first()
  await expect(row).toBeVisible()
  const href = await row.getAttribute('href')
  await openClean(page, href!)
  await expect(page.getByRole('heading', { name: 'Hospital & Surgical' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('main, body').getByText(/^Today/).first()).toBeVisible()
  for (const p of ['Steadfast MCare+', 'RCC Enhanced III', 'Income FlexCare', 'Singlife MyBenefits Plus', 'AIA Flexi Vital Care Plus']) await expect(page.getByText(p, { exact: true }).first()).toBeVisible()
  for (const c of ['Hospital & Surgical', 'Outpatient Specialist', 'Personal Accident']) await expect(page.getByRole('heading', { name: c })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Draft email' })).toHaveCount(5)
  await expect(page.getByRole('link', { name: 'Ask insurers' })).toHaveAttribute('href', /\/plans$/)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Employment Benefits')
})

test('Compare cover: today from last year\'s policy, hospital by ward then limit, Income major medical follows its hospital plan', async ({ page }) => {
  // Read-only: the page saves choices with a PUT; the journey answers it without saving.
  await page.route('**/compare', r => r.request().method() === 'PUT' ? r.fulfill({ status: 200, body: '{}' }) : r.continue())
  await openClean(page, '/pricing-matrix')
  const href = await page.locator('a[href*="/pricing-matrix/quote/"][href$="/compare"]').first().getAttribute('href')
  await openClean(page, href!)
  await expect(page.getByRole('heading', { name: 'Major Medical' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /Add last year's policy|Replace policy/ })).toBeVisible()
  const ward = page.getByLabel('Ward at Income FlexCare'), limit = page.getByLabel('Limit at Income FlexCare'), mm = page.getByLabel('Major Medical at Income FlexCare')
  await expect(ward).toBeVisible()
  await expect(page.getByText('Tied to Hospital & Surgical, same plan').first()).toBeVisible()
  for (const w of ['Private 4-bed', 'Government 1-bed']) {
    await ward.selectOption(w)
    const n = (await limit.inputValue()).match(/Plan (\d+)/)?.[1]
    expect(await mm.inputValue()).toBe(`Plan ${n}`)
  }
})

test('Settings › Plan rules lists the Income FlexCare rule and the plans it pairs', async ({ page }) => {
  await openClean(page, '/settings?section=plan_rules')
  await expect(page.getByLabel('Rule 1 insurer')).toHaveValue('Income FlexCare')
  await expect(page.getByLabel('Rule 1 cover')).toHaveValue('Major Medical')
  await expect(page.getByText(/Plan 3 → Plan 3/)).toBeVisible()
})
