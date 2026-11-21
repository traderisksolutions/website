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

test('AGT-003 Instructions and Knowledge: an agent shows its instructions with versions; Knowledge lists every source and who reads it (read only here)', async ({ page }) => {
  await openClean(page, '/agents/crm')
  await page.getByRole('radiogroup', { name: 'Agent' }).getByRole('radio', { name: 'Instructions' }).click()
  await expect(page.getByRole('textbox', { name: 'Instructions and guardrails' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Save version \d+$/ })).toBeVisible()
  await openClean(page, '/agents/knowledge')
  const t = page.getByRole('table', { name: 'Knowledge' })
  await expect(t).toBeVisible({ timeout: 30_000 })
  await expect(t.locator('tbody tr')).toHaveCount(8)
  await expect(t.getByRole('row', { name: /Tone of voice.*Every agent/ })).toBeVisible()
  await expect(t.getByRole('row', { name: /Tone of voice/ }).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/agents/knowledge/tone')
  await openClean(page, '/agents/knowledge/tone')
  await expect(page.getByRole('textbox', { name: 'Text' })).toBeVisible()
})

test('AGT-004 the Agents group left Settings: Tone of voice, Renewal method, Client forms and Document checklists open in AI Agents › Knowledge; old Settings links forward', async ({ page }) => {
  await openClean(page, '/settings')
  const nav = page.getByRole('navigation', { name: 'Settings sections' })
  await expect(nav).toBeVisible({ timeout: 30_000 })
  for (const gone of ['Tone of voice', 'Renewal method', 'Client forms', 'Document checklists']) await expect(nav.getByRole('button', { name: gone })).toHaveCount(0)
  await page.goto('/settings?section=renewal_method')
  await expect(page).toHaveURL(/\/agents\/knowledge\/renewal/, { timeout: 30_000 })
  await expect(page.getByRole('textbox', { name: 'Renewal method' })).toBeVisible({ timeout: 30_000 })
  await openClean(page, '/agents/knowledge/tone')
  await expect(page.getByRole('heading', { name: 'Tone of voice', level: 1 })).toBeVisible()
})
