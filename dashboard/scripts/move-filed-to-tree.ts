/**
 * Moves every filed data-room document into the one filing tree (src/lib/filing/tree.ts):
 *
 *   <Group>/Policies/<2026–27 Goods in Transit · QBE>/<Cover>/<file>   (before, 20 Nov 2026)
 *   <Group>/<Line>/<2026–27 · QBE>/<Policy>/<file>                        (after)
 *
 * And the Employment Benefits folder a group's entity got of its own (<Entity>/Employment Benefits)
 * into the group's (<Group>/Employment Benefits). A move keeps the Drive file id, so every stored
 * link still opens. Nothing is deleted: emptied old folders stay, listed at the end. No model is called.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/move-filed-to-tree.ts                  # dry run: counts and a sample, no Drive writes
 *   npx tsx --tsconfig tsconfig.json scripts/move-filed-to-tree.ts --apply          # moves, 1 document a step, a pause between
 *   … --apply --limit 50 --from <document id> --pause 400
 *
 * Log (undo): ~/trs-move-filed-to-tree.jsonl, one line per move: document id, file id, old parents,
 * new parent. A rerun skips documents already logged.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { sbTry, enc } from '@/lib/crm/db'
import * as store from '@/lib/documents/store'
import { groupFolderName, moveDriveFile } from '@/lib/documents/drive'
import { filingPath, lineOfFiling, planYearOf, pathLabel } from '@/lib/filing/tree'
import { getDriveWriteToken, rootFolderId } from '@/lib/gdrive-write'
import { EB_SUBFOLDER } from '@/lib/company-drive'

const argv = process.argv.slice(2)
const arg = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }
const APPLY = argv.includes('--apply')
const LIMIT = Number(arg('--limit') ?? Infinity)
const FROM = arg('--from')
const PAUSE = Math.max(200, Number(arg('--pause') ?? 400))
const LOG = join(homedir(), 'trs-move-filed-to-tree.jsonl')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Doc = store.PolicyDocument
type Company = { id: string; company_name: string | null; parent_id: string | null }

async function all<T>(path: string): Promise<T[]> {
  const out: T[] = []
  for (let off = 0; ; off += 1000) {
    const page = await sbTry<T[]>(`${path}&limit=1000&offset=${off}`, [])
    out.push(...page)
    if (page.length < 1000) return out
  }
}

const logged = new Set<string>(existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map(l => (JSON.parse(l) as { document_id?: string }).document_id ?? '') : [])

async function documents() {
  const docs = await all<Doc>(`policy_documents?status=eq.filed&drive_file_id=not.is.null&company_id=not.is.null&select=*&order=id.asc${FROM ? `&id=gte.${enc(FROM)}` : ''}`)
  const policyIds = [...new Set(docs.map(d => d.policy_id).filter((x): x is string => !!x))]
  const policies = new Map<string, NonNullable<Awaited<ReturnType<typeof store.policy>>>>()
  for (let i = 0; i < policyIds.length; i += 100) {
    const rows = await sbTry<NonNullable<Awaited<ReturnType<typeof store.policy>>>[]>(`policies?id=in.(${policyIds.slice(i, i + 100).join(',')})&select=id,company_id,policy_number,cover_note_no,insurer,class_of_insurance,label,start_date,end_date,lifecycle,is_eb,product_line,line_code,drive_folder_url`, [])
    for (const p of rows) policies.set(p.id, p)
  }
  return { docs, policies }
}

const groups = new Map<string, string>()
async function groupOf(companyId: string, fallback: string): Promise<string> {
  if (!groups.has(companyId)) groups.set(companyId, await groupFolderName(companyId, fallback))
  return groups.get(companyId)!
}

async function moveDocuments() {
  const { docs, policies } = await documents()
  const todo = docs.filter(d => !logged.has(d.id)).slice(0, LIMIT)
  const companies = new Map((await all<Company>('companies?select=id,company_name,parent_id&order=id.asc')).map(c => [c.id, c]))
  const byPath = new Map<string, number>()
  let moved = 0, same = 0, failed = 0
  console.log(`${docs.length} filed documents; ${docs.length - todo.length} already moved (logged) or past --limit; ${todo.length} to place.`)
  for (const [i, d] of todo.entries()) {
    const c = companies.get(d.company_id!)
    const group = await groupOf(d.company_id!, (c?.company_name ?? '').trim() || 'Unnamed company')
    const policy = d.policy_id ? policies.get(d.policy_id) ?? null : null
    const path = filingPath({ group, policy, docType: d.doc_type })
    const top = path.slice(1, 3).join(' / ')
    byPath.set(top, (byPath.get(top) ?? 0) + 1)
    if (!APPLY) { if (i < 12) console.log(`  ${d.filename.slice(0, 50)} → ${pathLabel(path)}`); continue }
    try {
      const r = await moveDriveFile(d.drive_file_id!, { companyName: group, policy, doc: d })
      if (policy && r.policyFolderUrl) await store.patchPolicyFolder(policy.id, r.policyFolderUrl)
      await store.patchDocument(d.id, { line_code: policy ? lineOfFiling(policy) : null, plan_year: policy ? planYearOf(policy.start_date) : null })
      appendFileSync(LOG, JSON.stringify({ document_id: d.id, file_id: d.drive_file_id, from: r.from, to: r.to, at: new Date().toISOString() }) + '\n')
      if (r.moved) moved++; else same++
    } catch (e) {
      failed++
      console.log(`  failed ${d.id} (${d.filename.slice(0, 40)}): ${e instanceof Error ? e.message.slice(0, 160) : e}`)
      if (/40[13]|invalid_grant|rate/i.test(String(e))) { console.log('Stopping: Drive refused the credentials or the rate.'); break }
    }
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${todo.length}: moved ${moved}, in place ${same}, failed ${failed}; last ${d.id}`)
    await sleep(PAUSE)
  }
  console.log('\nBy line and plan year (top 25):')
  for (const [k, n] of [...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(n).padStart(5)}  ${k || '(group level)'}`)
  console.log(APPLY ? `\nMoved ${moved}, already in place ${same}, failed ${failed}. Log: ${LOG}` : `\nDRY RUN: ${todo.length} documents would be placed. Nothing written.`)
}

/** <Entity>/Employment Benefits → <Group>/Employment Benefits, for entities of a group. Folders are listed, never deleted. */
async function moveEbFolders() {
  const token = await getDriveWriteToken()
  const companies = await all<Company>('companies?parent_id=not.is.null&select=id,company_name,parent_id&order=id.asc')
  const q = async (query: string) => {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=200`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Drive list ${res.status}: ${(await res.text()).slice(0, 160)}`)
    return ((await res.json()) as { files?: { id: string; name: string }[] }).files ?? []
  }
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  let entities = 0, files = 0
  for (const c of companies) {
    const name = (c.company_name ?? '').trim()
    if (!name || c.parent_id === c.id) continue
    const group = await groupOf(c.id, name)
    if (group.toLowerCase() === name.toLowerCase()) continue
    const [own] = await q(`name = '${esc(name)}' and '${rootFolderId()}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)
    if (!own) continue
    const [eb] = await q(`name = '${EB_SUBFOLDER}' and '${own.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)
    if (!eb) continue
    const children = await q(`'${eb.id}' in parents and trashed = false`)
    entities++; files += children.length
    console.log(`  ${name}/Employment Benefits: ${children.length} item(s) → ${group}/Employment Benefits`)
    if (!APPLY || !children.length) continue
    const { findOrCreateFolder } = await import('@/lib/gdrive-write')
    const target = await findOrCreateFolder(EB_SUBFOLDER, await findOrCreateFolder(group, rootFolderId(), token), token)
    for (const ch of children) {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${ch.id}?addParents=${target}&removeParents=${eb.id}&supportsAllDrives=true`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { console.log(`    failed ${ch.name}: ${(await res.text()).slice(0, 160)}`); continue }
      appendFileSync(LOG, JSON.stringify({ eb_item: ch.id, name: ch.name, from: [eb.id], to: target, at: new Date().toISOString() }) + '\n')
      await sleep(PAUSE)
    }
  }
  console.log(`\nEmployment Benefits folders of group entities: ${entities} with ${files} item(s)${APPLY ? ' moved' : ' would move'}.`)
}

async function main() {
  console.log(APPLY ? 'APPLY: moving in Drive.' : 'DRY RUN: reading only.')
  await moveDocuments()
  await moveEbFolders()
}

main().catch(e => { console.error(e); process.exit(1) })
