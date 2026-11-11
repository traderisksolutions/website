import { ingestAttachment } from '@/lib/documents/ingest'
import { unseenAttachments } from '@/lib/documents/store'
const rows = await unseenAttachments(20000)
console.log('unseen', rows.length)
let done = 0, filedLater = 0, ignored = 0, errors = 0
const queue = [...rows]
async function worker() {
  for (;;) {
    const a = queue.shift(); if (!a) return
    try {
      const d = await ingestAttachment(a.id, { file: false })
      if (d?.status === 'ignored') ignored++; else if (d) filedLater++
    } catch { errors++ }
    if (++done % 200 === 0) console.log(new Date().toISOString().slice(11, 19), done, 'docs', filedLater, 'ignored', ignored, 'errors', errors)
  }
}
await Promise.all(Array.from({ length: 6 }, worker))
console.log('DONE', done, 'docs', filedLater, 'ignored', ignored, 'errors', errors)
