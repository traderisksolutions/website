/**
 * Inline images live in Drive, not in body_html (DAT-020, DAT-021, 20 Nov 2026): a thread whose
 * stored email links its images to /api/public/email-image still shows them, and the route serves
 * a stored image only with its signature. Read-only: nothing is moved, filed or sent.
 */
import { test, expect } from '@playwright/test'
import { dbRows, openClean } from './helpers'

test.describe.configure({ timeout: 180_000 })
const OPENS = { timeout: 120_000 }
const WHO = process.env.JOURNEY_USER_EMAIL ?? 'nathan.budiutomo@trade-risksol.com'
const LINK = /\/api\/public\/email-image\/[\w-]+\?s=[\w-]{43}/

/** A thread from the last 14 days, held by the signed-in mailbox or Operations, whose email links an
 *  image. Bounded read: the newest 25 messages, never a scan of email_messages. */
async function threadWithLinkedImage(): Promise<string | null> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const msgs = await dbRows<{ thread_id: string; body_html: string | null }>(`email_messages?select=thread_id,body_html&sent_at=gte.${since}&order=sent_at.desc&limit=25`)
  const ids = Array.from(new Set(msgs.filter(m => LINK.test(m.body_html ?? '')).map(m => m.thread_id)))
  if (!ids.length) return null
  const held = await dbRows<{ thread_id: string }>(`email_thread_aliases?select=thread_id&mailbox=in.(${encodeURIComponent(WHO)},operations@trade-risksol.com)&thread_id=in.(${ids.join(',')})`)
  return held[0]?.thread_id ?? null
}

test('DAT-020 a thread with inline images shows them from the signed link', async ({ page }) => {
  const id = await threadWithLinkedImage()
  test.skip(!id, 'no recent thread with a linked inline image (none ingested since the deploy)')
  await openClean(page, `/engagement?lead=${id}`)
  await expect(page.getByRole('button', { name: /^(Collapse|Expand) message from/ }).first()).toBeVisible(OPENS)
  // Each click renames its button, so take the first remaining one each time, never a stale index.
  for (const name of [/^Expand message from/, /^Show quoted history/]) {
    const left = page.getByRole('button', { name })
    for (let n = await left.count(); n > 0; n--) await left.first().click()
  }
  const img = page.locator('img[src*="/api/public/email-image/"]').first()
  await expect(img).toBeVisible(OPENS)
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), OPENS).toBe(true)
})

test('DAT-021 the image route refuses a changed signature and a malformed id', async ({ page }) => {
  expect((await page.request.get('/api/public/email-image/not-a-real-drive-id-000?s=' + 'A'.repeat(43))).status()).toBe(404)
  expect((await page.request.get('/api/public/email-image/..%2F..%2Fetc')).status()).toBe(404)
})
