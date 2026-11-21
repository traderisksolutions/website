/** Employment Benefits journeys: where it lives, how a quotation starts, the company tab. */
import { test, expect } from '@playwright/test'
import { companyId, dbRows, openClean } from './helpers'

test('Employment Benefits tabs are New quotation, Quotation register, Products, After binding and Brochures; Quotes is off the bar, RoadPlus its own place', async ({ page }) => {
  await openClean(page, '/eb/quotations')
  await expect(page.locator('header').getByRole('link', { name: 'Employment Benefits', exact: true })).toHaveAttribute('aria-current', 'page')
  const tabs = page.getByRole('navigation', { name: 'Employment Benefits' })
  await expect(tabs.getByRole('link')).toHaveText(['New quotation', 'Quotation register', 'Products', 'After binding', 'Brochures'])
  await expect(tabs.getByRole('link', { name: 'Quotation register', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Quotation register', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Quotes' })).toHaveCount(0)
  await expect(page.locator('header').getByRole('link', { name: 'Quotes', exact: true })).toHaveCount(0)
  await expect(page.locator('header').getByRole('link', { name: 'RoadPlus', exact: true }).first()).toBeVisible()
  await expect(page.getByText(/^EB$/)).toHaveCount(0)
})

test('EB-052 the Quotation register lists eb_quotations: Company, Effective date, Basis, Insurers, Version, Status, Updated; a row opens its proposal', async ({ page }) => {
  await openClean(page, '/eb/quotations')
  const table = page.getByRole('table', { name: 'Quotation register' })
  await expect(table.locator('thead th')).toHaveText(['Company', 'Effective date', 'Basis', 'Insurers', 'Version', 'Status', 'Updated'])
  const [q] = await dbRows<{ id: string }>('eb_quotations?select=id&order=created_at.desc&limit=1')
  test.skip(!q, 'no quotation kept from /eb')
  await expect(table.locator(`a[href="/eb/proposal/${q.id}"]`)).toBeVisible({ timeout: 30_000 })
  await expect(table.locator('tbody tr').first().locator('td').nth(5)).toHaveText(/^(Draft|Proposal sent \d{1,2} \w{3})$/)
})

test('New quotation on the register opens the quotation page: company, census and last year side by side', async ({ page }) => {
  await openClean(page, '/eb/quotations')
  await page.getByRole('link', { name: 'New quotation', exact: true }).last().click()
  await expect(page).toHaveURL(/\/eb$/)
  await expect(page.getByRole('heading', { name: 'Employment Benefits', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Census' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Last year.s policy and premium$/ })).toBeVisible()
  const company = page.getByRole('combobox', { name: 'Company' })
  await expect(company).toBeVisible()
  await company.fill('Zzq Journey Test Co')
  await expect(page.getByText(/Add .*Zzq Journey Test Co.* as a new company/)).toBeVisible()
})

test('company page has an Employment Benefits tab: its quotations and New quotation with the company filled', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/companies/${id}?tab=eb`)
  await expect(page.getByRole('table', { name: 'Quotation register' })).toBeVisible({ timeout: 30_000 })
  const add = page.locator(`a[href="/eb?company=${id}"]`)
  await expect(add).toHaveText('New quotation')
  await add.click()
  await expect(page).toHaveURL(new RegExp(`/eb\\?company=${id}`))
  await expect(page.getByRole('combobox', { name: 'Company' })).toHaveValue(/OUE/, { timeout: 30_000 })
})

test('the old New quotation and company links land on /eb and the company tab (EB-055)', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/pricing-matrix/new?company=OUE&companyId=${id}`)
  await expect(page).toHaveURL(new RegExp(`/eb\\?company=${id}`))
  await expect(page.getByRole('combobox', { name: 'Company' })).toHaveValue(/OUE/, { timeout: 30_000 })
  await openClean(page, `/pricing-matrix?tab=quote&company=OUE&companyId=${id}`)
  await expect(page).toHaveURL(new RegExp(`/eb\\?company=${id}`))
  await openClean(page, `/pricing-matrix/company/${id}`)
  await expect(page).toHaveURL(new RegExp(`/companies/${id}\\?tab=eb`))
})

test('Employment Benefits › Plan rules: the brochure rules for Income, RCC and Singlife, each with its pairs', async ({ page }) => {
  await openClean(page, '/eb/quotations?tab=rules')
  const insurers = await page.locator('select[aria-label$=" insurer"]').evaluateAll(els => els.map(e => (e as HTMLSelectElement).value))
  for (const p of ['Income FlexCare', 'RCC Enhanced III', 'Singlife MyBenefits Plus']) expect(insurers).toContain(p)
  await expect(page.getByText(/Plan 3 → Plan 3/).first()).toBeVisible()
})

test('an HR link\'s list opens New quotation, not the retired Quick quote', async ({ page }) => {
  await page.goto('/eb/quotations?tab=quote&hrLink=00000000-0000-0000-0000-000000000000')
  await expect(page).toHaveURL(/\/eb\?hrLink=/)
})

test('EB-061 an old quotation address redirects to its re-priced proposal; one not moved lands on the Quotation register', async ({ page }) => {
  const [m] = await dbRows<{ id: string; legacy_gb_id: string }>('eb_quotations?legacy_gb_id=not.is.null&select=id,legacy_gb_id&order=created_at.desc&limit=1')
  test.skip(!m, 'no quotation re-priced from gb_quotations')
  for (const tail of ['/compare', '', '/edit', '/plans?scenario=A']) {
    await page.goto(`/pricing-matrix/quote/${m.legacy_gb_id}${tail}`)
    await expect(page).toHaveURL(new RegExp(`/eb/proposal/${m.id}$`))
  }
  await page.goto('/pricing-matrix/quote/00000000-0000-0000-0000-000000000000/compare')
  await expect(page).toHaveURL(/\/eb\/quotations$/)
})

test('a report link that is not signed is refused', async ({ page }) => {
  const res = await page.request.get('/api/public/gb-report/1AbCdEfGhIjKlMnOp.9999999999.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  expect(res.status()).toBe(404)
})

test('EB-073 Products: the five house products from the workbook beside their rate tables, differences and the read queue', async ({ page }) => {
  await openClean(page, '/eb/products')
  const products = page.getByRole('table', { name: 'Products', exact: true })
  await expect(products).toBeVisible({ timeout: 90_000 })
  for (const p of ['Steadfast MCare+', 'RCC Enhanced III', 'Income FlexCare', 'Singlife MyBenefits Plus', 'AIA Flexi Vital Care Plus']) await expect(products.getByRole('row', { name: new RegExp(p.replace('+', '\\+')) })).toBeVisible()
  await expect(products.locator('thead th')).toContainText(['Product', 'Covers', 'Plans', 'Rates', 'Benefits', 'Rate tables', 'Same', 'With GST', 'Different', 'Workbook only', 'Table only'])
  await expect(page.getByRole('heading', { name: 'Read queue' })).toBeVisible()
})

test('EB-075 a proposal lists its insurers: route with why, status, the date of the step, a note; read only here', async ({ page }) => {
  const [q] = await dbRows<{ id: string }>('eb_quotations?select=id&order=created_at.desc&limit=1')
  test.skip(!q, 'no kept quotation')
  await openClean(page, `/eb/proposal/${q.id}`)
  const t = page.getByRole('table', { name: 'Insurers' })
  await expect(t).toBeVisible({ timeout: 60_000 })
  await expect(t.locator('thead th')).toHaveText(['Insurer', 'Route', 'Status', 'Since', 'Note'])
  await expect(t.getByText(/^(Brochure price|Insurer to quote)$/).first()).toBeVisible()
  await expect(t.getByRole('combobox', { name: /^Status: / }).first()).toBeVisible()
})

test('EB-076 After binding: every EB policy with its bill against the quotation or policy, movements without a note, claims and loss ratio', async ({ page }) => {
  await openClean(page, '/eb/after-binding')
  const t = page.getByRole('table', { name: 'After binding' })
  await expect(t).toBeVisible({ timeout: 60_000 })
  await expect(t.locator('thead th')).toHaveText(['Client', 'Insurer', 'Period', 'Billed', 'Expected', 'Bill', 'Movements', 'Without a note', 'Claims', 'Settled', 'Loss ratio'])
  expect(await t.locator('tbody tr').count()).toBeGreaterThan(0)
})
