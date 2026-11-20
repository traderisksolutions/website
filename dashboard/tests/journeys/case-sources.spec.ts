/**
 * Case sources, conversation, rounds, brief and resume point (docs/case-sources.md), and the
 * labelled mail lists that feed them. Read-only: the journeys open, tick and cancel; they never
 * add a thread, save a note, draft a step, set an email's type or start a read (a read is a
 * model call, started only by a person).
 * Guards TOD-024 to TOD-026, CLI-033, CSE-011 to CSE-014, CSE-019 to CSE-022, CSE-029 to CSE-032.
 */
import { test, expect, type Page } from '@playwright/test'
import { dbRows, openClean } from './helpers'

const headers: Record<string, string> = process.env.WEB_API_KEY ? { 'x-api-key': process.env.WEB_API_KEY } : {}
type Sources = { picked: unknown[]; proposed: unknown[]; recent: unknown[]; older: unknown[]; buckets: { client: unknown[]; insurer: unknown[] } }

/** An open case with an email from its client or an insurer that the signed-in person may see; with `offers`, one that also has a thread to tick. Looked up once per worker. */
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
    if (!s.picked.length || s.buckets.client.length + s.buckets.insurer.length === 0) continue
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
  await expect(mail.locator('table.trs-table thead th')).toHaveText(['Pick', 'Thread', 'Company', 'Label', 'Set by', 'Last message', 'Case'])
  // Every row carries a label a person can change.
  await expect(mail.locator('tbody tr').first().getByRole('combobox')).toBeVisible()
})

test('TOD-025 ticked threads open as one case to be: a client, a side per thread, nothing made until Start case', async ({ page }) => {
  await openClean(page, '/today?view=mail')
  const mail = page.getByRole('region', { name: 'Mail' })
  await expect(mail).toBeVisible({ timeout: 30_000 })
  const combine = mail.getByRole('button', { name: /^Combine( \d+)? threads?$/ })
  await expect(combine).toBeDisabled()
  const ticks = mail.getByRole('checkbox')
  test.skip(await ticks.count() < 2, 'fewer than two threads listed')
  await ticks.nth(0).check()
  await ticks.nth(1).check()
  await expect(mail.getByRole('button', { name: 'Combine 2 threads' })).toBeEnabled()
  await mail.getByRole('button', { name: 'Combine 2 threads' }).click()
  const dialog = page.getByRole('dialog', { name: 'Case from 2 threads' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('thead th')).toHaveText(['Thread', 'Side', 'Filed under', 'Last message', 'On case'], { timeout: 30_000 })
  await expect(dialog.locator('tbody tr')).toHaveCount(2)
  // Each thread is marked as the client's or as an insurer on file, by name.
  const side = dialog.locator('tbody tr').first().getByRole('combobox')
  await expect(side.locator('> option')).toHaveText(['Client', 'Internal', 'Other'])
  expect(await side.locator('optgroup[label="Insurer"] option').count()).toBeGreaterThan(1)
  // A thread's own subject may hold the word, so the name is matched from its start.
  await expect(dialog.getByRole('combobox', { name: /^Case/ })).toHaveValue('new')
  await expect(dialog.getByRole('button', { name: /^(Start case|Add to case)/ })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  // The ticks stand until the person clears them.
  await mail.getByRole('button', { name: 'Clear' }).click()
  await expect(combine).toBeDisabled()
})

test('TOD-026 Home retired: the root address opens Today', async ({ page }) => {
  // Jarod, 20 Nov 2026: Home retired; Today is the home page.
  await openClean(page, '/')
  await expect(page).toHaveURL(/\/today$/, { timeout: 30_000 })
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
  expect(await names(sections)).toEqual(['Overview', 'Sources', 'Conversation', 'Rounds', 'Brief'])
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
  // CSE-029: a thread on the case is the client's or a named insurer's.
  const side = panel.locator('tbody tr').first().getByRole('combobox', { name: /^Side for / })
  if (await side.count()) expect(await side.locator('optgroup[label="Insurer"] option').count()).toBeGreaterThan(1)

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

test('CSE-022 Rounds lists the next steps, then one round: its insurers and every email with its type', async ({ page }) => {
  const id = await openCase(page)
  test.skip(!id, 'no open case with a thread')
  await openClean(page, `/today/${id}?section=rounds`)
  const panel = page.getByRole('region', { name: 'Rounds' })
  await expect(panel).toBeVisible({ timeout: 30_000 })
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText([/^Next steps · \d+$/, /^Round \d+ of \d+/])
  // CSE-030: Run drafts every step owed, by rule; it is the section's one primary and is not pressed here.
  await expect(panel.getByRole('button', { name: /^Run( · \d+ drafts?)?$/ })).toBeVisible()
  const steps = panel.getByRole('table', { name: 'Next steps' })
  if (await steps.count()) await expect(steps.locator('thead th')).toHaveText(['Step', 'Since', 'Drafted by', 'Action'])
  else await expect(panel.getByText('Nothing is waiting to be passed on.')).toBeVisible()
  const emails = panel.getByRole('table', { name: /^Round \d+ emails$/ })
  await expect(emails.locator('thead th')).toHaveText(['Date', 'From', 'Insurer', 'Type', 'Message', 'Files'])
  // Every email carries the rule's reading: a list a person can change, or plain text in a colleague's mailbox.
  const rows = emails.locator('tbody tr')
  expect(await rows.count()).toBeGreaterThan(0)
  const first = rows.first()
  await expect(first.getByRole('combobox', { name: 'Email type' }).or(first.getByText('In a colleague\'s mailbox'))).toBeVisible()
  // A step is drafted only on a person's click; the draft is not on this section.
  await expect(page.getByRole('region', { name: 'Draft' })).toHaveCount(0)
})

test('CSE-014 Brief opens on the five parts in one table; Add note asks for a section and the note', async ({ page }) => {
  const id = await openCase(page)
  test.skip(!id, 'no open case with a thread')
  await openClean(page, `/today/${id}?section=brief`)
  const panel = page.getByRole('region', { name: 'Brief' })
  await expect(panel).toBeVisible({ timeout: 30_000 })
  expect(await names(panel.getByRole('radiogroup', { name: 'Brief' }))).toEqual(['Brief', 'Notes', 'Set aside'])
  const brief = panel.getByRole('table', { name: 'Brief' })
  await expect(brief.locator('thead th')).toHaveText(['Part', 'Item', 'Who', 'Date', 'Source'])
  // Each part is named once, in the order a person reads before writing the next email.
  const parts = (await brief.locator('tbody td:first-child').allTextContents()).map(t => t.trim())
  expect(parts.filter((t, i) => parts.indexOf(t) === i)).toEqual(['Communicated', 'Client wish list', 'Known risks and success factors', 'Open questions', 'Next step'])
  await panel.getByRole('button', { name: 'Add note' }).click()
  const dialog = page.getByRole('dialog', { name: 'Note' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('combobox').locator('option')).toHaveText(['Client said', 'Insurer said', 'Client wish list', 'Known risks', 'Success factors', 'Open questions', 'Next step', 'Decisions', 'Hand-over'])
  await expect(dialog.getByRole('button', { name: 'Save note' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
})

/** An open renewal or new-quote case whose line of insurance has a document checklist. */
async function checklistCase(page: Page): Promise<string | null> {
  const rows = await dbRows<{ id: string }>('work_items?closed_at=is.null&case_type=in.(renewal,new_quote)&select=id&order=created_at.desc&limit=40')
  for (const { id } of rows) {
    const res = await page.request.get(`/api/work/${id}/brief`, { headers })
    if (res.ok() && (await res.json() as { checklist: { total: number } | null }).checklist?.total) return id
  }
  return null
}

test('CSE-019 a renewal or new quote lists the basic documents and its line’s under the brief, each required or optional', async ({ page }) => {
  const id = await checklistCase(page)
  test.skip(!id, 'no open renewal or new quote with a document listed')
  await openClean(page, `/today/${id}?section=brief`)
  const panel = page.getByRole('region', { name: 'Brief' })
  await expect(panel.getByRole('heading', { name: /^Documents( · \d+ of \d+ required)?$/ })).toBeVisible({ timeout: 30_000 })
  await expect(panel.getByRole('combobox', { name: 'Line of insurance' })).toBeVisible()
  const docs = panel.getByRole('table', { name: 'Documents' })
  await expect(docs.locator('thead th')).toHaveText(['Document', 'Need', 'Status', 'File', 'By', 'Action'])
  const needs = (await docs.locator('tbody td:nth-child(2)').allTextContents()).map(t => t.trim())
  expect(needs.length).toBeGreaterThan(0)
  for (const n of needs) expect(['Required', 'Optional']).toContain(n)
  const states = (await docs.locator('tbody td:nth-child(3)').allTextContents()).map(t => t.trim())
  for (const s of states) expect(['Missing', 'Found', 'Confirmed', 'Not needed']).toContain(s)
  // CSE-032: every file on the case's emails is listed, on a list or not.
  await expect(panel.getByRole('heading', { name: /^Files · \d+$/ })).toBeVisible()
  // Every document carries a person's call: confirm or not needed, or undo once called.
  await expect(docs.locator('tbody tr').first().getByRole('button').first()).toBeVisible()
})

test('CSE-020 a claim shows the brief and its files without a document checklist', async ({ page }) => {
  const [claim] = await dbRows<{ id: string }>('work_items?closed_at=is.null&case_type=eq.claim&select=id&order=created_at.desc&limit=1')
  test.skip(!claim, 'no open claim')
  await openClean(page, `/today/${claim.id}?section=brief`)
  const panel = page.getByRole('region', { name: 'Brief' })
  await expect(panel.getByRole('table', { name: 'Brief' })).toBeVisible({ timeout: 30_000 })
  await expect(panel.getByRole('table', { name: 'Documents' })).toHaveCount(0)
  await expect(panel.getByRole('combobox', { name: 'Line of insurance' })).toHaveCount(0)
  await expect(panel.getByRole('heading', { name: /^Files · \d+$/ })).toBeVisible()
})

test('CSE-021 Settings › Document checklists holds the basic list and one per line; Add document asks for its name, its need and how it is found', async ({ page }) => {
  await openClean(page, '/settings?section=checklists')
  const eb = page.getByRole('region', { name: 'Employment Benefits', exact: true })
  await expect(eb).toBeVisible({ timeout: 30_000 })
  await expect(eb.locator('thead th')).toHaveText(['Document', 'Need', 'Found by', 'File name says', 'Action'])
  const basic = page.getByRole('region', { name: 'Basic documents', exact: true })
  await expect(basic).toBeVisible()
  await expect(basic.getByRole('combobox', { name: /: required or optional$/ }).first()).toBeVisible()
  expect(await eb.locator('tbody tr').count()).toBeGreaterThan(0)
  await eb.getByRole('button', { name: 'Add document' }).click()
  const dialog = page.getByRole('dialog', { name: 'Document' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Save document' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
})
