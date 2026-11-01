/**
 * Server half of the renewal report: builds the model from a policy's pack, renders the PDF
 * with the brand fonts, and stores it. Only API routes and agents import this.
 */
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { registerPdfFonts } from '@/lib/pdf-fonts'
import { storeUpload } from '@/lib/storage/drive-upload'
import { getRenewalPack, type RenewalPack } from './index'
import { buildReportModel, type ReportModel } from './report-model'
import { RenewalReportDocument } from './report-pdf'

export const REPORT_FOLDER = 'renewal-reports'

export async function renderRenewalReportPdf(m: ReportModel): Promise<Buffer> {
  registerPdfFonts(join(process.cwd(), 'public', 'fonts'))
  return renderToBuffer(createElement(RenewalReportDocument, { m }) as never)
}

export function reportFilename(p: RenewalPack): string {
  const cls = (p.policy.class ?? p.policy.product_line ?? 'policy').replace(/[^A-Za-z0-9]+/g, ' ').trim()
  return `Renewal report - ${cls} - ${p.policy.policy_number ?? 'no number'} - ${p.as_of}.pdf`.replace(/\s+/g, ' ')
}

/** The pack has enough to report when its premium and period are on file. */
export function reportable(p: RenewalPack): { ok: true } | { ok: false; reason: string } {
  if (p.current.premium_inception == null) return { ok: false, reason: 'premium not on file: read from the schedule' }
  if (!p.policy.start_date || !p.policy.end_date) return { ok: false, reason: 'policy period not on file: read from the schedule' }
  return { ok: true }
}

export type BuiltReport = { pack: RenewalPack; model: ReportModel; pdf: Buffer; filename: string }

export async function buildRenewalReport(policyId: string, asOf?: string): Promise<BuiltReport | null> {
  const pack = await getRenewalPack(policyId, asOf)
  if (!pack) return null
  const model = buildReportModel(pack)
  const pdf = await renderRenewalReportPdf(model)
  return { pack, model, pdf, filename: reportFilename(pack) }
}

/** Stores the PDF and returns the reference a draft attachment and the send route can read. */
export async function storeRenewalReport(r: BuiltReport): Promise<string> {
  return storeUpload(REPORT_FOLDER, r.filename, 'application/pdf', r.pdf)
}
