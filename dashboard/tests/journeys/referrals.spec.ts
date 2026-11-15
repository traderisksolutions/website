/**
 * Referrals: Unfiled threads lists every company filed as a referral for a person to check, and the
 * Inbox rail offers to mark a thread the rules read as a referral's.
 * Read-only: the journeys look, they never set a kind or mark a thread.
 */
import { test, expect } from '@playwright/test'
import { dbRows, openClean } from './helpers'

/** A thread the viewer may open that the rules read as a referral's and no person has marked. */
async function suggested(page: import('@playwright/test').Page): Promise<string | null> {
  const checked = await dbRows<{ domain: string | null; domains: string[] | null }>('companies?kind=eq.partner&confirmed_at=not.is.null&select=domain,domains&limit=50')
  const domains = [...new Set(checked.flatMap(c => [c.domain, ...(c.domains ?? [])]).filter((d): d is string => !!d))]
  for (const d of domains) {
    const mail = await dbRows<{ thread_id: string }>(`email_messages?from_address=ilike.*@${encodeURIComponent(d)}*&direction=eq.inbound&deleted_at=is.null&select=thread_id&order=sent_at.desc&limit=10`)
    for (const id of new Set(mail.map(m => m.thread_id))) {
      const res = await page.request.get(`/api/engagement/thread/${id}/referral`)
      if (!res.ok()) continue
      const r = await res.json() as { tag: unknown; suggestion: unknown }
      if (r.suggestion && !r.tag) return id
    }
  }
  return null
}

test('Unfiled threads lists the referrals on file, each with its kind and a check', async ({ page }) => {
  // CLI-034
  await openClean(page, '/companies/triage')
  await page.getByRole('radio', { name: /^Referrals/ }).click()
  const table = page.getByRole('table', { name: 'Referrals' })
  await expect(table).toBeVisible({ timeout: 30_000 })
  await expect(table.locator('thead th')).toHaveText(['Company', 'Domain', 'Threads', 'From TRS', 'Last email', 'Reads as', 'Kind', 'Checked'])
  const first = table.locator('tbody tr').first()
  await expect(first.getByRole('combobox', { name: /^Kind of / })).toHaveValue('partner')
  await expect(first.getByRole('combobox').locator('option')).toHaveCount(6)
  // Unchecked: Keep. Checked: the day it was.
  await expect(first.locator('td').last()).not.toBeEmpty()
})

test('a thread the rules read as a referral offers the mark on the rail', async ({ page }) => {
  // INB-037
  const id = await suggested(page)
  test.skip(!id, 'no thread read as a referral')
  await openClean(page, `/engagement?lead=${id}`)
  const rail = page.getByRole('complementary', { name: 'Context' })
  await expect(rail.getByRole('button', { name: 'Tag as referral' })).toBeVisible({ timeout: 30_000 })
  await expect(rail.getByRole('button', { name: 'Not a referral' })).toBeVisible()
  await expect(rail.getByText(/^(Address|Signature|Wording): /)).toBeVisible()
})
