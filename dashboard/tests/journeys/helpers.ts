import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

/** Every place and tab in the top bar, read from the nav definition so a new tab is covered by default. */
export function navHrefs(): { title: string; href: string }[] {
  const src = readFileSync('src/components/nav/nav-sections.tsx', 'utf8')
  const out: { title: string; href: string }[] = []
  for (const m of src.matchAll(/\{\s*title:\s*'([^']+)',\s*href:\s*'([^']+)'/g)) out.push({ title: m[1], href: m[2] })
  return out
}

/** Opens a page and fails on a server error, an error screen or an uncaught script error. */
export async function openClean(page: Page, href: string) {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const res = await page.goto(href, { waitUntil: 'domcontentloaded' })
  expect(res?.status() ?? 0, `${href} status`).toBeLessThan(400)
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  await expect(page.getByText(/Application error|Something went wrong|Internal Server Error|Unhandled Runtime Error/i)).toHaveCount(0)
  expect(page.url(), `${href} redirected to login`).not.toContain('/login')
  expect(errors, `${href} script errors`).toEqual([])
}

/** A company id by name, read-only from the database (company search is a server action now). */
export async function companyId(_page: Page, name: string): Promise<string> {
  const rows = await dbRows<{ id: string }>(`companies?select=id&company_name=ilike.${encodeURIComponent(`*${name}*`)}&order=company_name.asc&limit=1`)
  expect(rows.length, `a company named like ${name}`).toBeGreaterThan(0)
  return rows[0].id
}

/** Rows straight from the database, read-only, for picking a record a journey can open. */
export async function dbRows<T>(path: string): Promise<T[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return []
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  return res.ok ? await res.json() as T[] : []
}
