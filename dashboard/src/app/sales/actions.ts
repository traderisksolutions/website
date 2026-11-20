'use server'
/**
 * Sales enquiries (21 Nov 2026): the list per site and one enquiry with its edits. They replace
 * /api/sales/enquiries and /api/sales/enquiries/[id]. /api/sales/intake stays: the lead tool posts it.
 */
import { staffAction } from '@/lib/auth/action'
import { getIntake, intakeCounts, listIntakes, listSites, updateIntake } from '@/lib/intake/store'
import { logSalesEvent } from '@/lib/sales/events'

export async function enquiries(site?: string | null, filter: { status?: string; q?: string } = {}) {
  return staffAction('enquiries', async () => {
    const sites = await listSites()
    const key = sites.find(s => s.key === site)?.key ?? 'corpcover'
    const [rows, counts] = await Promise.all([listIntakes(key, { status: filter.status || undefined, q: filter.q || undefined }), intakeCounts()])
    return { site: key, sites, counts, rows }
  })
}

export async function enquiry(id: string) {
  return staffAction('enquiry', async () => {
    const intake = await getIntake(id)
    if (!intake) throw new Error('Not found')
    return { intake }
  })
}

export async function updateEnquiry(id: string, body: Record<string, unknown>) {
  return staffAction('update enquiry', async user => {
    const err = await updateIntake(id, body)
    if (err) throw new Error(err)
    await logSalesEvent({ kind: 'edited', actor: user.email, detail: { enquiry: id, ...body } })
    return { ok: true as const }
  })
}
