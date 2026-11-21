/**
 * The Microsoft folder watch, pure parts (docs/eb-v2.md P7, D4). Tested in microsoft-watch.test.ts.
 *
 *   newFiles(delta)          the files a Graph delta page adds or changes (no folders, no deletions)
 *   clientFolderOf(path)     the client folder a file sits in: the first folder under the watched one
 *   matchCompany(name, all)  the company that folder names, by normalised name; null when none or many
 */
export type DeltaItem = {
  id: string; name?: string; deleted?: object; folder?: object; file?: { mimeType?: string; hashes?: { sha256Hash?: string } }
  size?: number; lastModifiedDateTime?: string; parentReference?: { path?: string }
}

export type NewFile = { id: string; name: string; mimeType: string; size: number | null; modified: string | null; path: string }

export function newFiles(items: readonly DeltaItem[]): NewFile[] {
  return items.filter(i => !i.deleted && !i.folder && i.file && i.name).map(i => ({
    id: i.id, name: i.name!, mimeType: i.file?.mimeType ?? 'application/octet-stream', size: i.size ?? null,
    modified: i.lastModifiedDateTime ?? null, path: i.parentReference?.path ?? '',
  }))
}

/** "/drive/root:/TRS Clients/Brightwell Logistics/2027" under "TRS Clients" → "Brightwell Logistics". */
export function clientFolderOf(path: string, watched: string): string | null {
  const rel = decodeURIComponent(path).replace(/^.*?root:/, '').replace(/^\/+/, '')
  const base = watched.replace(/^\/+|\/+$/g, '')
  const rest = base && rel.toLowerCase().startsWith(base.toLowerCase()) ? rel.slice(base.length).replace(/^\/+/, '') : rel
  return rest.split('/').filter(Boolean)[0] ?? null
}

const norm = (s: string) => s.toLowerCase().replace(/\b(pte|ltd|limited|private|singapore|sg|the|group|holdings)\b/g, ' ').replace(/[^a-z0-9]+/g, '')

export function matchCompany(folder: string | null, companies: readonly { id: string; name: string }[]): string | null {
  if (!folder) return null
  const k = norm(folder)
  if (!k) return null
  const hits = companies.filter(c => norm(c.name) === k)
  return hits.length === 1 ? hits[0].id : null
}
