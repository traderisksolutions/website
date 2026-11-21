'use server'
/**
 * RoadPlus (21 Nov 2026): analytics, payments, a quote journey's events and Reconcile now. They
 * replace /api/roadplus/analytics, /payments, /journey and /reconcile. Each answers `configured`
 * as the route did, so the page can say when the RoadPlus database or site is not set up.
 */
import { staffAction } from '@/lib/auth/action'
import { rpConfigured, rpGet } from '@/lib/roadplus-db'
import { roadplusAnalytics } from '@/lib/roadplus/analytics-server'
import { roadplusPayments } from '@/lib/roadplus/payments-server'

export async function analytics() {
  return staffAction('roadplus analytics', async () => roadplusAnalytics())
}

export async function payments(q?: string | null) {
  return staffAction('roadplus payments', async () => roadplusPayments({ q }))
}

/** One journey by reference or policy, or the latest 50 failed steps. */
export async function journey(by: { ref?: string | null; policy_id?: string | null } = {}) {
  return staffAction('roadplus journey', async () => {
    if (!rpConfigured()) return { configured: false, rows: [] as unknown[] }
    const cols = 'id,journey_id,step,status,error,policy_id,quote_id,source,meta,created_at'
    const ref = by.ref?.trim(), policyId = by.policy_id?.trim()
    const path = ref ? `journey_events?select=${cols}&journey_id=eq.${encodeURIComponent(ref)}&order=created_at.asc`
      : policyId ? `journey_events?select=${cols}&policy_id=eq.${encodeURIComponent(policyId)}&order=created_at.asc`
      : `journey_events?select=${cols}&status=eq.fail&order=created_at.desc&limit=50`
    try { return { configured: true, rows: await rpGet(path) as unknown[] } }
    catch (e) { return { configured: true, rows: [] as unknown[], error: String(e) } }
  })
}

/** Asks the RoadPlus site to reconcile payments now (the same job its 5-minute schedule runs). */
export async function reconcileNow() {
  return staffAction('roadplus reconcile', async () => {
    const site = process.env.ROADPLUS_SITE_URL
    const secret = process.env.ROADPLUS_RECONCILE_SECRET || process.env.ROADPLUS_WEBHOOK_SECRET
    if (!site || !secret) return { configured: false, ok: false, error: 'Set ROADPLUS_SITE_URL and ROADPLUS_RECONCILE_SECRET on the dashboard.' }
    try {
      const res = await fetch(`${site.replace(/\/$/, '')}/api/reconcile`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store' })
      const data = await res.json().catch(() => ({})) as Record<string, unknown>
      return { configured: true, ok: res.ok, ...data }
    } catch (e) { return { configured: true, ok: false, error: String(e) } }
  })
}
