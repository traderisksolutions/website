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
  await expect(page.getByRole('cell', { name: 'Steadfast MCare+' })).toBeVisible()
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
