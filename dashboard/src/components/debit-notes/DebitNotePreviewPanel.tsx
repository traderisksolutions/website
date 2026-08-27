'use client'

import dynamic from 'next/dynamic'
import { FileText, Loader2 } from 'lucide-react'
import { DebitNotePdfDocument, type DebitNotePdfData } from '@/lib/debit-note-pdf'

// @react-pdf/renderer's PDFViewer renders into an <iframe> and touches browser-only APIs —
// must load client-side only, or Next's SSR pass throws. DebitNotePdfDocument itself doesn't
// need this treatment (it's the same component already used server-side for the real PDF via
// renderToBuffer in the approve route) — only the viewer shell does.
const PDFViewer = dynamic(
  () => import('@react-pdf/renderer').then(m => m.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
      </div>
    ),
  },
)

/**
 * Live preview of the debit note PDF the review form will generate on Approve — reuses the exact
 * same DebitNotePdfDocument the server renders with renderToBuffer(), so this is never a
 * hand-maintained approximation that can drift from the real output. Re-renders whenever `data`
 * changes; the caller (BundleReviewCard) is responsible for debouncing so this doesn't rebuild
 * the PDF on every keystroke.
 */
export function DebitNotePreviewPanel({ data }: { data: DebitNotePdfData | null }) {
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
        <FileText size={20} className="opacity-40" />
        <p className="text-[11.5px]">Fill in the insurer and premium to see a preview.</p>
      </div>
    )
  }

  return (
    <PDFViewer width="100%" height="100%" showToolbar={false} className="rounded-lg">
      <DebitNotePdfDocument data={data} />
    </PDFViewer>
  )
}
