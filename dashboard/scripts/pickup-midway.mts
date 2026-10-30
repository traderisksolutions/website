/**
 * Run the mid-way pickup on one client request thread, as the classifier would.
 *   dry   lists the insurer threads it would record (database only, no model call)
 *   run   the agent reads the whole thread and records the request (placement, dispatches, replies read)
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/pickup-midway.mts dry <thread_id> [project words]
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/pickup-midway.mts run <thread_id>
 */
import { sbTry } from '@/lib/crm/db'
import { priorInsurerThreads } from '@/lib/placement/adopt'
import { autoPlaceFromThread } from '@/lib/placement/auto'

const [cmd, id, ...words] = process.argv.slice(2)
const [t] = await sbTry<any[]>(`email_threads?id=eq.${id}&select=id,subject,gmail_thread_id,company_id,created_at,companies(company_name)`, [])
if (!t) { console.log('thread not found'); process.exit(1) }
if (cmd === 'dry') {
  const prior = await priorInsurerThreads({ thread: t, clientName: t.companies?.company_name ?? '', project: words.join(' ') || null })
  console.log(`${t.subject}\n${prior.length} insurer thread(s) would be recorded:`)
  for (const p of prior) console.log(`  ${p.insurer_name.padEnd(22)} sent ${p.trs_first_at.slice(0, 10)}  ${p.replies.length} repl${p.replies.length === 1 ? 'y' : 'ies'}  ${p.thread.subject}`)
} else if (cmd === 'run') {
  console.log(await autoPlaceFromThread(id))
}
