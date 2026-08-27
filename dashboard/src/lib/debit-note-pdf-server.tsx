/**
 * Server-only half of debit-note-pdf.tsx — resolves the logo/PayNow-QR asset paths (filesystem
 * access, so this file must never be imported by a client component — see debit-note-pdf.tsx's
 * top comment for why that file has none of this) and renders the actual PDF buffer callers save/
 * download. Only ever import this from API routes.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { renderToBuffer } from '@react-pdf/renderer'
import { DebitNotePdfDocument, type DebitNotePdfData } from '@/lib/debit-note-pdf'

function assetPath(name: string): string | null {
  const p = join(process.cwd(), 'public', 'debit-note', name)
  return existsSync(p) ? p : null
}

/** Same existence check as the real renderer above, for the preview-context API route to report
 *  back to the client (which has no filesystem access of its own) — so the live preview shows
 *  the same logo/QR the real PDF does instead of always assuming neither exists. */
export function debitNoteAssetsPresent(): { hasLogo: boolean; hasQr: boolean } {
  return { hasLogo: !!assetPath('trs-logo.png'), hasQr: !!assetPath('paynow-qr.png') }
}

export async function renderDebitNotePdf(data: DebitNotePdfData): Promise<Buffer> {
  const logoSrc = assetPath('trs-logo.png')
  const qrSrc   = assetPath('paynow-qr.png')
  return renderToBuffer(<DebitNotePdfDocument data={data} logoSrc={logoSrc} qrSrc={qrSrc} />)
}
