'use client'

/**
 * Phased "Run Analysis" modal — replaces the old single fire-and-wait request (which could
 * exceed serverless time limits on cases with many threads/attachments) with 3 small
 * requests, one per phase, driven by explicit buttons. Progress is persisted server-side
 * (nexus_analysis_runs) so reopening this modal on the same case resumes rather than
 * restarts, and a phase that's still `_running` server-side (e.g. the browser tab was
 * closed mid-call) is picked up by polling instead of silently re-triggering paid work.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

type PhaseStatus = 'pending' | 'running' | 'done' | 'failed'

type Phase1Preview = { stakeholders: number; timelineEvents: number; openQuestions: number; missingItems: number; caseSummary: string }
type Phase2Preview = { scenarios: number; nextSteps: number; briefs: number; reserveEstimate: string | null }

type RunSnapshot = {
  id: string
  status: string
  error_message: string | null
  instructions: string | null
  case_analysis_id: string | null
  preview1: Phase1Preview | null
  preview2: Phase2Preview | null
}

export function NexusPhasedAnalysisModal({
  caseId, userEmail, initialThreadIds, onClose, onComplete,
}: {
  caseId: string
  userEmail: string | null
  initialThreadIds?: string[] | null
  onClose: () => void
  onComplete: () => void
}) {
  const [runId, setRunId] = useState<string | null>(null)
  const [phase1Status, setPhase1Status] = useState<PhaseStatus>('pending')
  const [phase2Status, setPhase2Status] = useState<PhaseStatus>('pending')
  const [phase3Status, setPhase3Status] = useState<PhaseStatus>('pending')
  const [preview1, setPreview1] = useState<Phase1Preview | null>(null)
  const [preview2, setPreview2] = useState<Phase2Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [instructions, setInstructions] = useState('')
  const [checkingResume, setCheckingResume] = useState(true)
  const [resumed, setResumed] = useState(false)
  const completedRef = useRef(false)

  const applyRunSnapshot = useCallback((r: RunSnapshot) => {
    setPreview1(r.preview1)
    setPreview2(r.preview2)
    if (r.instructions) setInstructions(r.instructions)

    setPhase1Status(r.preview1 ? 'done' : r.status === 'phase1_running' ? 'running' : r.status === 'failed' ? 'failed' : 'pending')
    setPhase2Status(r.preview2 ? 'done' : r.status === 'phase2_running' ? 'running' : (r.status === 'failed' && r.preview1) ? 'failed' : 'pending')
    setPhase3Status(
      r.status === 'completed' ? 'done'
      : r.status === 'phase3_running' ? 'running'
      : (r.status === 'failed' && r.preview1 && r.preview2) ? 'failed'
      : 'pending'
    )
    setError(r.status === 'failed' ? (r.error_message ?? 'Analysis failed') : null)

    if (r.status === 'completed' && !completedRef.current) {
      completedRef.current = true
      onComplete()
    }
  }, [onComplete])

  // On open: resume an in-progress run for this case, if one exists.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/nexus/cases/${caseId}/analyze/run-status`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { run: null })
      .then((data: { run: RunSnapshot | null }) => {
        if (cancelled || !data.run) return
        setRunId(data.run.id)
        setResumed(true)
        applyRunSnapshot(data.run)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCheckingResume(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  // Poll while a phase is running without an active fetch in this tab driving it — covers
  // resuming into a `_running` state, where the original request that started it is gone.
  useEffect(() => {
    if (!runId) return
    const anyRunning = phase1Status === 'running' || phase2Status === 'running' || phase3Status === 'running'
    if (!anyRunning) return
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/nexus/cases/${caseId}/analyze/run-status?run_id=${runId}`, { cache: 'no-store' })
        if (!res.ok) return
        const data: { run: RunSnapshot | null } = await res.json()
        if (data.run) applyRunSnapshot(data.run)
      } catch { /* transient — try again next tick */ }
    }, 4000)
    return () => clearInterval(poll)
  }, [runId, phase1Status, phase2Status, phase3Status, caseId, applyRunSnapshot])

  const startPhase1 = useCallback(async () => {
    setPhase1Status('running'); setError(null)
    try {
      const res = await fetch(`/api/nexus/cases/${caseId}/analyze/phase1`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triggered_by: userEmail,
          ...(initialThreadIds && initialThreadIds.length > 0 ? { thread_ids: initialThreadIds } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Phase 1 failed')
      setRunId(data.run_id)
      setPreview1(data.preview)
      setPhase1Status('done')
    } catch (e) {
      setPhase1Status('failed')
      setError(e instanceof Error ? e.message : 'Phase 1 failed')
    }
  }, [caseId, userEmail, initialThreadIds])

  const startPhase2 = useCallback(async () => {
    if (!runId) return
    setPhase2Status('running'); setError(null)
    try {
      const res = await fetch(`/api/nexus/cases/${caseId}/analyze/phase2`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, ...(instructions.trim() ? { instructions: instructions.trim() } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Phase 2 failed')
      setPreview2(data.preview)
      setPhase2Status('done')
    } catch (e) {
      setPhase2Status('failed')
      setError(e instanceof Error ? e.message : 'Phase 2 failed')
    }
  }, [caseId, runId, instructions])

  const startPhase3 = useCallback(async () => {
    if (!runId) return
    setPhase3Status('running'); setError(null)
    try {
      const res = await fetch(`/api/nexus/cases/${caseId}/analyze/phase3`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Phase 3 failed')
      setPhase3Status('done')
      if (!completedRef.current) { completedRef.current = true; onComplete() }
    } catch (e) {
      setPhase3Status('failed')
      setError(e instanceof Error ? e.message : 'Phase 3 failed')
    }
  }, [caseId, runId, onComplete])

  const anyRunning = phase1Status === 'running' || phase2Status === 'running' || phase3Status === 'running'

  const phases = [
    { n: 1, label: 'Reading threads & synthesising evidence', status: phase1Status, start: startPhase1, cta: 'Start Analysis',
      unlocked: true },
    { n: 2, label: 'Strategic analysis — scenarios & next steps', status: phase2Status, start: startPhase2, cta: 'Run Strategy Analysis',
      unlocked: phase1Status === 'done' },
    { n: 3, label: 'Drafting emails & finalizing', status: phase3Status, start: startPhase3, cta: 'Draft Emails & Finalize',
      unlocked: phase2Status === 'done' },
  ] as const

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={anyRunning ? undefined : onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-[560px] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[--border-subtle] flex-shrink-0">
          <div>
            <h3 className="text-[13.5px] font-bold text-foreground">Run Analysis</h3>
            <p className="text-[10.5px] text-muted-foreground/60 mt-0.5">
              Runs in 3 short steps so one slow step can never time out the whole analysis.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-4"><X size={14} /></button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {checkingResume ? (
            <p className="text-[12px] text-muted-foreground italic">Checking for an in-progress analysis…</p>
          ) : (
            <>
              {resumed && (phase1Status !== 'pending') && (
                <div className="text-[11px] text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 rounded-lg px-3 py-2">
                  Resumed an analysis already in progress for this case.
                </div>
              )}

              {phases.map((p, i) => (
                <div key={p.n} className="flex flex-col gap-2 border border-[--border-subtle] rounded-xl p-3.5">
                  <div className="flex items-center gap-2.5">
                    <PhaseIcon status={p.status} />
                    <span className="text-[12px] font-semibold text-foreground flex-1">Phase {p.n} — {p.label}</span>
                    {p.status === 'pending' && p.unlocked && (
                      <button
                        onClick={p.start}
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity whitespace-nowrap"
                      >
                        {p.cta}
                      </button>
                    )}
                    {p.status === 'failed' && (
                      <button
                        onClick={p.start}
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-md border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors whitespace-nowrap"
                      >
                        Retry
                      </button>
                    )}
                  </div>

                  {p.n === 1 && preview1 && phase1Status === 'done' && (
                    <div className="text-[11px] text-muted-foreground pl-6">
                      {preview1.stakeholders} stakeholders · {preview1.timelineEvents} timeline events · {preview1.openQuestions} open questions · {preview1.missingItems} missing items
                      {preview1.caseSummary && <p className="mt-1 text-foreground/80 leading-relaxed">{preview1.caseSummary}</p>}
                    </div>
                  )}

                  {p.n === 1 && phase1Status === 'done' && phase2Status === 'pending' && (
                    <div className="pl-6 flex flex-col gap-1.5">
                      <label className="text-[10.5px] text-muted-foreground">Add steering instructions before running strategy (optional)</label>
                      <textarea
                        value={instructions}
                        onChange={e => setInstructions(e.target.value)}
                        placeholder="e.g. Focus on the coverage dispute with the insurer, not the client's outstanding documents."
                        rows={2}
                        className="text-[11.5px] border border-[--border-subtle] rounded-md px-2 py-1.5 bg-background outline-none resize-none"
                      />
                    </div>
                  )}

                  {p.n === 2 && preview2 && phase2Status === 'done' && (
                    <div className="text-[11px] text-muted-foreground pl-6">
                      {preview2.scenarios} scenarios · {preview2.nextSteps} next steps · {preview2.briefs} draft briefs
                      {preview2.reserveEstimate && <> · reserve est. {preview2.reserveEstimate}</>}
                    </div>
                  )}
                </div>
              ))}

              {error && (
                <div className="text-[11px] text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2">✗ {error}</div>
              )}

              {phase3Status === 'done' && (
                <button
                  onClick={onClose}
                  className="text-[12px] font-semibold px-4 py-2 rounded-md border border-border bg-background hover:bg-muted transition-colors self-end"
                >
                  Done
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function PhaseIcon({ status }: { status: PhaseStatus }) {
  if (status === 'running') return <Loader2 size={15} className="text-primary animate-spin flex-shrink-0" />
  if (status === 'done')    return <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0" />
  if (status === 'failed')  return <AlertCircle size={15} className="text-red-600 flex-shrink-0" />
  return <div className="w-[15px] h-[15px] rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
}
