/** Today › AI approvals: held agent work runs only from a person's press (the AI-manual rule). */
import { test, expect } from '@playwright/test'
import { openClean } from './helpers'

test('AI approvals lists every AI agent with a Run button', async ({ page }) => {
  await openClean(page, '/work/ai')
  await expect(page.getByText(/^\d+ tasks held$/)).toBeVisible({ timeout: 30_000 })
  for (const a of ['Document clerk', 'Knowledge keeper', 'Case reader', 'Relay']) await expect(page.getByText(a, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run' })).toHaveCount(8)
})
