/**
 * Renewal Season (docs/case-sources.md): the list of policies ending soon and the conversations a
 * person selects for each, the client's wish list and the comparison of the offers. Read-only: the
 * journeys open, filter, tick and cancel; they never press Start (it opens a real case), never add
 * a thread or a wish and never press Save.
 * Guards TOD-027 to TOD-032.
 */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

const headers: Record<string, string> = process.env.WEB_API_KEY ? { 'x-api-key': process.env.WEB_API_KEY } : {}
type Row = { company: string; company_id: string | null; policy: { id: string } | null; case: { id: string; threads: number; wishes: number } | null; compare: { kind: string; href: string } | null }
const names = async (group: import('@playwright/test').Locator) => (await group.getByRole('radio').allTextContents()).map(t => t.replace(/[\d,]+\s*$/, '').trim())

test('TOD-027 Renewal Season lists every policy ending soon with its case, by month and line', async ({ page }) => {
  const res = await page.request.get('/api/renewal-season', { headers })
  expect(res.ok(), 'the list answers').toBeTruthy()
  const view = await res.json() as { rows: Row[]; months: string[] }
  await openClean(page, '/renewal-season')
  await expect(page.getByRole('heading', { name: 'Renewal Season' })).toBeVisible()
  const month = page.getByRole('radiogroup', { name: 'Month' })
  expect((await names(month)).length).toBe(view.months.length + 3)
  expect((await names(month))[1]).toBe('Overdue')
  expect(await names(page.getByRole('radiogroup', { name: 'Line' }))).toEqual(['All lines', 'Employment Benefits', 'General'])
  const table = page.getByRole('table', { name: 'Renewal Season' })
  await expect(table.locator('thead th')).toHaveText(['Client', 'Policy', 'Ends', 'Stage', 'Conversations', 'Wish list', 'Documents', 'Compare', 'Action'])
  await expect(table.locator('tbody tr')).toHaveCount(view.rows.length)
  // One action per row: Start without a case, else Select conversations or Open.
  const first = table.locator('tbody tr').first().locator('td').last()
  await expect(first.getByRole('button', { name: /^(Start|Select conversations)$/ }).or(first.getByRole('link', { name: 'Open' }))).toBeVisible()
  // The line filter narrows the rows and never empties the month counts' meaning.
  await page.getByRole('radiogroup', { name: 'Line' }).getByRole('radio', { name: /Employment Benefits/ }).click()
  const narrowed = await table.locator('tbody tr').count().catch(() => 0)
  expect(narrowed).toBeLessThanOrEqual(view.rows.length)
})

test('TOD-029 Select conversations lists the client’s threads by group; Cancel adds nothing', async ({ page }) => {
  const res = await page.request.get('/api/renewal-season', { headers })
  const view = await res.json() as { rows: Row[] }
  const at = view.rows.findIndex(r => r.case && r.company_id)
  test.skip(at < 0, 'no renewal case with a client in the window')
  const before = view.rows[at].case!.threads
  await openClean(page, '/renewal-season')
  const row = page.getByRole('table', { name: 'Renewal Season' }).locator('tbody tr').nth(at)
  await row.getByRole('button', { name: /^Select conversations for / }).click()
  const dialog = page.getByRole('dialog', { name: 'Select conversations' })
  await expect(dialog).toBeVisible()
  const groups = dialog.getByRole('radiogroup', { name: 'Relevance' })
  await expect(groups).toBeVisible({ timeout: 30_000 })
  expect(await names(groups)).toEqual(['Active', 'Back burner', 'Member movements'])
  await expect(groups.getByRole('radio', { name: /^Active/ })).toHaveAttribute('aria-checked', 'true')
  // Nothing is ticked for the person, so Continue waits.
  await expect(dialog.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  const after = await (await page.request.get('/api/renewal-season', { headers })).json() as { rows: Row[] }
  expect(after.rows[at].case!.threads).toBe(before)
})

test('TOD-030 the Wish list count opens the case’s wish list; Close adds nothing', async ({ page }) => {
  const view = await (await page.request.get('/api/renewal-season', { headers })).json() as { rows: Row[] }
  const at = view.rows.findIndex(r => r.case)
  test.skip(at < 0, 'no renewal case in the window')
  const before = view.rows[at].case!.wishes
  await openClean(page, '/renewal-season')
  const row = page.getByRole('table', { name: 'Renewal Season' }).locator('tbody tr').nth(at)
  await row.getByRole('button', { name: /^Wish list for / }).click()
  const dialog = page.getByRole('dialog', { name: 'Client wish list' })
  await expect(dialog).toBeVisible()
  // A wish is typed by a person and graded; nothing is typed here, so Add wish waits.
  await expect(dialog.getByRole('textbox', { name: 'New wish' })).toBeVisible({ timeout: 30_000 })
  await expect(dialog.getByRole('combobox', { name: 'Need for the new wish' }).locator('option')).toHaveText(['Not graded', 'Must have', 'Good to have'])
  await expect(dialog.getByRole('button', { name: 'Add wish' })).toBeDisabled()
  if (before > 0) await expect(dialog.getByRole('table', { name: 'Client wish list' }).locator('tbody tr')).toHaveCount(before)
  await dialog.getByRole('button', { name: 'Close' }).first().click()
  await expect(dialog).toHaveCount(0)
  const after = await (await page.request.get('/api/renewal-season', { headers })).json() as { rows: Row[] }
  expect(after.rows[at].case!.wishes).toBe(before)
})

test('TOD-031 a renewal case compares the offers by policy terms, premium and wish list', async ({ page }) => {
  const view = await (await page.request.get('/api/renewal-season', { headers })).json() as { rows: Row[] }
  // EB-061: Employment Benefits rows open a proposal or New quotation, never the deleted Compare cover.
  for (const r of view.rows) expect(r.compare?.href ?? '').not.toMatch(/^\/pricing-matrix\/quote\//)
  const at = view.rows.findIndex(r => r.case && r.compare?.kind === 'comparison')
  test.skip(at < 0, 'no general renewal case in the window')
  const id = view.rows[at].case!.id
  expect(view.rows[at].compare!.href).toBe(`/today/${id}?section=comparison`)
  const saved = await (await page.request.get(`/api/work/${id}/compare`, { headers })).json() as { saved: unknown; comparison: { options: { name: string }[]; rows: { label: string }[] } }
  expect(saved.comparison.options[0].name).toBe('Current policy')
  expect(saved.comparison.rows.at(-1)!.label).toBe('Premium before GST')
  await openClean(page, '/renewal-season')
  const row = page.getByRole('table', { name: 'Renewal Season' }).locator('tbody tr').nth(at)
  await expect(row.getByRole('link', { name: /^Comparison/ })).toHaveAttribute('href', new RegExp(`/today/${id}\\?section=comparison`))
  await openClean(page, `/today/${id}?section=comparison`)
  await expect(page.getByRole('radiogroup', { name: 'Case sections' }).getByRole('radio', { name: 'Comparison' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('heading', { name: /^Options · \d+$/ })).toBeVisible({ timeout: 30_000 })
  for (const name of ['Policy terms', /^Client wish list · \d+$/, 'Recommendation']) await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Options' }).locator('thead th').first()).toHaveText('Option')
  await expect(page.getByRole('table', { name: 'Policy terms' }).locator('tbody tr')).toHaveCount(saved.comparison.rows.length)
  // Nothing was typed, so there is nothing to save; the client summary waits for a saved comparison.
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  if (!saved.saved) await expect(page.getByRole('button', { name: 'Client summary' })).toBeDisabled()
})

test('TOD-032 the client summary is the saved comparison as a PDF', async ({ page }) => {
  const view = await (await page.request.get('/api/renewal-season', { headers })).json() as { rows: Row[] }
  const cases = view.rows.filter(r => r.case && r.compare?.kind === 'comparison').map(r => r.case!.id)
  test.skip(cases.length === 0, 'no general renewal case in the window')
  let unsaved: string | null = null, kept: string | null = null
  for (const id of cases.slice(0, 12)) {
    const d = await (await page.request.get(`/api/work/${id}/compare`, { headers })).json() as { saved: unknown }
    if (d.saved) kept ??= id
    else unsaved ??= id
    if (kept && unsaved) break
  }
  if (unsaved) {
    const res = await page.request.get(`/api/work/${unsaved}/compare/summary`, { headers })
    expect(res.status()).toBe(404)
    expect((await res.json() as { error: string }).error).toBe('Save the comparison first.')
  }
  if (kept) {
    const res = await page.request.get(`/api/work/${kept}/compare/summary`, { headers })
    expect(res.ok(), 'the summary answers').toBeTruthy()
    expect(res.headers()['content-type']).toBe('application/pdf')
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-')
  }
})
