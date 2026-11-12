/** API gate and the census reader, called the way the app calls them. */
import { test, expect, request as pwRequest } from '@playwright/test'
import * as XLSX from 'xlsx'

test('an API call with no session is refused', async ({ baseURL }) => {
  const anon = await pwRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  const res = await anon.get('/api/companies?search=a')
  expect([401, 403]).toContain(res.status())
})

test('census upload reads every tab and counts employees and dependants', async ({ page }) => {
  const wb = XLSX.utils.book_new()
  const rows = (n: number, cat: string) => [['No.', 'Name', 'Relationship', 'Date of Birth', 'Gender', 'Category'], ...Array.from({ length: n }, (_, i) => [i + 1, `Person ${cat} ${i + 1}`, 'Employee', '1985-03-14', 'M', cat])]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows(4, 'Staff')), 'Staff')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...rows(2, 'Management'), [3, 'Spouse One', 'Spouse', '1987-01-02', 'F', 'Management']]), 'Management')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const res = await page.request.post('/api/group-benefits/census/read', { multipart: { file: { name: 'journey-census.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buf } } })
  expect(res.ok(), await res.text()).toBeTruthy()
  const d = await res.json() as { sheets: { sheet: string; employees: number; dependants: number }[] }
  expect(d.sheets.map(s => s.sheet)).toEqual(['Staff', 'Management'])
  expect(d.sheets.reduce((n, s) => n + s.employees, 0)).toBe(6)
  expect(d.sheets.reduce((n, s) => n + s.dependants, 0)).toBe(1)
})
