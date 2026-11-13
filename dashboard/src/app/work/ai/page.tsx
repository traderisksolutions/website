'use client'

/**
 * Today › AI approvals: the work each AI agent holds, and a Run button per agent. Nothing an
 * agent reads with a model runs until a person presses Run here (src/lib/agent-tasks/approvals.ts,
 * src/lib/ai-gate.ts). Each run takes the oldest held tasks first, at most 25.
 */
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Btn, Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtDate } from '@/lib/format'

type Row = { agent: string; label: string; does: string; waiting: number; oldest: string | null }

export default function AiApprovalsPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [max, setMax] = useState(25)
  const [count, setCount] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/agent-tasks/approvals', { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? `Could not load (${r.status})`); return }
    setRows(d.agents); setMax(d.max ?? 25)
  }, [])
  useEffect(() => { void load() }, [load])

  async function run(agent: string) {
    const n = count[agent] ?? 10
    setBusy(agent); setError(null)
    try {
      const r = await fetch('/api/agent-tasks/approvals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent, count: n }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? `The run failed (${r.status})`); return }
      setResult(x => ({ ...x, [agent]: `${d.done} done${d.failed ? `, ${d.failed} failed` : ''}${d.other ? `, ${d.other} waiting on a person or skipped` : ''}` }))
      await load()
    } finally { setBusy(null) }
  }

  const total = rows?.reduce((a, r) => a + r.waiting, 0) ?? 0
  return (
    <div className="bg-white text-trs-ink">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-10 py-6 pb-20 min-w-0">
        <PageHeader title="AI approvals" meta={rows ? `${total} tasks held` : 'Loading…'} />
        {error && <p className="mt-4 text-[14px] text-trs-neg" role="alert">{error}</p>}
        {!rows && !error && <div className="mt-8"><Spinner label="Counting held work…" /></div>}
        {rows && (
          <div className="mt-6">
            <Register label="AI agents" minWidth={860} dense={false}>
              <RegisterHead><RegisterTh first>Agent</RegisterTh><RegisterTh align="right">Held</RegisterTh><RegisterTh>Oldest</RegisterTh><RegisterTh align="right">Run</RegisterTh><RegisterTh last /></RegisterHead>
              <tbody>
                {rows.map(r => (
                  <RegisterRow key={r.agent}>
                    <RegisterCell first nowrap={false} primary={r.label} secondary={r.does} />
                    <RegisterCell align="right">{r.waiting}</RegisterCell>
                    <RegisterCell>{r.oldest ? fmtDate(r.oldest) : '—'}</RegisterCell>
                    <RegisterCell align="right">
                      <select aria-label={`How many ${r.label} tasks to run`} value={count[r.agent] ?? 10} onChange={e => setCount(c => ({ ...c, [r.agent]: Number(e.target.value) }))} disabled={!r.waiting}
                        className="h-8 rounded-[7px] border border-trs-line-2 bg-white px-2 text-[13px]">
                        {[1, 5, 10, max].filter((v, i, a) => a.indexOf(v) === i).map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </RegisterCell>
                    <RegisterCell last>
                      <div className="flex items-center gap-3">
                        <Btn size="sm" level="secondary" loading={busy === r.agent} disabled={!!busy || !r.waiting} onClick={() => void run(r.agent)}>Run</Btn>
                        {result[r.agent] && <span className="text-[12.5px] text-trs-muted" role="status">{result[r.agent]}</span>}
                      </div>
                    </RegisterCell>
                  </RegisterRow>
                ))}
              </tbody>
            </Register>
          </div>
        )}
      </div>
    </div>
  )
}
