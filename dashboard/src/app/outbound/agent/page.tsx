'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bot, Trash2, Play, Calendar } from 'lucide-react'
import React from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

interface AgentEvent {
  step: number; status: 'running' | 'done' | 'error'
  message: string; count?: number; companiesFound?: number; leadsTotal?: number
}

interface Schedule {
  id: string; created_at: string; query: string; roles: string[]
  max_companies: number; frequency: 'daily' | 'weekly'; is_active: boolean
  last_run_at: string | null; next_run_at: string | null
  runs_count: number; leads_last: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const ALL_ROLES = ['CEO', 'CTO', 'Founder', 'CFO', 'COO', 'Head of Risk', 'Director', 'VP']
const STEP_ICONS: Record<number, string> = { 1: '🔍', 2: '🤖', 3: '🔗', 4: '✅' }

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#888',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 7,
  border: '1px solid #e5e5e5', background: '#fafafa', color: '#111',
  outline: 'none', boxSizing: 'border-box',
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [agentQuery,   setAgentQuery]   = useState('')
  const [agentRoles,   setAgentRoles]   = useState<string[]>(['CEO', 'CTO', 'Founder'])
  const [agentMaxCo,   setAgentMaxCo]   = useState(8)
  const [agentRunning, setAgentRunning] = useState(false)
  const [agentEvents,  setAgentEvents]  = useState<AgentEvent[]>([])
  const [agentDone,    setAgentDone]    = useState(false)
  const [schedules,    setSchedules]    = useState<Schedule[]>([])
  const [scheduling,   setScheduling]   = useState(false)
  const [schedFreq,    setSchedFreq]    = useState<'daily' | 'weekly'>('daily')

  const loadSchedules = useCallback(async () => {
    const res = await fetch('/api/outbound/schedules')
    if (res.ok) setSchedules(await res.json())
  }, [])

  useEffect(() => { loadSchedules() }, [loadSchedules])

  // ── Agent run ─────────────────────────────────────────────────────────────

  async function runAgent() {
    if (!agentQuery.trim()) return
    setAgentRunning(true); setAgentEvents([]); setAgentDone(false)
    try {
      const res = await fetch('/api/outbound/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: agentQuery, roles: agentRoles, maxCompanies: agentMaxCo }),
      })
      if (!res.body) return
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event: AgentEvent = JSON.parse(line.slice(6))
            setAgentEvents(prev => {
              const idx = prev.findIndex(e => e.step === event.step)
              if (idx >= 0) { const next = [...prev]; next[idx] = event; return next }
              return [...prev, event]
            })
            if (event.step === 4 && event.status === 'done') setAgentDone(true)
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e) {
      setAgentEvents(prev => [...prev, { step: -1, status: 'error', message: e instanceof Error ? e.message : 'Network error' }])
    } finally {
      setAgentRunning(false)
      loadSchedules()
    }
  }

  async function scheduleAgent() {
    if (!agentQuery.trim()) return
    setScheduling(true)
    try {
      await fetch('/api/outbound/schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: agentQuery, roles: agentRoles, maxCompanies: agentMaxCo, frequency: schedFreq }),
      })
      await loadSchedules()
    } finally { setScheduling(false) }
  }

  async function deleteSchedule(id: string) {
    await fetch('/api/outbound/schedules', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setSchedules(prev => prev.filter(s => s.id !== id))
  }

  async function toggleSchedule(id: string, is_active: boolean) {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_active } : s))
    await fetch('/api/outbound/schedules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active }) })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Left panel: config ── */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #e5e5e5', background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111', letterSpacing: '-0.02em' }}>AI Agent</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#aaa' }}>Natural language → LinkedIn leads</p>
        </div>

        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>

          {/* Query */}
          <div>
            <label style={labelStyle}>Target Query</label>
            <textarea
              value={agentQuery}
              onChange={e => setAgentQuery(e.target.value)}
              placeholder="e.g. early stage fintech startups in Singapore raising Series A"
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#aaa' }}>The AI will Google, extract companies, then find their key people on LinkedIn</p>
          </div>

          {/* Roles */}
          <div>
            <label style={labelStyle}>Target Roles</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ALL_ROLES.map(role => {
                const on = agentRoles.includes(role)
                return (
                  <button key={role} onClick={() => setAgentRoles(prev => on ? prev.filter(r => r !== role) : [...prev, role])} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 5, border: '1px solid', borderColor: on ? '#111' : '#e5e5e5', background: on ? '#111' : '#fff', color: on ? '#fff' : '#555', cursor: 'pointer' }}>
                    {role}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Max companies */}
          <div>
            <label style={labelStyle}>Max Companies — <span style={{ fontWeight: 400 }}>{agentMaxCo}</span></label>
            <input type="range" min={3} max={20} value={agentMaxCo} onChange={e => setAgentMaxCo(Number(e.target.value))} style={{ width: '100%' }} />
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#aaa' }}>~{agentMaxCo * (agentRoles.length * 2 + 2)} Netrows credits per run</p>
          </div>

          {/* Run now */}
          <button onClick={runAgent} disabled={agentRunning || !agentQuery.trim()} style={{ width: '100%', padding: '11px 0', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: agentRunning || !agentQuery.trim() ? '#d1d5db' : '#111', color: '#fff', cursor: agentRunning || !agentQuery.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Play size={14} />
            {agentRunning ? 'Agent running…' : 'Run Now'}
          </button>

          {/* Schedule */}
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <label style={labelStyle}>Schedule</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['daily', 'weekly'] as const).map(f => (
                <button key={f} onClick={() => setSchedFreq(f)} style={{ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 500, borderRadius: 6, border: '1px solid', borderColor: schedFreq === f ? '#111' : '#e5e5e5', background: schedFreq === f ? '#111' : '#fff', color: schedFreq === f ? '#fff' : '#555', cursor: 'pointer', textTransform: 'capitalize' }}>
                  {f}
                </button>
              ))}
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 11, color: '#aaa' }}>
              Runs automatically at 07:00 SGT {schedFreq === 'daily' ? 'every day' : 'every week'}
            </p>
            <button onClick={scheduleAgent} disabled={scheduling || !agentQuery.trim()} style={{ width: '100%', padding: '9px 0', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid #e5e5e5', background: '#fff', color: scheduling || !agentQuery.trim() ? '#bbb' : '#555', cursor: scheduling || !agentQuery.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Calendar size={13} />
              {scheduling ? 'Scheduling…' : 'Save Schedule'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Right panel: progress + schedules ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#f9f9f9' }}>

        {/* Progress */}
        {agentEvents.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#111' }}>Agent Progress</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 640 }}>
              {agentEvents.map((ev, i) => (
                <div key={i} style={{ background: '#fff', border: '1px solid', borderColor: ev.status === 'error' ? '#fecaca' : ev.status === 'done' ? '#bbf7d0' : '#e5e5e5', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>
                    {ev.status === 'error' ? '❌' : ev.status === 'done' ? (ev.step === 4 ? '🎉' : '✅') : (STEP_ICONS[ev.step] ?? '⟳')}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: ev.status === 'error' ? '#991b1b' : '#111' }}>{ev.message}</p>
                    {ev.status === 'running' && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#aaa' }}>In progress…</p>}
                  </div>
                  {(ev.count ?? ev.leadsTotal) !== undefined && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#555', background: '#f4f4f5', padding: '3px 10px', borderRadius: 6 }}>
                      {ev.leadsTotal ?? ev.count}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {agentDone && (
              <a href="/outbound/leads" style={{ display: 'inline-block', marginTop: 16, padding: '10px 22px', fontSize: 13, fontWeight: 600, borderRadius: 8, background: '#111', color: '#fff', textDecoration: 'none' }}>
                View Leads in CRM →
              </a>
            )}
          </div>
        )}

        {agentEvents.length === 0 && schedules.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50%', color: '#ccc', gap: 12 }}>
            <Bot size={48} strokeWidth={1} />
            <p style={{ margin: 0, fontSize: 14, color: '#bbb' }}>Enter a target query and run the agent, or save a schedule</p>
          </div>
        )}

        {/* Schedules */}
        {schedules.length > 0 && (
          <div>
            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#111' }}>
              Saved Schedules
              <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: '#aaa' }}>runs at 07:00 SGT</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 680 }}>
              {schedules.map(s => (
                <div key={s.id} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111', lineHeight: 1.4 }}>{s.query}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
                      {s.frequency} · {s.roles.join(', ')} · max {s.max_companies} companies
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#bbb' }}>
                      {s.runs_count} run{s.runs_count !== 1 ? 's' : ''}
                      {s.leads_last ? ` · ${s.leads_last} leads last run` : ''}
                      {s.last_run_at
                        ? ` · last ran ${new Date(s.last_run_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`
                        : ' · never run yet'}
                      {s.next_run_at ? ` · next ${new Date(s.next_run_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => toggleSchedule(s.id, !s.is_active)}
                      style={{ padding: '5px 12px', fontSize: 12, fontWeight: 500, borderRadius: 6, border: '1px solid', borderColor: s.is_active ? '#16a34a' : '#e5e5e5', background: s.is_active ? '#f0fdf4' : '#fff', color: s.is_active ? '#16a34a' : '#888', cursor: 'pointer' }}
                    >
                      {s.is_active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      onClick={() => deleteSchedule(s.id)}
                      style={{ padding: 7, borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
