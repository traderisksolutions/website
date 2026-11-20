/** Employment Benefits journeys: where it lives, how a quotation starts, the company tab. */
import { test, expect } from '@playwright/test'
import { companyId, dbRows, openClean } from './helpers'

/** An older quotation (gb_quotations) with a census: reachable by its address since the register moved to eb_quotations (20 Nov 2026). */
async function legacyCompare(): Promise<string | null> {
  const [q] = await dbRows<{ id: string }>('gb_quotations?superseded_by=is.null&member_count=gt.0&select=id&order=created_at.desc&limit=1')
  return q ? `/pricing-matrix/quote/${q.id}/compare` : null
}

test('Employment Benefits tabs are New quotation, Quotation register and Brochures; Quotes is off the bar, RoadPlus its own place', async ({ page }) => {
  await openClean(page, '/pricing-matrix')
  await expect(page.locator('header').getByRole('link', { name: 'Employment Benefits', exact: true })).toHaveAttribute('aria-current', 'page')
  const tabs = page.getByRole('navigation', { name: 'Employment Benefits' })
  await expect(tabs.getByRole('link')).toHaveText(['New quotation', 'Quotation register', 'Brochures'])
  await expect(tabs.getByRole('link', { name: 'Quotation register', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Quotation register', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Quotes' })).toHaveCount(0)
  await expect(page.locator('header').getByRole('link', { name: 'Quotes', exact: true })).toHaveCount(0)
  await expect(page.locator('header').getByRole('link', { name: 'RoadPlus', exact: true }).first()).toBeVisible()
  await expect(page.getByText(/^EB$/)).toHaveCount(0)
})

test('EB-052 the Quotation register lists eb_quotations: Company, Effective date, Basis, Products, Version, Status, Updated; a row opens its proposal', async ({ page }) => {
  await openClean(page, '/pricing-matrix')
  const table = page.getByRole('table', { name: 'Quotation register' })
  await expect(table.locator('thead th')).toHaveText(['Company', 'Effective date', 'Basis', 'Products', 'Version', 'Status', 'Updated'])
  const [q] = await dbRows<{ id: string }>('eb_quotations?select=id&order=created_at.desc&limit=1')
  test.skip(!q, 'no quotation kept from /eb')
  await expect(table.locator(`a[href="/eb/proposal/${q.id}"]`)).toBeVisible({ timeout: 30_000 })
  await expect(table.locator('tbody tr').first().locator('td').nth(5)).toHaveText(/^(Draft|Proposal sent \d{1,2} \w{3})$/)
})

test('New quotation on the register opens the quotation page: company, census and last year side by side', async ({ page }) => {
  await openClean(page, '/pricing-matrix')
  await page.getByRole('link', { name: 'New quotation', exact: true }).last().click()
  await expect(page).toHaveURL(/\/eb$/)
  await expect(page.getByRole('heading', { name: 'Employment Benefits', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Census' })).toBeVisible()
  await expect(page.getByRole('heading', { name: "Last year's policy and premium" })).toBeVisible()
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

test('a link with the company opens New quotation with it filled, older links included', async ({ page }) => {
  const id = await companyId(page, 'OUE')
  await openClean(page, `/pricing-matrix/new?company=OUE&companyId=${id}`)
  await expect(page.getByRole('combobox', { name: 'Company' })).toHaveValue(/OUE/)
  await openClean(page, `/pricing-matrix?tab=quote&company=OUE&companyId=${id}`)
  await expect(page).toHaveURL(/\/pricing-matrix\/new\?company=OUE/)
  await expect(page.getByRole('combobox', { name: 'Company' })).toHaveValue(/OUE/)
})

test('a quotation opens Compare cover: today and the five products, every cover, Back to the list', async ({ page }) => {
  const href = await legacyCompare()
  test.skip(!href, 'no older quotation with a census')
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
  const href = await legacyCompare()
  test.skip(!href, 'no older quotation with a census')
  await openClean(page, href!)
  await expect(page.getByRole('heading', { name: 'Major Medical' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: /Add last year's policy|Census and policy/ })).toHaveAttribute('href', /\/pricing-matrix\/quote\/[^/]+\/edit$/)
  await expect(page.getByRole('heading', { name: /^Hospital options · \d+/ })).toBeVisible()
  const report = page.getByRole('group', { name: 'Client report' })
  for (const b of ['Download PDF', 'Send on WhatsApp', 'Send by email']) await expect(report.getByRole('button', { name: b })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Use' }).first()).toBeVisible()
  const ward = page.getByLabel('Ward at Income FlexCare'), limit = page.getByLabel('Limit at Income FlexCare'), mm = page.getByLabel('Major Medical at Income FlexCare')
  await expect(ward).toBeVisible()
  await expect(page.getByText('Tied to Hospital & Surgical, same plan').first()).toBeVisible()
  for (const w of ['Private 4-bed', 'Government 1-bed']) {
    await ward.selectOption(w)
    const n = (await limit.inputValue()).match(/Plan (\d+)/)?.[1]
    expect(await mm.inputValue()).toBe(`Plan ${n}`)
  }
})

test('Employment Benefits › Plan rules: the brochure rules for Income, RCC and Singlife, each with its pairs', async ({ page }) => {
  await openClean(page, '/pricing-matrix?tab=rules')
  const insurers = await page.locator('select[aria-label$=" insurer"]').evaluateAll(els => els.map(e => (e as HTMLSelectElement).value))
  for (const p of ['Income FlexCare', 'RCC Enhanced III', 'Singlife MyBenefits Plus']) expect(insurers).toContain(p)
  await expect(page.getByText(/Plan 3 → Plan 3/).first()).toBeVisible()
})

test('a quotation\'s Census and policy opens New quotation with its census on file, to reprice in place', async ({ page }) => {
  const href = await legacyCompare()
  test.skip(!href, 'no older quotation with a census')
  await openClean(page, href!.replace(/\/compare$/, '/edit'))
  await expect(page.getByRole('heading', { name: 'Census and policy' })).toBeVisible()
  await expect(page.getByText(/Census on file · \d+ lives/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('combobox', { name: 'Company' })).not.toHaveValue('')
})

test('an HR link\'s list opens New quotation, not the retired Quick quote', async ({ page }) => {
  await page.goto('/pricing-matrix?tab=quote&hrLink=00000000-0000-0000-0000-000000000000')
  await expect(page).toHaveURL(/\/pricing-matrix\/new\?hrLink=/)
})

test('the older quotation and report pages open Compare cover; the client report PDF is Compare cover', async ({ page }) => {
  const href = (await legacyCompare())!
  test.skip(!href, 'no older quotation with a census')
  const id = href.split('/')[3]
  for (const old of [`/pricing-matrix/quote/${id}`, `/pricing-matrix/quote/${id}/report`]) { await page.goto(old); await expect(page).toHaveURL(new RegExp(`/pricing-matrix/quote/${id}/compare$`)) }
  const pdf = await page.request.get(`/api/group-benefits/quote/${id}/compare/report-pdf`, { headers: process.env.WEB_API_KEY ? { 'x-api-key': process.env.WEB_API_KEY } : {} })
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toContain('application/pdf')
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
})

test('a report link that is not signed is refused', async ({ page }) => {
  const res = await page.request.get('/api/public/gb-report/1AbCdEfGhIjKlMnOp.9999999999.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  expect(res.status()).toBe(404)
})
