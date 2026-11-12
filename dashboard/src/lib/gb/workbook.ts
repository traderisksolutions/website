/**
 * The house workbook: TRS EB Calculator (Nathan's), the product data the compare page prices from.
 * Rates (premium by insurer, cover, plan, age band, class, basis, employee or dependant), Lists (the
 * plans each insurer sells per cover, as the insurer names them) and BenefitData (what each plan
 * pays, row by row, with the brochure page it came from). Every row in it is read off the insurers'
 * brochures; the workbook is how TRS keeps them. It lives in the Pricing Matrix Drive folder
 * (_TRS workbooks) and is read into app_settings `gb_workbook` by importWorkbook.
 *
 * parseWorkbook is pure; tested in src/__tests__/gb-workbook.test.ts.
 */
import * as XLSX from 'xlsx'

export const PRODUCTS = ['Steadfast MCare+', 'RCC Enhanced III', 'Income FlexCare', 'Singlife MyBenefits Plus', 'AIA Flexi Vital Care Plus'] as const
export type Product = typeof PRODUCTS[number]
export const COVERS = ['Hospital & Surgical', 'Major Medical', 'Outpatient GP', 'Outpatient Specialist', 'Dental', 'Personal Accident'] as const
export type Cover = typeof COVERS[number]
export const MEDICAL: readonly string[] = ['Hospital & Surgical', 'Major Medical', 'Outpatient GP', 'Outpatient Specialist', 'Dental']

export type WbRate = { insurer: string; cover: string; plan: string; cls: string | null; renewalOnly: boolean; from: number; to: number; net: number; life: 'EE' | 'Dep' | null }
export type WbBenefit = { insurer: string; cover: string; plan: string; id: string; label: string; value: string; source: string | null }
export type Workbook = {
  file: { name: string; driveFileId: string | null; modifiedAt: string | null; readAt: string }
  rates: WbRate[]
  lists: Record<string, Record<string, string[]>>
  benefits: WbBenefit[]
}

const num = (v: unknown): number => typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.\-]/g, ''))

/** Reads the three source sheets. Pure. */
export function parseWorkbook(buf: Buffer, file: Omit<Workbook['file'], 'readAt'>): Workbook {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheet = (n: string) => { const s = wb.Sheets[n]; if (!s) throw new Error(`The workbook has no ${n} sheet`); return s }
  const rates: WbRate[] = (XLSX.utils.sheet_to_json(sheet('Rates')) as Record<string, unknown>[])
    .filter(r => r.Insurer && r.Coverage && r['Plan option'])
    .map(r => ({
      insurer: String(r.Insurer), cover: String(r.Coverage), plan: String(r['Plan option']),
      cls: r.Class && r.Class !== '—' ? String(r.Class) : null, renewalOnly: String(r.Basis) === 'Renewal',
      from: num(r.AgeFrom), to: num(r.AgeTo), net: num(r['Net premium']),
      life: (r.Life === 'EE' || r.Life === 'Dep' ? r.Life : null) as WbRate['life'],
    }))
    .filter(r => Number.isFinite(r.net) && Number.isFinite(r.from) && Number.isFinite(r.to))
  const head = XLSX.utils.sheet_to_json(sheet('Lists'), { header: 1 }) as unknown[][]
  const lists: Workbook['lists'] = {}
  ;(head[0] ?? []).forEach((h, i) => {
    const [ins, cov] = String(h ?? '').split(' | ')
    if (!ins || !cov) return
    const plans = head.slice(1).map(r => r[i]).filter((v): v is string | number => v != null && String(v).trim() !== '' && String(v) !== 'N/A').map(String)
    ;(lists[ins] ??= {})[cov] = plans
  })
  const benefits: WbBenefit[] = (XLSX.utils.sheet_to_json(sheet('BenefitData')) as Record<string, unknown>[])
    .filter(r => r.Insurer && r.Benefit_ID)
    .map(r => ({ insurer: String(r.Insurer), cover: String(r.Coverage), plan: String(r.Plan), id: String(r.Benefit_ID), label: String(r.Benefit_Label ?? r.Benefit_ID), value: String(r.Value ?? ''), source: r.Source ? String(r.Source) : null }))
  if (!rates.length || !Object.keys(lists).length || !benefits.length) throw new Error('The workbook is missing rates, plan lists or benefits')
  return { file: { ...file, readAt: new Date().toISOString() }, rates, lists, benefits }
}

const KEY = 'gb_workbook'
let cache: { at: number; wb: Workbook } | null = null

export async function loadWorkbook(): Promise<Workbook | null> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.wb
  const { sbTry } = await import('@/lib/crm/db')
  const [r] = await sbTry<{ value: string }[]>(`app_settings?key=eq.${KEY}&select=value&limit=1`, [])
  if (!r?.value) return null
  try { const wb = JSON.parse(r.value) as Workbook; cache = { at: Date.now(), wb }; return wb } catch { return null }
}

/** Reads the newest TRS EB Calculator in the Drive folder and stores it. */
export async function importWorkbook(): Promise<Workbook> {
  const { listSourceFiles, downloadSourceFile } = await import('./drive')
  const { sb } = await import('@/lib/crm/db')
  const files = (await listSourceFiles()).filter(f => /TRS EB Calculator/i.test(f.filename) && /xlsx$/i.test(f.filename))
    .sort((a, b) => (b.planYear ?? '').localeCompare(a.planYear ?? '') || b.filename.localeCompare(a.filename))
  const f = files[0]
  if (!f) throw new Error('No TRS EB Calculator workbook in the Drive folder')
  const wb = parseWorkbook(await downloadSourceFile(f.driveFileId), { name: f.filename, driveFileId: f.driveFileId, modifiedAt: f.modifiedAt })
  await sb('app_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify([{ key: KEY, value: JSON.stringify(wb), updated_at: new Date().toISOString() }]) })
  cache = { at: Date.now(), wb }
  return wb
}
