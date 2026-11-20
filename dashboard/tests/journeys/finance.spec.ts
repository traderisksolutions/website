/**
 * Finance and debit notes after the move to server actions (21 Nov 2026): the register loads its
 * rows, a note opens with its number, Receipts loads the reconciliation, and the new-note page
 * loads its review queue. Read-only: nothing is issued, edited, paid or deleted.
 */
import { test, expect } from '@playwright/test'
import { dbRows, openClean } from './helpers'

test.describe.configure({ timeout: 120_000 })

test('FIN-001 the debit note register lists the notes and a row opens with its number', async ({ page }) => {
  await openClean(page, '/debit-notes')
  await expect(page.getByText(/^[1-9][\d,]* debit notes?$/)).toBeVisible({ timeout: 60_000 })
  await page.locator('table tbody tr').first().click()
  const title = page.getByRole('dialog').getByRole('heading').first()
  await expect(title).not.toHaveText('Loading…', { timeout: 30_000 })
  await expect(title).not.toBeEmpty()
})

test('FIN-002 a company link narrows the register to that company', async ({ page }) => {
  const [note] = await dbRows<{ company_id: string }>('debit_notes?select=company_id&company_id=not.is.null&order=issue_date.desc&limit=1')
  test.skip(!note, 'no debit note on file')
  await openClean(page, `/debit-notes?company_id=${note.company_id}`)
  await expect(page.getByText(/^[1-9][\d,]* debit notes? for this company$/)).toBeVisible({ timeout: 60_000 })
})

test('FIN-003 Receipts loads the reconciliation', async ({ page }) => {
  await openClean(page, '/finance')
  await expect(page.getByRole('heading', { name: 'Receipts' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/debit notes? to collect/)).toBeVisible({ timeout: 60_000 })
})

test('FIN-004 the new debit note page loads its review queue', async ({ page }) => {
  await openClean(page, '/debit-notes/new')
  await expect(page.getByRole('heading', { name: 'Generate a new debit note' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: /^Review queue/ })).toBeVisible({ timeout: 60_000 })
})
