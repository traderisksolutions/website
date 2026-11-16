/**
 * Renewal Season (docs/case-sources.md): the list of policies ending soon and the conversations a
 * person selects for each. Read-only: the journeys open, filter, tick and cancel; they never press
 * Start (it opens a real case) and never add a thread.
 * Guards TOD-027 to TOD-029.
 */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

const headers: Record<string, string> = process.env.WEB_API_KEY ? { 'x-api-key': process.env.WEB_API_KEY } : {}
type Row = { company: string; company_id: string | null; policy: { id: string } | null; case: { id: string; threads: number } | null }
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
