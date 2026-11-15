/**
 * Case sources, conversation, brief and resume point (docs/case-sources.md), and the labelled
 * mail lists that feed them. Read-only: the journeys open, tick and cancel; they never add a
 * thread, save a note or start a read (a read is a model call, started only by a person).
 * Guards TOD-024, CLI-033, CSE-011 to CSE-014.
 */
import { test, expect, type Page } from '@playwright/test'
import { dbRows, openClean } from './helpers'

const headers: Record<string, string> = process.env.WEB_API_KEY ? { 'x-api-key': process.env.WEB_API_KEY } : {}
type Sources = { picked: unknown[]; proposed: unknown[]; recent: unknown[]; older: unknown[]; buckets: { client: unknown[]; insurer: unknown[] } }

/** An open case whose threads the signed-in person may see; with `offers`, one that also has a thread to tick. Looked up once per worker. */
const found: { any?: string | null; offers?: string | null } = {}
async function openCase(page: Page, offers = false): Promise<string | null> {
  const key = offers ? 'offers' : 'any'
  if (found[key] !== undefined) return found[key] ?? null
  const rows = await dbRows<{ work_item_id: string }>('work_item_threads?select=work_item_id,work_items!inner(closed_at)&work_items.closed_at=is.null&order=created_at.desc&limit=60')
  const ids = Array.from(new Set(rows.map(r => r.work_item_id))).slice(0, 25)
  for (const id of ids) {
    const res = await page.request.get(`/api/work/${id}/sources`, { headers })
    if (!res.ok()) continue
    const s = await res.json() as Sources
    if (!s.picked.length) continue
    found.any ??= id
    if (s.proposed.length + s.recent.length + s.older.length > 0) found.offers ??= id
    if (found[key]) return found[key] ?? null
  }
  return (found[key] = null)
}
const names = async (group: import('@playwright/test').Locator) => (await group.getByRole('radio').allTextContents()).map(t => t.replace(/[\d,]+\s*$/, '').trim())

test('TOD-024 Today › Mail lists labelled threads in one table', async ({ page }) => {
  await openClean(page, '/today?view=mail')
  const mail = page.getByRole('region', { name: 'Mail' })
  await expect(mail).toBeVisible({ timeout: 30_000 })
  expect(await names(mail.getByRole('radiogroup', { name: 'Relevance' }))).toEqual(['All', 'Active', 'Back burner', 'Member movements'])
  await expect(mail.getByRole('combobox', { name: 'Label', exact: true })).toBeVisible()
  await expect(mail.locator('table.trs-table thead th')).toHaveText(['Thread', 'Company', 'Label', 'Set by', 'Last message', 'Case'])
  // Every row carries a label a person can change.
  await expect(mail.locator('tbody tr').first().getByRole('combobox')).toBeVisible()
})

test('CLI-033 a company’s threads open as a list by relevance, with the reader one click away', async ({ page }) => {
  const [t] = await dbRows<{ company_id: string }>('email_threads?select=company_id,companies!inner(kind)&companies.kind=eq.client&deleted_at=is.null&order=last_message_at.desc&limit=1')
  test.skip(!t, 'no client thread')
  await openClean(page, `/companies/${t.company_id}?tab=threads`)
  const view = page.getByRole('radiogroup', { name: 'Threads view' })
  await expect(view).toBeVisible({ timeout: 30_000 })
  await expect(view.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true')
  const list = page.getByRole('region', { name: 'Threads by relevance' })
  await expect(list).toBeVisible()
  expect(await names(list.getByRole('radiogroup', { name: 'Relevance' }))).toEqual(['Active', 'Back burner', 'Member movements'])
})

test('CSE-011 a case opens on Overview with the resume point and the agents', async ({ page }) => {
  const id = await openCase(page)
  test.skip(!id, 'no open case with a thread')
  await openClean(page, `/today/${id}`)
  const sections = page.getByRole('radiogroup', { name: 'Case sections' })
  await expect(sections).toBeVisible({ timeout: 30_000 })
  expect(await names(sections)).toEqual(['Overview', 'Sources', 'Conversation', 'Brief'])
  await expect(sections.getByRole('radio', { name: 'Overview' })).toHaveAttribute('aria-checked', 'true')
  const resume = page.getByRole('table', { name: 'Resume point' })
  await expect(resume).toBeVisible({ timeout: 30_000 })
  await expect(resume.locator('tbody tr td:first-child')).toHaveText(['Next step', 'Last touch', 'New emails', 'Open questions', 'Hand-over'])
  const agents = page.getByRole('table', { name: 'Agents' })
  await expect(agents.locator('thead th')).toHaveText(['Agent', 'Last read', 'Emails read', 'Unread', 'Notes kept'])
  await expect(agents.locator('tbody tr td:first-child')).toHaveText(['Case reader', 'Placement', 'Relay'])
  // The draft stays the page's one primary action: the read is offered beside the resume point, not started.
  await expect(page.getByRole('region', { name: 'Resume point' }).getByRole('button', { name: /^(Read \d+ new emails?|No new emails)$/ })).toBeVisible()
})

test('CSE-012 Sources lists what is on the case and what is offered; nothing is added until threads are ticked', async ({ page }) => {
  const id = await openCase(page, true)
  test.skip(!id, 'no open case with a thread to offer')
  await openClean(page, `/today/${id}?section=sources`)
  const panel = page.getByRole('region', { name: 'Sources' })
  await expect(panel).toBeVisible({ timeout: 30_000 })
  const groups = panel.getByRole('radiogroup', { name: 'Sources' })
  expect(await names(groups)).toEqual(['Proposed', 'Recent', 'Over 90 days', 'On case', 'Removed'])
  const add = panel.getByRole('button', { name: /^Add( \d+)? to case$/ })
  await expect(add).toBeDisabled()

  await groups.getByRole('radio', { name: /^On case/ }).click()
  await expect(panel.locator('thead th').first()).toHaveText('Thread')
  await expect(panel.getByRole('button', { name: 'Remove from case' }).first()).toBeVisible()

  // The first group that offers a thread: tick it, the button counts it; untick, nothing was sent.
  for (const g of ['Proposed', 'Recent', 'Over 90 days']) {
    await groups.getByRole('radio', { name: new RegExp(`^${g}`) }).click()
    if (await panel.getByRole('checkbox').count()) break
  }
  await expect(panel.locator('thead th')).toHaveText(['Pick', 'Thread', 'Side', 'Label', 'Matched on', 'Last message', 'On case'])
  const tick = panel.getByRole('checkbox').first()
  await tick.check()
  await expect(panel.getByRole('button', { name: 'Add 1 to case' })).toBeEnabled()
  await tick.uncheck()
  await expect(add).toBeDisabled()
})

test('CSE-013 Conversation shows the client’s side above the insurer’s, one table each', async ({ page }) => {
  const id = await openCase(page)
  test.skip(!id, 'no open case with a thread')
  await openClean(page, `/today/${id}?section=conversation`)
  const panel = page.getByRole('region', { name: 'Conversation' })
  await expect(panel).toBeVisible({ timeout: 30_000 })
  const heads = panel.getByRole('heading', { level: 2 })
  await expect(heads).toHaveText([/^Client · \d+ messages?$/, /^Insurer · \d+ messages?$/])
  const tables = panel.locator('table.trs-table')
  for (let i = 0; i < await tables.count(); i++) await expect(tables.nth(i).locator('thead th')).toHaveText(['Date', 'From', 'Message', 'Files'])
  await expect(panel.getByRole('button', { name: /^(Read \d+ new emails?|No new emails)$/ })).toBeVisible()
  // The draft is not on this section.
  await expect(page.getByRole('region', { name: 'Draft' })).toHaveCount(0)
})

test('CSE-014 Brief lists notes with their source; Add note asks for a section and the note', async ({ page }) => {
  const id = await openCase(page)
  test.skip(!id, 'no open case with a thread')
  await openClean(page, `/today/${id}?section=brief`)
  const panel = page.getByRole('region', { name: 'Brief' })
  await expect(panel).toBeVisible({ timeout: 30_000 })
  expect(await names(panel.getByRole('radiogroup', { name: 'Brief' }))).toEqual(['Current', 'Set aside'])
  await panel.getByRole('button', { name: 'Add note' }).click()
  const dialog = page.getByRole('dialog', { name: 'Note' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('combobox').locator('option')).toHaveText(['Client said', 'Insurer said', 'Client wish list', 'Known risks', 'Success factors', 'Open questions', 'Next step', 'Decisions', 'Hand-over'])
  await expect(dialog.getByRole('button', { name: 'Save note' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
})
