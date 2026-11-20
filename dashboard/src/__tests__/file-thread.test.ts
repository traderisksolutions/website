import { describe, expect, it } from 'vitest'
import { fileThread } from '@/lib/documents/file-thread'

describe('fileThread', () => {
  it('the document’s own thread first, then its attachment’s, the id’s attachment, the message’s', () => {
    expect(fileThread({ docThread: 'a', docAttachmentThread: 'b', messageThread: 'c' })).toBe('a')
    expect(fileThread({ docAttachmentThread: 'b', messageThread: 'c' })).toBe('b')
    expect(fileThread({ idAttachmentThread: 'd' })).toBe('d')
    expect(fileThread({ messageThread: 'c' })).toBe('c')
  })
  it('a document tied to no thread has none (unchanged access)', () => {
    expect(fileThread({})).toBeNull()
    expect(fileThread({ docThread: null, docAttachmentThread: null, messageThread: null })).toBeNull()
  })
})
