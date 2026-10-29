import { describe, it, expect, vi, afterEach } from 'vitest'
import { attachmentRefBytes, driveWebLink, isCatchAllBody, isDeadStorageUrl, isDriveRef, requireRefBytes, NEVER_STORED } from '@/lib/storage/attachment-bytes'

afterEach(() => { vi.unstubAllGlobals() })

describe('stored-file references', () => {
  it('recognises the dead storage API and its catch-all body', () => {
    expect(isDeadStorageUrl('https://trs-api-1.run.app/storage/v1/object/group-benefits/a.pdf')).toBe(true)
    expect(isDeadStorageUrl('https://example.com/files/a.pdf')).toBe(false)
    expect(isCatchAllBody(Buffer.from('trs api'))).toBe(true)
    expect(isCatchAllBody(Buffer.from('%PDF-1.7 ...'))).toBe(false)
  })

  it('links drivefile refs to Drive and nothing else', () => {
    expect(isDriveRef('drivefile:abc123')).toBe(true)
    expect(isDriveRef('imports/x/a.pdf')).toBe(false)
    expect(driveWebLink('drivefile:abc123')).toBe('https://drive.google.com/file/d/abc123/view')
    expect(driveWebLink('company/DN260401.pdf')).toBeNull()
  })

  it('never returns the 7-byte body as file content', async () => {
    const fetchMock = vi.fn(async () => new Response('trs api', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await attachmentRefBytes('https://trs-api-1.run.app/storage/v1/object/x/a.pdf')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await attachmentRefBytes('https://example.com/a.pdf')).toBeNull()
    await expect(requireRefBytes('https://example.com/a.pdf')).rejects.toThrow(NEVER_STORED)
    await expect(requireRefBytes(null)).rejects.toThrow(NEVER_STORED)
  })
})
