/**
 * Filing (docs/filing.md). Read-only: the journeys ask the File button's suggestion and never file.
 * FIL-001 an attachment the viewer may open answers its file, company, policies and the Drive path.
 * FIL-002 an attachment on a colleague's private thread is refused.
 * FIL-003 the File button on an Inbox attachment opens the dialog; Cancel files nothing.
 */
import { test, expect } from '@playwright/test'
import { dbRows } from './helpers'

const WHO = process.env.JOURNEY_USER_EMAIL ?? 'nathan.budiutomo@trade-risksol.com'

async function attachmentIn(mailboxes: string[], not = false): Promise<string | null> {
  const atts = await dbRows<{ id: string; thread_id: string }>('email_attachments?select=id,thread_id&order=created_at.desc&limit=60')
  if (!atts.length) return null
  const ids = [...new Set(atts.map(a => a.thread_id))]
  const aliases = await dbRows<{ thread_id: string; mailbox: string }>(`email_thread_aliases?select=thread_id,mailbox&thread_id=in.(${ids.join(',')})`)
  const boxes = new Map<string, Set<string>>()
  for (const a of aliases) boxes.set(a.thread_id, (boxes.get(a.thread_id) ?? new Set()).add(a.mailbox))
  const fits = (t: string) => { const b = boxes.get(t) ?? new Set<string>(); const hit = mailboxes.some(m => b.has(m)); return not ? b.size > 0 && !hit : hit }
  return atts.find(a => fits(a.thread_id))?.id ?? null
}

test('FIL-001 the File suggestion names the file, the company and where it would go', async ({ page }) => {
  const id = await attachmentIn([WHO, 'operations@trade-risksol.com'])
  test.skip(!id, 'no recent attachment on a thread the journey user holds')
  const res = await page.request.get(`/api/filing?attachment=${id}`)
  expect(res.status()).toBe(200)
  const s = await res.json()
  expect(typeof s.file.name).toBe('string')
  expect(Array.isArray(s.policies)).toBe(true)
  if (s.company) {
    expect(s.path[0]).toBe(s.group)
    expect(['To sort', 'Letters'].includes(s.path[1]) || s.path.length === 4).toBe(true)
  }
})

test('FIL-002 a file on a colleague\'s private thread is refused', async ({ page }) => {
  const id = await attachmentIn([WHO, 'operations@trade-risksol.com', 'developer@trade-risksol.com'], true)
  test.skip(!id || WHO === 'developer@trade-risksol.com', 'no recent private attachment of a colleague')
  const res = await page.request.get(`/api/filing?attachment=${id}`)
  expect(res.status()).toBe(403)
})

test('FIL-003 an Inbox attachment opens File to Drive with company, type, policy and the path; Cancel files nothing', async ({ page }) => {
  const id = await attachmentIn([WHO, 'operations@trade-risksol.com'])
  test.skip(!id, 'no recent attachment on a thread the journey user holds')
  const [a] = await dbRows<{ thread_id: string; filename: string }>(`email_attachments?id=eq.${id}&select=thread_id,filename`)
  const [live] = await dbRows<{ id: string }>(`email_threads?id=eq.${a.thread_id}&deleted_at=is.null&select=id`)
  test.skip(!live, 'the thread is deleted')
  await page.goto(`/engagement?lead=${a.thread_id}`)
  const left = page.getByRole('button', { name: /^Expand message from/ })
  for (let n = await left.count(); n > 0; n--) await left.first().click()
  const chip = page.getByRole('region', { name: 'Attachments' }).getByRole('button', { name: 'File to Drive' }).first()
  await expect(chip).toBeVisible({ timeout: 60_000 })
  await chip.click()
  const dialog = page.getByRole('dialog', { name: 'File to Drive' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Saves to')).toBeVisible({ timeout: 30_000 })
  await expect(dialog.getByRole('combobox', { name: 'Type' })).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: 'Policy' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
})
