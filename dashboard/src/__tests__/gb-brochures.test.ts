import { describe, it, expect } from 'vitest'
import { brochureRows } from '@/lib/gb/brochures'
import type { SourceFile } from '@/lib/gb/drive'

const f = (insurer: string, planYear: string | null, filename: string, kind: SourceFile['kind']): SourceFile => ({ driveFileId: filename, insurer, planYear, filename, mimeType: '', kind, bytes: null, md5: null, modifiedAt: null, webViewLink: `https://drive/${filename}` })

describe('brochureRows', () => {
  it('lists the five house products with the newest brochure and the rate file', () => {
    const rows = brochureRows([
      f('QBE Steadfast MCare+', '2026', 'Steadfast MCare+ Brochure V12.pdf', 'brochure'),
      f('QBE Steadfast MCare+', '2026', 'Steadfast Calculator v20052026.xlsx', 'calculator'),
      f('Income FlexCare', '2025', 'FlexCare 2025.pdf', 'brochure'),
      f('Income FlexCare', '2026', 'FlexCare 2026.pdf', 'brochure'),
      f('Cigna CCC 1.0', null, 'Cigna.pdf', 'brochure'),
    ])
    expect(rows.map(r => r.product)).toEqual(['RCC Enhanced III', 'Income FlexCare', 'Steadfast MCare+', 'Singlife MyBenefits Plus', 'AIA Flexi Vital Care Plus'])
    expect(rows[2].brochure?.name).toBe('Steadfast MCare+ Brochure V12.pdf')
    expect(rows[2].rates?.name).toBe('Steadfast Calculator v20052026.xlsx')
    expect(rows[1].brochure?.name).toBe('FlexCare 2026.pdf')
    expect(rows[0].brochure).toBeNull()
  })
})
