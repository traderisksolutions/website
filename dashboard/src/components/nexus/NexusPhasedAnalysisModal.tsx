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
import { X, Loader2 } from 'lucide-react'
import { Btn, Chip, textareaCls } from '@/components/crm/primitives'

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
    { n: 1, label: 'Reading every email and attachment', status: phase1Status, start: startPhase1, cta: 'Start',
      unlocked: true, model: 'Gemini Flash', role: 'extracting the facts', secs: 45 },
    { n: 2, label: 'Judging the case — scenarios and next steps', status: phase2Status, start: startPhase2, cta: 'Run strategy',
      unlocked: phase1Status === 'done', model: 'Claude Opus', role: 'reading the same emails and deciding', secs: 80 },
    { n: 3, label: 'Writing the recommended emails', status: phase3Status, start: startPhase3, cta: 'Draft emails',
      unlocked: phase2Status === 'done', model: 'Gemini Flash', role: 'writing to the Opus brief', secs: 40 },
  ] as const

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(15,20,18,0.4)]"
      onClick={anyRunning ? undefined : onClose}
    >
      <div
        className="bg-white rounded w-full max-w-[600px] flex flex-col overflow-hidden max-h-[calc(90vh/var(--ui-zoom))] shadow-[var(--shadow-modal)] text-trs-ink"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Run analysis"
      >
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 flex-shrink-0">
          <h2 className="m-0 text-heading font-medium tracking-[-0.02em] text-trs-ink">Run analysis</h2>
          <Btn level="tertiary" size="xs" onClick={onClose} aria-label="Close" className="w-8 px-0 rounded-full">
            <X size={15} />
          </Btn>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-3 overflow-y-auto">
          {checkingResume ? (
            <p className="m-0 py-4 text-14 text-center text-trs-muted">Checking for an analysis in progress…</p>
          ) : (
            <>
              {resumed && (phase1Status !== 'pending') && (
                <p className="m-0 text-13 text-trs-muted">Resumed an analysis already in progress for this case.</p>
              )}

              {phases.map(p => (
                <div key={p.n} className="flex flex-col gap-2.5 rounded p-4 border border-trs-line">
                  <div className="flex items-center gap-3 flex-wrap">
                    <PhaseIcon status={p.status} />
                    <span className="text-14 font-medium flex-1 min-w-[200px] text-trs-ink">Phase {p.n}. {p.label}</span>
                    {p.status === 'done' && <Chip>Done</Chip>}
                    {p.status === 'failed' && <Chip>Failed</Chip>}
                    {p.status === 'pending' && p.unlocked && (
                      <Btn level="primary" onClick={p.start}>{p.cta}</Btn>
                    )}
                    {p.status === 'failed' && (
                      <Btn level="secondary" onClick={p.start}>Retry</Btn>
                    )}
                  </div>

                  {p.status === 'running' && <PhaseProgress seconds={p.secs} model={p.model} role={p.role} />}

                  {p.status !== 'running' && (
                    <p className="m-0 pl-7 text-13 text-trs-muted">{p.model} · {p.role}</p>
                  )}

                  {p.n === 1 && preview1 && phase1Status === 'done' && (
                    <div className="pl-7 text-13 text-trs-muted">
                      <span className="tabular-nums">{preview1.stakeholders} stakeholders · {preview1.timelineEvents} timeline events · {preview1.openQuestions} open questions · {preview1.missingItems} missing items</span>
                      {preview1.caseSummary && <p className="m-0 mt-1.5 text-14 leading-[1.6] text-trs-ink-2">{preview1.caseSummary}</p>}
                    </div>
                  )}

                  {p.n === 1 && phase1Status === 'done' && phase2Status === 'pending' && (
                    <label className="pl-7 flex flex-col gap-1.5">
                      <span className="text-12.5 text-trs-muted">Steering instructions for the strategy phase. Optional.</span>
                      <textarea
                        value={instructions}
                        onChange={e => setInstructions(e.target.value)}
                        placeholder="e.g. Focus on the coverage dispute with the insurer, not the client’s outstanding documents."
                        rows={2}
                        className={textareaCls}
                      />
                    </label>
                  )}

                  {p.n === 2 && preview2 && phase2Status === 'done' && (
                    <p className="m-0 pl-7 text-13 tabular-nums text-trs-muted">
                      {preview2.scenarios} scenarios · {preview2.nextSteps} next steps · {preview2.briefs} draft briefs
                      {preview2.reserveEstimate && <> · reserve estimate {preview2.reserveEstimate}</>}
                    </p>
                  )}
                </div>
              ))}

              {error && (
                <p className="m-0 rounded px-4 py-3 text-13.5 leading-[1.5] bg-trs-field text-trs-ink-2">{error}</p>
              )}

              {phase3Status === 'done' && (
                <div className="flex justify-end pt-1">
                  <Btn level="secondary" onClick={onClose}>Done</Btn>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Phase state marker: a spinner while running, a filled ink dot when done, a grey dot otherwise. */
function PhaseIcon({ status }: { status: PhaseStatus }) {
  if (status === 'running') return <Loader2 size={16} className="animate-spin flex-shrink-0 text-trs-muted" aria-label="Running" />
  return (
    <span
      className={`w-4 h-4 rounded-full flex-shrink-0 inline-flex items-center justify-center border-2 ${status === 'done' ? 'border-trs-ink bg-trs-ink' : 'border-trs-subtle bg-transparent'}`}
      aria-hidden
    />
  )
}

/**
 * A moving bar while a phase runs. There is no token-level progress to report from the model,
 * so this eases toward 95% over the phase's typical duration and finishes when the phase
 * actually does — honest about being an estimate, and it stops pretending near the end.
 */
function PhaseProgress({ seconds, model, role }: { seconds: number; model: string; role: string }) {
  const [pct, setPct] = useState(2)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const id = setInterval(() => {
      const s = (Date.now() - started) / 1000
      setElapsed(Math.floor(s))
      // Approaches 95 asymptotically, so it never stalls at 100 while still working.
      setPct(Math.min(95, 2 + 93 * (1 - Math.exp(-s / (seconds * 0.55)))))
    }, 250)
    return () => clearInterval(id)
  }, [seconds])

  const over = elapsed > seconds * 1.6

  return (
    <div className="pl-7 flex flex-col gap-1.5" role="status" aria-live="polite">
      <div className="h-0.5 rounded-full overflow-hidden bg-trs-line">
        <div className="h-full rounded-full transition-[width] duration-300 ease-out bg-trs-ink" style={{ width: `${pct}%` }} />{/* drift-ok: width from elapsed time */}
      </div>
      <p className="m-0 text-13 text-trs-muted">
        {model} · {role} · <span className="tabular-nums">{elapsed}s</span>
        {over && <span className="text-trs-subtle"> · longer than usual, still running</span>}
      </p>
    </div>
  )
}
