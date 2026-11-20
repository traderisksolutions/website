/**
 * The typed database client (step 2 of the platform clean-up, 20 Nov 2026). Server-side only.
 *
 * `db.from('policies').select('id, end_date, companies!policies_company_id_fkey(company_name)')`
 * is checked at build time against src/lib/db/database.gen.ts (scripts/gen-db-types.mjs): an
 * unknown table, column or embed is a type error, and the row type follows the select. It runs
 * over the same PostgREST as `sb()`; the database has no public address, so a direct driver
 * (Drizzle) waits for the move to Cloud Run.
 *
 * `rows()` and `one()` throw on any error. Unlike `sbTry`, nothing turns a failed query into an
 * empty list: the policies list showed 0 of 350 for that reason (19 Nov 2026).
 */
import { PostgrestClient, type PostgrestError } from '@supabase/postgrest-js'
import { SB_URL } from '@/lib/sb'
import type { Database } from './database.gen'

let client: PostgrestClient<Database> | null = null

/** The client, made on first use so a build without the service key still compiles. */
export function db(): PostgrestClient<Database> {
  if (client) return client
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_KEY not set')
  client = new PostgrestClient<Database>(`${SB_URL}/rest/v1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal ?? AbortSignal.timeout(90_000) }),
  })
  return client
}

type Result<T> = { data: T | null; error: PostgrestError | null }

export class DbError extends Error {
  constructor(public readonly what: string, public readonly cause: PostgrestError) {
    super(`${what} failed: ${cause.message}${cause.code ? ` (${cause.code})` : ''}`)
  }
}

/** The rows of a query; throws on any error. `what` names the read in the message. */
export async function rows<T>(what: string, query: PromiseLike<Result<T[]>>): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new DbError(what, error)
  return data ?? []
}

/** One row or null (for `.maybeSingle()`); throws on any error. */
export async function one<T>(what: string, query: PromiseLike<Result<T>>): Promise<T | null> {
  const { data, error } = await query
  if (error) throw new DbError(what, error)
  return data
}
