/** AI Agents (monitoring only). Read-only: nothing is switched, saved or run. */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

test('AGT-001 AI Agents lists every agent with source, model, key, status, runs and S$; an agent opens its workflow and figures', async ({ page }) => {
  await openClean(page, '/agents')
  const t = page.getByRole('table', { name: 'AI Agents' })
  await expect(t).toBeVisible({ timeout: 60_000 })
  await expect(t.locator('thead th')).toHaveText(['Agent', 'Source', 'Model', 'Key', 'Status', 'Runs', 'Failed', 'S$'])
  await expect(t.locator('tbody tr')).toHaveCount(8)
  await t.getByRole('row', { name: /Client relationships/ }).click()
  await expect(page).toHaveURL(/\/agents\/crm$/)
  await expect(page.getByRole('img', { name: 'Client relationships workflow' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Last 30 days' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Runs a day/ })).toBeVisible()
  await expect(page.locator('header').getByRole('link', { name: 'AI spend' })).toHaveCount(0)
})

test('AGT-002 Usage: by agent and by model, last 30 days against the 30 before', async ({ page }) => {
  await openClean(page, '/agents/usage')
  await expect(page.getByRole('table', { name: 'By agent' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('table', { name: 'By model' })).toBeVisible()
})
