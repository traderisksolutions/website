/**
 * One-time log trim (20 Nov 2026); the admin sweep then does the same every day
 * (src/lib/maintenance/log-trim.ts). Code only, no model.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/trim-logs.ts            dry run (the default): counts only
 *   npx tsx --tsconfig tsconfig.json scripts/trim-logs.ts --apply    deletes and slims
 *
 * agent_tasks finished more than 30 days ago: deleted when the idem_key is dated, else slimmed
 * and kept (the key stops a duplicate). error_logs older than 90 days: deleted. gemini_usage_log
 * and audit_logs are never touched. The rows deleted are agent bookkeeping and error text, with
 * no undo: export them first if they are wanted (docs/database.md).
 */
import { trimCounts, trimLogs, TASK_DAYS, ERROR_DAYS } from '@/lib/maintenance/log-trim'

async function main() {
  const apply = process.argv.includes('--apply')
  const c = await trimCounts()
  console.log(`agent_tasks finished over ${TASK_DAYS} days ago: ${c.deleteTasks} to delete (dated key), ${c.slimTasks} to slim (key kept)`)
  console.log(`error_logs over ${ERROR_DAYS} days old: ${c.deleteErrors} to delete`)
  if (!apply) { console.log('DRY RUN: nothing written (pass --apply).'); return }
  console.log(JSON.stringify(await trimLogs()))
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
