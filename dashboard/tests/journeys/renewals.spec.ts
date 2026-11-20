/**
 * Renewals (docs/renewals.md). Read-only: the journeys open Pipeline, Forecast, a renewal's page and
 * To fix and read them; they never press Open renewals due, a stage, a task, Close or Confirm (all
 * write). Pages with no records skip what needs one.
 * Guards REN-002, REN-008, REN-009, REN-010, REN-011 to REN-018.
 */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

const headers: Record<string, string> = process.env.WEB_API_KEY ? { 'x-api-key': process.env.WEB_API_KEY } : {}

test('REN-010 REN-011 Pipeline lists the records by days to expiry, Lost and Renewed behind their own pills', async ({ page }) => {
  const res = await page.request.get('/api/renewals/pipeline', { headers })
  expect(res.ok(), 'the pipeline answers').toBeTruthy()
  const view = await res.json() as { tables: boolean; rows: { id: string; outcome: string | null; bucket: string; risk: string[] }[] }
  await openClean(page, '/renewals')
  await expect(page.getByRole('heading', { name: 'Renewals', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Renewals' }).getByRole('link')).toHaveText(['Pipeline', 'Forecast', 'To fix'])
  if (!view.tables) {
    await expect(page.getByText('Renewal records are not set up yet.')).toBeVisible({ timeout: 30_000 })
    return
  }
  await expect(page.getByText(/^\d+ open · next 120 days · S\$[\d,]+ gross$/)).toBeVisible({ timeout: 30_000 })
  if (!view.rows.length) {
    await expect(page.getByText('No renewal records yet. Open renewals due to start.')).toBeVisible()
    return
  }
  const table = page.getByRole('table', { name: 'Renewals' })
  await expect(table.locator('thead th')).toHaveText(['Client', 'Line', 'Insurer', 'Expires', 'Premium', 'Commission', 'Stage', 'Owner', 'Next task'])
  const pills = page.getByRole('radiogroup', { name: 'Days to expiry' }).getByRole('radio')
  await expect(pills).toHaveText([/^All open/, /^0–30 days/, /^31–60/, /^61–90/, /^91–120/, /^121\+/, /^Lost/, /^Renewed/])
  await expect(pills.first()).toHaveAttribute('aria-checked', 'true')
  const open = view.rows.filter(r => !r.outcome)
  if (open.length) await expect(table.locator('tbody tr')).toHaveCount(open.length)
  else await expect(table.getByText(/^No renewals in/)).toBeVisible()
  for (const name of ['Owner', 'Line', 'Stage']) await expect(page.getByRole('combobox', { name })).toBeVisible()
  // At risk narrows to the flagged rows (REN-014).
  await page.getByRole('radiogroup', { name: 'Risk' }).getByRole('radio', { name: /^At risk/ }).click()
  const risky = open.filter(r => r.risk.length).length
  if (risky) await expect(table.locator('tbody tr')).toHaveCount(risky)
  if (!open.length) return
  // A row opens the renewal's page (REN-012).
  await page.getByRole('radiogroup', { name: 'Risk' }).getByRole('radio', { name: 'All' }).click()
  await table.locator('tbody tr').first().click()
  await expect(page).toHaveURL(/\/renewals\/[0-9a-f-]{36}$/)
})

test('REN-012 REN-013 REN-015 a renewal shows facts, stage, tasks, close and lines held', async ({ page }) => {
  const view = await (await page.request.get('/api/renewals/pipeline', { headers })).json() as { tables: boolean; rows: { id: string; outcome: string | null; line_code: string | null; company_id: string | null }[] }
  const r = view.tables ? view.rows.find(x => !x.outcome) ?? view.rows[0] : undefined
  test.skip(!r, 'no renewal records yet')
  await openClean(page, `/renewals/${r!.id}`)
  for (const h of ['Facts', 'Stage', 'Tasks']) await expect(page.getByRole('heading', { name: h, level: 2 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: /^Lines held · \d+$/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Lines not held · \d+$/ })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Tasks' }).locator('thead th')).toHaveText(['Task', 'Due', 'Done'])
  await expect(page.getByRole('link', { name: 'Policy', exact: true })).toHaveAttribute('href', /^\/policies\//)
  if (r!.company_id) await expect(page.getByRole('link', { name: 'Threads', exact: true })).toHaveAttribute('href', `/companies/${r!.company_id}?tab=threads`)
  if (r!.line_code === 'eb' && r!.company_id) await expect(page.getByRole('link', { name: 'New quotation', exact: true }).last()).toHaveAttribute('href', `/eb?company=${r!.company_id}`)
  if (r!.outcome) return
  await expect(page.getByRole('radiogroup', { name: 'Stage' }).getByRole('radio')).toHaveText(['Open', 'Data asked', 'Marketing', 'Quotes in', 'Proposed', 'Instructed'])
  // Close: nothing is pressed. Renewed waits for a policy; Lost waits for a reason.
  await expect(page.getByRole('button', { name: 'Close as Renewed' })).toBeDisabled()
  await page.getByRole('radiogroup', { name: 'Close as' }).getByRole('radio', { name: 'Lost' }).click()
  await expect(page.getByRole('button', { name: 'Close as Lost' })).toBeDisabled()
  await page.getByRole('combobox', { name: 'Reason' }).selectOption('other')
  await expect(page.getByRole('button', { name: 'Close as Lost' })).toBeDisabled()
})

test('REN-012 an unknown renewal says so', async ({ page }) => {
  await openClean(page, '/renewals/00000000-0000-4000-8000-000000000000')
  await expect(page.getByText('This renewal is not on the list.')).toBeVisible({ timeout: 30_000 })
})

test('REN-016 Forecast shows 12 months with commission by month and the table', async ({ page }) => {
  const res = await page.request.get('/api/renewals/forecast', { headers })
  expect(res.ok(), 'the forecast answers').toBeTruthy()
  const view = await res.json() as { tables: boolean }
  await openClean(page, '/renewals/forecast')
  await expect(page.getByRole('heading', { name: 'Forecast', level: 1 })).toBeVisible()
  if (!view.tables) return
  await expect(page.getByText(/^Next 12 months · \d+ due · S\$[\d,]+ gross · S\$[\d,]+ commission$/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('img', { name: 'Commission expiring by month' })).toBeVisible()
  const table = page.getByRole('table', { name: 'Forecast by month' })
  await expect(table.locator('thead th')).toHaveText(['Month', 'Due', 'Due premium', 'Due commission', 'Won', 'Open', 'Lost', 'Gross retention'])
  await expect(table.locator('tbody tr')).toHaveCount(13)
  for (const name of ['Line', 'Owner']) await expect(page.getByRole('combobox', { name })).toBeVisible()
})

test('REN-017 Today lists renewal tasks due, when any are due', async ({ page }) => {
  const res = await page.request.get('/api/renewals/tasks?who=all', { headers })
  expect(res.ok(), 'the tasks answer').toBeTruthy()
  await openClean(page, '/today')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  const due = await (await page.request.get('/api/renewals/tasks', { headers })).json() as { tasks: unknown[] }
  if (due.tasks.length) await expect(page.getByRole('heading', { name: `Renewals due · ${due.tasks.length}` })).toBeVisible({ timeout: 30_000 })
  else await expect(page.getByRole('table', { name: 'Renewals due' })).toHaveCount(0)
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
