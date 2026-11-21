import { describe, expect, it } from 'vitest'
import { clientFolderOf, matchCompany, newFiles } from '@/lib/microsoft/watch-rules'
import { microsoftWatchOn } from '@/lib/microsoft/graph'

describe('Microsoft folder watch', () => {
  it('is off unless switched on and configured', () => {
    expect(microsoftWatchOn({})).toBe(false)
    expect(microsoftWatchOn({ MS_GRAPH: 'on' })).toBe(false)
    expect(microsoftWatchOn({ MS_GRAPH: 'on', MS_TENANT_ID: 't', MS_CLIENT_ID: 'c', MS_CLIENT_SECRET: 's', MS_WATCH_DRIVE_ID: 'd' })).toBe(true)
    expect(microsoftWatchOn({ MS_GRAPH: 'off', MS_TENANT_ID: 't', MS_CLIENT_ID: 'c', MS_CLIENT_SECRET: 's', MS_WATCH_DRIVE_ID: 'd' })).toBe(false)
  })

  it('keeps added and changed files, never folders or deletions', () => {
    const f = newFiles([
      { id: '1', name: 'census.xlsx', file: { mimeType: 'application/vnd.ms-excel' }, size: 10, parentReference: { path: '/drive/root:/TRS Clients/Brightwell' } },
      { id: '2', name: 'Brightwell', folder: {} },
      { id: '3', name: 'old.pdf', deleted: {} },
    ])
    expect(f.map(x => x.id)).toEqual(['1'])
  })

  it('the client is the first folder under the watched one, matched by name', () => {
    expect(clientFolderOf('/drive/root:/TRS%20Clients/Brightwell%20Logistics/2027', 'TRS Clients')).toBe('Brightwell Logistics')
    expect(clientFolderOf('/drive/root:/Brightwell', '')).toBe('Brightwell')
    const cos = [{ id: 'a', name: 'BRIGHTWELL LOGISTICS PTE. LTD.' }, { id: 'b', name: 'Harbour Foods' }, { id: 'c', name: 'Harbour Foods Pte Ltd' }]
    expect(matchCompany('Brightwell Logistics', cos)).toBe('a')
    expect(matchCompany('Harbour Foods', cos)).toBeNull()
    expect(matchCompany(null, cos)).toBeNull()
  })
})
