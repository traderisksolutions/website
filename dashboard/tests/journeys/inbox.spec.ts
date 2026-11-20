/**
 * The Inbox list (20 Nov 2026): pages from the server with a true total, views that follow the
 * Mailbox pill, the mail rule line, no Inbound tab, the From label as pills, a full-pane New email
 * and a load failure shown with Retry. Read-only: nothing is linked, filed, sent or deleted.
 */
import { test, expect } from '@playwright/test'
import { navHrefs, openClean } from './helpers'

test.describe.configure({ timeout: 180_000 })
const OPENS = { timeout: 120_000 }

type Page = { rows: { id: string; created_at: string }[]; total: number; counts: Record<string, number>; nextOffset: number | null; mailboxes: string[] }

test('INB-038 the list API pages 100 at a time, newest first, with the true total', async ({ page }) => {
  const res = await page.request.get('/api/engagement/conversations?paged=1&offset=0&view=all&mailbox=all', { timeout: 120_000 })
  expect(res.ok(), await res.text()).toBeTruthy()
  const p = await res.json() as Page
  expect(p.rows.length).toBeLessThanOrEqual(100)
  expect(p.total).toBeGreaterThanOrEqual(p.rows.length)
  expect(p.counts.all).toBe(p.total)
  const at = p.rows.map(r => r.created_at)
  expect([...at].sort().reverse()).toEqual(at)
  if (p.nextOffset != null) {
    const next = await (await page.request.get(`/api/engagement/conversations?paged=1&offset=${p.nextOffset}&view=all&mailbox=all`)).json() as Page
    expect(next.rows.some(r => p.rows.some(x => x.id === r.id))).toBe(false)
  }
})

test('INB-038 the search runs on the server over every thread, every word', async ({ page }) => {
  const p = await (await page.request.get('/api/engagement/conversations?paged=1&offset=0&view=all&mailbox=all&q=renewal%202026&body=1', { timeout: 120_000 })).json() as Page
  expect(p.total).toBe(p.counts.all)
})

test('INB-039 view counts follow the Mailbox pill', async ({ page }) => {
  const all = await (await page.request.get('/api/engagement/conversations?paged=1&view=all&mailbox=all', { timeout: 120_000 })).json() as Page
  const ops = await (await page.request.get('/api/engagement/conversations?paged=1&view=all&mailbox=operations')).json() as Page
  expect(ops.counts.all).toBeLessThanOrEqual(all.counts.all)
  expect(ops.counts.needs_reply).toBeLessThanOrEqual(all.counts.needs_reply)
})

test('INB-040 the Inbox place has no Inbound tab, and the old category views are gone', async ({ page }) => {
  expect(navHrefs().some(t => t.href === '/inbound')).toBe(false)
  await openClean(page, '/engagement')
  const views = page.getByRole('group', { name: 'Quick views' }).first()
  await expect(views.getByRole('button', { name: /Needs reply/ })).toBeVisible(OPENS)
  for (const gone of ['Prospects', 'Clients', 'Renewals', 'Claims']) await expect(views.getByRole('button', { name: new RegExp(`^${gone}`) })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Inbox', exact: true }).first()).toBeVisible()
  await expect(page.getByText(/^\d[\d,]* conversations?$/).first()).toBeVisible(OPENS)
})

test('INB-041 the mail rule line sits under the Mailbox pills', async ({ page }) => {
  await openClean(page, '/engagement')
  await expect(page.getByText('Mail you see: own inbox and Operations, plus threads you are on.').first()).toBeVisible(OPENS)
})

test('INB-042 a list that fails to load says so with Retry, not "No conversations"', async ({ page }) => {
  await page.route('**/api/engagement/conversations?**', r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'journey' }) }))
  await openClean(page, '/engagement')
  await expect(page.getByRole('alert').filter({ hasText: 'The conversations did not load' }).first()).toBeVisible(OPENS)
  await expect(page.getByRole('button', { name: 'Retry' }).first()).toBeVisible()
  await expect(page.getByText('No conversations.')).toHaveCount(0)
})

test('INB-046 New email opens in the reading pane, not a dialog', async ({ page }) => {
  await openClean(page, '/engagement')
  await page.getByRole('button', { name: 'Compose' }).first().click()
  await expect(page.getByRole('region', { name: 'New email' })).toBeVisible(OPENS)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close' }).first().click()
  await expect(page.getByRole('region', { name: 'New email' })).toHaveCount(0)
})
