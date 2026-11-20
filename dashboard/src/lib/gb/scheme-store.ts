/**
 * Reads and writes of the scheme file (eb_schemes, 20261121_v2_eb_schemes.sql). Server only.
 * `tables: false` before the migration, so /eb keeps working without it. No model.
 */
import { enc, sbTry } from '@/lib/crm/db'
import type { Member } from '@/lib/gb-quote'
import type { LastYear } from './last-year'
import { previousPlanYear } from './scheme'

export type SchemeFile = { name: string; attachment_id?: string | null }
export type Scheme = {
  id: string; company_id: string; plan_year: string; effective_date: string | null; basis: 'renewal' | 'new_business' | null; insurer: string | null
  census: { file: string; members: Member[] } | null; census_read_at: string | null; census_read_by: string | null
  last_year: LastYear | null; last_year_files: SchemeFile[]; last_year_read_at: string | null; last_year_read_by: string | null
  updated_at: string
}

const COLS = 'id,company_id,plan_year,effective_date,basis,insurer,census,census_read_at,census_read_by,last_year,last_year_files,last_year_read_at,last_year_read_by,updated_at'

export async function schemeTablesReady(): Promise<boolean> {
  return (await sbTry<unknown[] | null>('eb_schemes?select=id&limit=1', null)) !== null
}

export async function getScheme(companyId: string, planYear: string): Promise<Scheme | null> {
  return (await sbTry<Scheme[]>(`eb_schemes?company_id=eq.${enc(companyId)}&plan_year=eq.${enc(planYear)}&select=${COLS}&limit=1`, []))[0] ?? null
}

/** The newest plan year on file for the client. */
export async function latestScheme(companyId: string): Promise<Scheme | null> {
  return (await sbTry<Scheme[]>(`eb_schemes?company_id=eq.${enc(companyId)}&select=${COLS}&order=plan_year.desc&limit=1`, []))[0] ?? null
}

/** The plan year before this one, for the census changes. */
export async function previousScheme(companyId: string, planYear: string): Promise<Scheme | null> {
  const prev = previousPlanYear(planYear)
  return prev ? getScheme(companyId, prev) : null
}

export type SchemeWrite = {
  company_id: string; plan_year: string; effective_date?: string | null; basis?: 'renewal' | 'new_business' | null; insurer?: string | null
  census?: { file: string; members: Member[] } | null
  last_year?: LastYear | null; last_year_files?: SchemeFile[]
}

/** Upserts one plan year; only the parts given change. Returns the row. */
export async function saveScheme(w: SchemeWrite, by: string): Promise<Scheme | null> {
  const now = new Date().toISOString()
  const row: Record<string, unknown> = { company_id: w.company_id, plan_year: w.plan_year, updated_at: now }
  if (w.effective_date !== undefined) row.effective_date = w.effective_date
  if (w.basis !== undefined) row.basis = w.basis
  if (w.insurer !== undefined) row.insurer = w.insurer
  if (w.census !== undefined) Object.assign(row, { census: w.census, census_read_at: w.census ? now : null, census_read_by: w.census ? by : null })
  if (w.last_year !== undefined) Object.assign(row, { last_year: w.last_year, last_year_files: w.last_year_files ?? [], last_year_read_at: w.last_year ? now : null, last_year_read_by: w.last_year ? by : null })
  const rows = await sbTry<Scheme[]>(`eb_schemes?on_conflict=company_id,plan_year&select=${COLS}`, [], {
    method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row),
  })
  return rows[0] ?? null
}
