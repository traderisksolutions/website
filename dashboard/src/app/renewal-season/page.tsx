'use client'

/**
 * Renewal Season: every policy ending from 30 days back to the end of the third month ahead, with
 * the renewal case that works it (src/lib/cases/season.ts). The work is by hand: start the case,
 * select the client's conversations, mark each as the client's or an insurer's, then the case's
 * wish list is typed and graded, the Brief holds the documents, and Compare opens the comparison.
 * No model is called.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Segmented, Spinner } from '@/components/crm/primitives'
import { PageHeader } from '@/components/page-header'
import { callApi, errText } from '@/components/placement/shared'
import { count } from '@/components/cases/shared'
import { CombineDialog } from '@/components/today/CombineDialog'
import { SeasonTable } from '@/components/season/SeasonTable'
import { ThreadPicker, type PickTarget } from '@/components/season/ThreadPicker'
import { WishListDialog } from '@/components/cases/WishListDialog'
import { fmtDate } from '@/lib/format'
import { LINE_GROUP_NAME, NO_DATE, OVERDUE, type LineGroup, type SeasonRow } from '@/lib/cases/season'
import type { SeasonView } from '@/lib/cases/season-store'

const ALL = 'all'
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-SG', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export default function RenewalSeasonPage() {
  const [view, setView] = useState<SeasonView | null>(null)
  const [month, setMonth] = useState(ALL)
  const [group, setGroup] = useState<LineGroup | typeof ALL>(ALL)
  const [starting, setStarting] = useState<string | null>(null)
  const [picking, setPicking] = useState<PickTarget | null>(null)
  const [combining, setCombining] = useState<{ threads: string[]; target: PickTarget } | null>(null)
  const [wishing, setWishing] = useState<{ id: string; title: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => callApi<SeasonView>('/api/renewal-season').then(setView).catch(e => setError(errText(e))), [])
  useEffect(() => { void load() }, [load])

  const rows = useMemo(() => view?.rows ?? [], [view])
  const inGroup = useMemo(() => rows.filter(r => group === ALL || r.group === group), [rows, group])
  const inMonth = useMemo(() => rows.filter(r => month === ALL || r.bucket === month), [rows, month])
  const shown = useMemo(() => inGroup.filter(r => month === ALL || r.bucket === month), [inGroup, month])

  const pick = (r: SeasonRow, caseId = r.case?.id) => { if (r.company_id && caseId) setPicking({ company_id: r.company_id, company: r.company, case_id: caseId, title: r.case?.title ?? r.policy?.name ?? null }) }
  async function start(r: SeasonRow) {
    if (!r.policy) return
    setStarting(r.key); setError(null)
    try {
      const d = await callApi<{ id: string }>('/api/renewal-season', { method: 'POST', body: { policy_id: r.policy.id } })
      await load()
      pick(r, d.id)
    } catch (e) { setError(errText(e)) } finally { setStarting(null) }
  }

  const policies = rows.filter(r => r.policy)
  return (
    <div className="px-4 md:px-8 py-6 mx-auto w-full min-w-0 max-w-[1280px]">
      <PageHeader className="mb-5" title="Renewal Season"
        meta={view ? `${count(policies.length, 'policy', 'policies')} · ${fmtDate(view.window.from)} to ${fmtDate(view.window.to)} · ${policies.filter(r => !r.case).length} without a case` : undefined}>
        <Segmented<string> value={month} onChange={setMonth} label="Month" options={[
          { value: ALL, label: 'All', count: inGroup.length },
          { value: OVERDUE, label: 'Overdue', count: inGroup.filter(r => r.bucket === OVERDUE).length },
          ...(view?.months ?? []).map(m => ({ value: m, label: monthName(m), count: inGroup.filter(r => r.bucket === m).length })),
          { value: NO_DATE, label: 'No date', count: inGroup.filter(r => r.bucket === NO_DATE).length },
        ]} />
        <Segmented<LineGroup | typeof ALL> value={group} onChange={setGroup} label="Line" options={[
          { value: ALL, label: 'All lines', count: inMonth.length },
          ...(Object.keys(LINE_GROUP_NAME) as LineGroup[]).map(g => ({ value: g, label: LINE_GROUP_NAME[g], count: inMonth.filter(r => r.group === g).length })),
        ]} />
      </PageHeader>

      {error && <p className="m-0 mb-3 text-[13.5px] text-trs-neg" role="alert">{error}</p>}
      {!view ? (error ? null : <Spinner label="Loading the renewals…" />) : <SeasonTable rows={shown} starting={starting} onStart={r => void start(r)} onPick={pick}
        onWishes={r => { if (r.case) setWishing({ id: r.case.id, title: [r.company, r.policy?.name ?? r.case.title].filter(Boolean).join(' · ') }) }} />}

      <ThreadPicker target={picking} today={view?.today ?? ''} onClose={() => setPicking(null)}
        onContinue={threads => { if (picking) setCombining({ threads, target: picking }); setPicking(null) }} />
      <CombineDialog threadIds={combining?.threads ?? null} presetCompany={combining?.target.company_id} presetCase={combining?.target.case_id}
        onClose={() => { setCombining(null); void load() }} />
      <WishListDialog caseId={wishing?.id ?? null} title={wishing?.title} onClose={() => { setWishing(null); void load() }} />
    </div>
  )
}
