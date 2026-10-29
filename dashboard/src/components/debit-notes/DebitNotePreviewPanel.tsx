'use client'

/**
 * Live preview of the debit note PDF the form will generate on Approve. The server renders it with
 * the same function that writes the real file (POST /api/debit-notes/preview), so the preview is
 * the document, byte for byte. Re-renders a moment after `data` stops changing.
 *
 * The browser no longer loads @react-pdf/renderer: it runs on the server only, where it is loaded
 * from node_modules (next.config serverExternalPackages).
 */
import { useEffect, useRef, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import type { DebitNotePdfData } from '@/lib/debit-note-pdf'

export function DebitNotePreviewPanel({ data }: {
  data: DebitNotePdfData | null
  /** Kept for callers; the server reads the logo and the PayNow QR from public/debit-note. */
  logoSrc?: string | null
  qrSrc?: string | null
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const key = data ? JSON.stringify(data) : ''

  useEffect(() => {
    if (!key) return
    const n = ++seq.current
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const res = await fetch('/api/debit-notes/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: JSON.parse(key) }) })
        if (n !== seq.current) return
        if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? `Preview failed (${res.status})`); return }
        const blob = await res.blob()
        setError(null)
        setUrl(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob) })
      } catch (e) {
        if (n === seq.current) setError(e instanceof Error ? e.message : 'Preview failed')
      } finally {
        if (n === seq.current) setBusy(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [key])

  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
        <FileText size={20} className="opacity-40" />
        <p className="text-[11.5px]">Fill in the insurer and premium to see a preview.</p>
      </div>
    )
  }
  return (
    <div className="relative h-full">
      {url && <iframe title="Debit note preview" src={`${url}#toolbar=0&navpanes=0`} className="w-full h-full rounded-lg bg-white border-0" />}
      {(busy || !url) && !error && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><Loader2 size={16} className="animate-spin" /></div>}
      {error && <p className="absolute bottom-2 left-3 m-0 text-[12px]" style={{ color: '#a1242f' }}>{error}</p>}
    </div>
  )
}
