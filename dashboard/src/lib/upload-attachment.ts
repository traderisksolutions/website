/**
 * Browser upload of an email attachment to Drive. First a resumable session (the file goes
 * straight to Google, any size); if the browser cannot reach it, a server upload for files under
 * 4 MB. Returns the reference the send route reads: `drivefile:<id>`.
 */
export async function uploadAttachment(file: File): Promise<string> {
  const type = file.type || 'application/octet-stream'
  const uu = await fetch('/api/email/attachments/upload-url', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, mime_type: type, size: file.size }),
  })
  const ud = await uu.json().catch(() => null) as { uploadUrl?: string } | null
  if (uu.ok && ud?.uploadUrl) {
    try {
      const up = await fetch(ud.uploadUrl, { method: 'PUT', headers: { 'Content-Type': type }, body: file })
      const meta = up.ok ? await up.json().catch(() => null) as { id?: string } | null : null
      if (meta?.id) return `drivefile:${meta.id}`
    } catch { /* fall through to the server upload */ }
  }
  if (file.size > 4_000_000) throw new Error(`Could not upload ${file.name}. Try again.`)
  const form = new FormData()
  form.set('file', file)
  const r = await fetch('/api/email/attachments/upload', { method: 'POST', body: form })
  const d = await r.json().catch(() => null) as { storage_url?: string; error?: string } | null
  if (!r.ok || !d?.storage_url) throw new Error(d?.error ?? `Upload failed for ${file.name}`)
  return d.storage_url
}
