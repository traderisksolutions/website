/**
 * The client summary of a case's comparison, rendered: the server half of compare-summary-pdf.tsx.
 * Built fresh from the saved comparison each time; nothing is stored here.
 */
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { registerPdfFonts } from '@/lib/pdf-fonts'
import { loadSummary } from './compare-store'
import { CompareSummaryDocument } from './compare-summary-pdf'
import type { SummaryModel } from './compare'

const slug = (t: string) => t.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'client'

/** Null until a person has saved the case's comparison. */
export async function buildCompareSummary(workItemId: string): Promise<{ model: SummaryModel; pdf: Buffer; filename: string } | null> {
  const model = await loadSummary(workItemId)
  if (!model) return null
  registerPdfFonts(join(process.cwd(), 'public', 'fonts'))
  const pdf = await renderToBuffer(createElement(CompareSummaryDocument, { m: model }) as never)
  return { model, pdf, filename: `Renewal-comparison-${slug(model.client)}.pdf` }
}
