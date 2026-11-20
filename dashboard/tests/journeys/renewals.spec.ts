/**
 * Renewals, release 1 (docs/renewals.md). Read-only: the journeys open /renewals and /renewals/fix
 * and read the lists; they never press Open renewals due or Confirm (both write). Before
 * 20261120_renewals.sql is applied the pages show that renewal records are not set up.
 * Guards REN-002, REN-008, REN-009, REN-010.
 */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

const headers: Record<string, string> = process.env.WEB_API_KEY ? { 'x-api-key': process.env.WEB_API_KEY } : {}

test('REN-010 Renewals lists the open records, or says they are not set up', async ({ page }) => {
  const res = await page.request.get('/api/renewals', { headers })
  expect(res.ok(), 'the list answers').toBeTruthy()
  const view = await res.json() as { tables: boolean; rows: unknown[] }
  await openClean(page, '/renewals')
  await expect(page.getByRole('heading', { name: 'Renewals', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'To fix' }).first()).toHaveAttribute('href', '/renewals/fix')
  if (!view.tables) {
    await expect(page.getByText('Renewal records are not set up yet.')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Open renewals due' })).toBeDisabled()
    return
  }
  const table = page.getByRole('table', { name: 'Renewals' })
  await expect(table.locator('thead th')).toHaveText(['Client', 'Line', 'Insurer', 'Expires', 'Days', 'Premium', 'Commission', 'Stage', 'Owner'], { timeout: 30_000 })
  if (view.rows.length) await expect(table.locator('tbody tr')).toHaveCount(view.rows.length)
  expect(await page.getByRole('radiogroup', { name: 'Days to expiry' }).getByRole('radio').count()).toBe(6)
})

test('REN-008 REN-009 To fix lists end dates, lines and policies with no placing debit note', async ({ page }) => {
  const res = await page.request.get('/api/renewals/fix', { headers })
  expect(res.ok(), 'the lists answer').toBeTruthy()
  const fix = await res.json() as { tables: boolean; endDates: { suggested: string | null }[]; lines: unknown[]; noNote: { policy_id: string }[] }
  await openClean(page, '/renewals/fix')
  await expect(page.getByRole('heading', { name: 'To fix', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: `Policies without an end date · ${fix.endDates.length}` })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('heading', { name: `Lines to map · ${fix.lines.length}` })).toBeVisible()
  await expect(page.getByRole('heading', { name: `Policies with no placing debit note · ${fix.noNote.length}` })).toBeVisible()
  const dates = page.getByRole('table', { name: 'Policies without an end date' })
  await expect(dates.locator('thead th')).toHaveText(['Client', 'Policy', 'Insurer', 'Start date', 'Last debit note', 'End date', 'Action'])
  if (fix.endDates.some(r => r.suggested)) await expect(dates.getByText('Suggested').first()).toBeVisible()
  // Confirm all suggested asks first; Cancel writes nothing.
  if (fix.endDates.some(r => r.suggested)) {
    await page.getByRole('button', { name: 'Confirm all suggested' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    const after = await (await page.request.get('/api/renewals/fix', { headers })).json() as { endDates: unknown[] }
    expect(after.endDates.length).toBe(fix.endDates.length)
  }
  if (!fix.tables) await expect(page.getByRole('table', { name: 'Lines to map' }).getByRole('button', { name: 'Confirm' }).first()).toBeDisabled()
  if (fix.noNote.length) await expect(page.getByRole('table', { name: 'Policies with no placing debit note' }).getByRole('link', { name: 'Open policy' }).first()).toHaveAttribute('href', `/policies/${fix.noNote[0].policy_id}`)
})
